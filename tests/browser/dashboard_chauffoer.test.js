const { chromium } = require('playwright');
const path = require('path');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const BASE = 'https://vehgabygvxnkrqsoazfs.supabase.co';
const STORE = `${BASE}/storage/v1/object/public/fejlede-billeder/`;
const enc = s => STORE + encodeURIComponent(s);

// Bucket-indhold (navn, oprettet). Adan og Qaalid har begge rapport 1114.
const BUCKET = [
  ['1114__1790281237.jpg', 1], ['1114_adan_1790200000.jpg', 2], ['1114_adan_1790400000.jpg', 3],
  ['1114_qaalid_1790500000.jpg', 4], ['1001_Fuad.jpg', 0], ['1002_fuad.jpg', 0],
];
const STORAGE_200 = new Set(BUCKET.map(([n]) => enc(n)));

// Samme regler som SQL'en: egen driver_id (prio 1) før fil uden fører (prio 2), nyeste først
function hentBilleder(numre, chauffor) {
  const id = (chauffor || '').trim().toLowerCase();
  const best = {};
  for (const [name, ts] of BUCKET) {
    const [nr, drv] = name.split('_');
    if (!numre.includes(nr)) continue;
    const prio = id && drv === id ? 1 : drv === '' ? 2 : null;
    if (!prio) continue;
    const b = best[nr];
    if (!b || prio < b.prio || (prio === b.prio && ts > b.ts)) best[nr] = { name, prio, ts };
  }
  return Object.entries(best).map(([nr, b]) => ({ navn: b.name, slutrapport_nr: nr }));
}

const lon = (chauffor, udb) => ({ chauffor, regnskabsmaaned: '2026-09', antal_ture: 4, indkort_i_alt: 10000,
  overfort_i_alt: 10000, afregn_difference: 0, kontant_i_alt: 0, bro_faerge_i_alt: 0, model: '45%', andel_brutto: 4500, til_udbetaling: udb });
const ALLE = [lon('Fuad', 45170.00), lon('Adan', 47415.20), lon('Qaalid', 43805.76)];
const t = (id, nr, chauffor) => ({ id, dato: '2026-09-02', slutrapport_nr: nr, chauffor, indkort: 2500, overfort: 2500,
  kontant: 0, vagt_start: '06:00', vagt_slut: '14:00', billede_url: null, bekraeftet: false });
const TURE = [t('a1', '1001', 'Fuad'), t('b2', '1002', 'Fuad'), t('c3', '1003', 'Fuad'), t('e5', '1114', 'Adan'), t('q6', '1114', 'Qaalid')];

let failures = 0;
const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) failures++; };
const billedCalls = [];

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errs = [];
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push(e.message));
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(`${BASE}/rest/v1/rpc/`)) {
      const fn = url.split('/rpc/')[1];
      const body = JSON.parse(route.request().postData() || '{}');
      if (fn === 'hent_alle') return route.fulfill({ json: body.p_maaned ? ALLE.filter(r => r.regnskabsmaaned === body.p_maaned) : ALLE });
      if (fn === 'hent_ture') return route.fulfill({ json: TURE });
      if (fn === 'hent_fejlede') return route.fulfill({ json: [] });
      if (fn === 'hent_billeder') { billedCalls.push(body); return route.fulfill({ json: hentBilleder(body.p_numre || [], body.p_chauffor) }); }
      return route.fulfill({ status: 204, body: '' });
    }
    if (url.startsWith(STORE)) return STORAGE_200.has(url)
      ? route.fulfill({ status: 200, contentType: 'image/jpeg', body: PNG }) : route.fulfill({ status: 404, body: '{}' });
    if (url.startsWith('file://')) return route.continue();
    return route.fulfill({ status: 404, body: '' });
  });

  const cell = id => page.$eval(`#row-${id} td:nth-child(8)`, td => { const a = td.querySelector('a[data-lightbox]'); return a ? a.getAttribute('href') : td.textContent.trim(); });
  const vaelg = async d => { await page.selectOption('#driver', d); await page.waitForTimeout(600); };

  await page.goto('file://' + path.join(__dirname, '..', '..', 'site', 'dashboard.html') + '?k=test');
  await page.waitForSelector('#rapporter table');
  await page.waitForTimeout(600);

  check((await page.textContent('#lonBody')).includes('45.170,00'), 'Lønseddel loader uændret (Fuad 45.170,00)');
  check(billedCalls.at(-1).p_chauffor === 'Fuad', 'Dashboardet sender chaufføren med til hent_billeder (p_chauffor=Fuad)');
  check(await cell('a1') === enc('1001_Fuad.jpg'), 'Fuad 1001: ældste format findes stadig via navne-gæt');
  check(await cell('b2') === enc('1002_fuad.jpg'), 'Fuad 1002: små-bogstav-fil findes via navne-gæt');
  check(await cell('c3') === '–', 'Fuad 1003: intet billede -> "–"');

  await vaelg('Adan');
  check(billedCalls.at(-1).p_chauffor === 'Adan', 'Skift til Adan sender p_chauffor=Adan');
  check(await cell('e5') === enc('1114_adan_1790400000.jpg'), 'Adan 1114: egen fil, NYESTE af to');
  check((await page.textContent('#lonBody')).includes('47.415,20'), 'Adans lønseddel uændret (47.415,20)');

  await vaelg('Qaalid');
  check(await cell('q6') === enc('1114_qaalid_1790500000.jpg'), 'Qaalid 1114: sin egen fil, ikke Adans (samme nummer)');
  await page.click('#row-q6 button:has-text("Ret")');
  await page.click('#ret-q6 img.ret-billede');
  check(await page.getAttribute('#lightboxImg', 'src') === enc('1114_qaalid_1790500000.jpg'), 'Qaalid: sidepanel åbner Qaalids billede');

  check(errs.length === 0, 'Ingen JS-fejl' + (errs.length ? ': ' + errs.join(' | ') : ''));
  await browser.close();
  console.log(failures ? `\n${failures} FEJL` : '\nALLE TESTS BESTÅET');
  process.exit(failures ? 1 : 0);
})();
