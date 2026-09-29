const { chromium } = require('playwright');
const path = require('path');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const BASE = 'https://vehgabygvxnkrqsoazfs.supabase.co';
const STORE = `${BASE}/storage/v1/object/public/fejlede-billeder/`;
const EXISTING = new Set([
  STORE + '1001_Fuad.jpg',
  STORE + '1002_fuad.jpg',          // kun små bogstaver findes -> fallback
  'https://example.test/custom.jpg', // udfyldt billede_url
  'https://example.test/fejl-ok.jpg',
]);

const lon = (chauffor, udb) => ({ chauffor, regnskabsmaaned: '2026-09', antal_ture: 4, indkort_i_alt: 10000,
  overfort_i_alt: 10000, afregn_difference: 0, kontant_i_alt: 0, bro_faerge_i_alt: 0, model: '45%',
  andel_brutto: 4500, til_udbetaling: udb });
const ALLE = [lon('Fuad', 45170.00), lon('Adan', 47415.20)];
const TURE = [
  { id: 'a1', dato: '2026-09-02', slutrapport_nr: '1001', chauffor: 'Fuad', indkort: 2500, overfort: 2500, kontant: 0, vagt_start: '06:00', vagt_slut: '14:00', billede_url: null, bekraeftet: false },
  { id: 'b2', dato: '2026-09-03', slutrapport_nr: '1002', chauffor: 'Fuad', indkort: 2600, overfort: 2600, kontant: 0, vagt_start: '06:00', vagt_slut: '14:00', billede_url: null, bekraeftet: false },
  { id: 'c3', dato: '2026-09-04', slutrapport_nr: '1003', chauffor: 'Fuad', indkort: 2400, overfort: 2400, kontant: 0, vagt_start: '06:00', vagt_slut: '14:00', billede_url: null, bekraeftet: true },
  { id: 'd4', dato: '2026-09-05', slutrapport_nr: '1004', chauffor: 'Fuad', indkort: 2500, overfort: 2500, kontant: 0, vagt_start: '22:00', vagt_slut: '06:00', billede_url: 'https://example.test/custom.jpg', bekraeftet: false },
];
const FEJL = [
  { id: 'f1', status: 'ny', chauffor: 'Adan', modtaget: '2026-09-20T20:00:00Z', fejl_besked: 'OCR fejlede', billede_url: 'https://example.test/fejl-mangler.jpg' },
  { id: 'f2', status: 'ny', chauffor: 'Qaalid', modtaget: '2026-09-21T20:00:00Z', fejl_besked: 'OCR fejlede', billede_url: 'https://example.test/fejl-ok.jpg' },
];

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(e.message));
  let dialogs = 0; page.on('dialog', d => { dialogs++; d.dismiss(); });

  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(`${BASE}/rest/v1/rpc/`)) {
      const fn = url.split('/rpc/')[1];
      const body = JSON.parse(route.request().postData() || '{}');
      if (fn === 'hent_alle') return route.fulfill({ json: body.p_maaned ? ALLE.filter(r => r.regnskabsmaaned === body.p_maaned) : ALLE });
      if (fn === 'hent_ture') return route.fulfill({ json: TURE });
      if (fn === 'hent_fejlede') return route.fulfill({ json: FEJL });
      if (fn === 'saet_bekraeftet') return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ json: [] });
    }
    if (url.startsWith(STORE) || url.startsWith('https://example.test/')) {
      return EXISTING.has(url) ? route.fulfill({ status: 200, contentType: 'image/jpeg', body: PNG })
                               : route.fulfill({ status: 404, contentType: 'application/json', body: '{"error":"not_found"}' });
    }
    if (url.startsWith('file://')) return route.continue();
    return route.fulfill({ status: 404, body: '' });
  });

  await page.goto('file://' + path.join(__dirname, '..', '..', 'site', 'dashboard.html') + '?k=test');
  await page.waitForSelector('#rapporter table');
  await page.waitForTimeout(500); // lad billed-probes blive færdige

  // 1) Lønseddel + overblik + tabel loader
  const lonTxt = await page.textContent('#lonBody');
  check(lonTxt.includes('TIL UDBETALING') && lonTxt.includes('45.170,00'), 'Lønseddel loader med uændret beløb (45.170,00)');
  check((await page.$$('#overblik tr')).length === 4, 'Overblik: 2 chauffører + header + total');
  check((await page.$$('#rapporter tr[id^="row-"]')).length === 4, 'Slutrapport-tabel har 4 rækker');

  // 2) Billed-links
  const href = id => page.$eval(`#row-${id} td:nth-child(8)`, td => { const a = td.querySelector('a[data-lightbox]'); return a ? a.getAttribute('href') : td.textContent.trim(); });
  check(await href('a1') === STORE + '1001_Fuad.jpg', 'a1: link bygget ud fra slutrapport_nr + chauffor');
  check(await href('b2') === STORE + '1002_fuad.jpg', 'b2: fald tilbage til små bogstaver når "Fuad" ikke findes');
  check(await href('c3') === '–', 'c3: intet billede (404) -> "–", intet brudt ikon');
  check(await href('d4') === 'https://example.test/custom.jpg', 'd4: udfyldt billede_url bruges først');
  const broken = await page.$$eval('#rapporter img', imgs => imgs.filter(i => i.complete && i.naturalWidth === 0).length);
  check(broken === 0, 'Ingen brudte <img> i tabellen/Ret-panelerne');

  // 3) Url-encoding og normalisering
  const k = await page.evaluate(() => [billedKandidater({ slutrapport_nr: ' 77 ', chauffor: '  Ali  Hassan ' }), billedKandidater({ slutrapport_nr: '5', chauffor: 'Søren' })]);
  check(k[0].includes(BILLED(`77_Ali%20%20Hassan.jpg`)) && k[0].includes(BILLED('77_Ali%20Hassan.jpg')) && k[0].includes(BILLED('77_ali%20%20hassan.jpg')), 'Navn med mellemrum: trimmet, url-encodet, varianter med samlet mellemrum og små bogstaver');
  check(k[1][0] === BILLED('5_S%C3%B8ren.jpg'), 'Specialtegn (ø) url-encodes korrekt');
  function BILLED(f) { return STORE + f; }

  // 4) Ret-panel viser billede ved siden af felterne; sidepanel dækker ikke felterne
  await page.click('#row-a1 button:has-text("Ret")');
  check(await page.isVisible('#ret-a1 img.ret-billede'), 'Ret-panel (a1) viser billedet ved siden af felterne');
  check(await page.isVisible('#ret-c3 .ret-billede-empty') === false && (await page.textContent('#ret-c3')).includes('Intet billede'), 'Ret-panel (c3) viser "Intet billede"');
  await page.click('#ret-a1 img.ret-billede');
  check(await page.isVisible('#lightbox') && await page.evaluate(() => document.body.classList.contains('lb-open')), 'Klik på billedet åbner sidepanelet');
  check((await page.textContent('#lightboxTitel')).includes('slutrapport 1001'), 'Sidepanel viser hvilken slutrapport det er');
  await page.click('#ret-ind-a1');           // fejler hvis sidepanelet dækker feltet
  await page.fill('#ret-ind-a1', '2555.50');
  check(await page.inputValue('#ret-ind-a1') === '2555.50', 'Ret-felt kan redigeres mens billedet er åbent');
  await page.dblclick('#lbStage');
  check((await page.textContent('#lbZoom')) === '250%', 'Dobbeltklik på billedet i panelet zoomer');
  await page.keyboard.press('Escape');
  check(!(await page.isVisible('#lightbox')), 'Escape lukker panelet');
  await page.click('#row-d4 a[data-lightbox]');
  check(await page.getAttribute('#lightboxImg', 'src') === 'https://example.test/custom.jpg', '"📷 Se" i tabellen åbner panelet med rigtigt billede');
  await page.click('#lightbox button:has-text("Luk")');

  // 5) Fejlede uploads
  await page.waitForTimeout(300);
  const fejl = await page.$$eval('#fejlListe > div', ds => ds.map(d => { const w = d.querySelector('img')?.parentElement; return w ? getComputedStyle(w).display : 'none'; }));
  check(fejl[0] === 'none' && fejl[1] !== 'none', 'Fejlede uploads: 404-billede skjules, fundet billede vises med 📷 Se');

  // 6) Eksisterende rettelse: flueben med tomt svar giver ingen falsk fejl
  await page.check('#row-a1 input[type=checkbox]');
  await page.waitForTimeout(200);
  check(dialogs === 0, 'Bekræftet-flueben med tomt svar giver ingen fejl-alert');

  check(consoleErrors.length === 0, 'Ingen JS-fejl i konsollen' + (consoleErrors.length ? ': ' + consoleErrors.join(' | ') : ''));
  await browser.close();
  console.log(failures ? `\n${failures} FEJL` : '\nALLE TESTS BESTÅET');
  process.exit(failures ? 1 : 0);
})();
