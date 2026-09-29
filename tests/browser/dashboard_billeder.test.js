const { chromium } = require('playwright');
const path = require('path');

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const BASE = 'https://vehgabygvxnkrqsoazfs.supabase.co';
const STORE = `${BASE}/storage/v1/object/public/fejlede-billeder/`;
const enc = s => STORE + encodeURIComponent(s);

// Faktiske filer i bucket'en (200). Bemærk 1114: fuldt førernavn, ikke DB-chaufføren "Adan".
const STORAGE_200 = new Set([
  STORE + '1001_Fuad.jpg',
  STORE + '1002_fuad.jpg',
  enc('1114_Adan abdi Abdulle.jpg'),
  'https://example.test/custom.jpg',
]);
// Hvad hent_billeder-RPC'en returnerer (owner-gated liste af filnavne)
const BUCKET_NAMES = ['1001_Fuad.jpg', '1002_fuad.jpg', '1114_Adan abdi Abdulle.jpg'];

const lon = (chauffor, udb) => ({ chauffor, regnskabsmaaned: '2026-09', antal_ture: 4, indkort_i_alt: 10000,
  overfort_i_alt: 10000, afregn_difference: 0, kontant_i_alt: 0, bro_faerge_i_alt: 0, model: '45%',
  andel_brutto: 4500, til_udbetaling: udb });
const ALLE = [lon('Fuad', 45170.00), lon('Adan', 47415.20)];
const t = (id, nr, chauffor, billede_url = null) => ({ id, dato: '2026-09-02', slutrapport_nr: nr, chauffor,
  indkort: 2500, overfort: 2500, kontant: 0, vagt_start: '06:00', vagt_slut: '14:00', billede_url, bekraeftet: false });
const TURE = [
  t('a1', '1001', 'Fuad'),
  t('b2', '1002', 'Fuad'),
  t('c3', '1003', 'Fuad'),
  t('d4', '1004', 'Fuad', 'https://example.test/custom.jpg'),
  t('e5', '1114', 'Adan'),   // fil hedder "1114_Adan abdi Abdulle.jpg"
];

const mode = { rpcBilleder: true, retSupportsNr: true };
const retBodies = [];

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

async function makeRoutes(page) {
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(`${BASE}/rest/v1/rpc/`)) {
      const fn = url.split('/rpc/')[1];
      const body = JSON.parse(route.request().postData() || '{}');
      if (fn === 'hent_alle') return route.fulfill({ json: body.p_maaned ? ALLE.filter(r => r.regnskabsmaaned === body.p_maaned) : ALLE });
      if (fn === 'hent_ture') return route.fulfill({ json: TURE });
      if (fn === 'hent_fejlede') return route.fulfill({ json: [] });
      if (fn === 'hent_billeder') {
        if (!mode.rpcBilleder) return route.fulfill({ status: 404, contentType: 'application/json', body: '{"code":"PGRST202"}' });
        const wanted = new Set(body.p_numre || []);
        const rows = BUCKET_NAMES.filter(n => wanted.has(n.split('_')[0])).map(navn => ({ navn }));
        return route.fulfill({ json: rows });
      }
      if (fn === 'ret_slutrapport') {
        retBodies.push(body);
        if (!mode.retSupportsNr && Object.prototype.hasOwnProperty.call(body, 'p_slutrapport_nr'))
          return route.fulfill({ status: 404, contentType: 'application/json', body: '{"code":"PGRST202"}' });
        return route.fulfill({ status: 204, body: '' });
      }
      if (fn === 'saet_bekraeftet') return route.fulfill({ status: 204, body: '' });
      return route.fulfill({ json: [] });
    }
    if (url.startsWith(STORE) || url.startsWith('https://example.test/')) {
      return STORAGE_200.has(url) ? route.fulfill({ status: 200, contentType: 'image/jpeg', body: PNG })
                                  : route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    }
    if (url.startsWith('file://')) return route.continue();
    return route.fulfill({ status: 404, body: '' });
  });
}

async function load(page, driver) {
  await page.goto('file://' + path.join(__dirname, '..', '..', 'site', 'dashboard.html') + '?k=test');
  await page.waitForSelector('#rapporter table');
  if (driver) { await page.selectOption('#driver', driver); await page.waitForTimeout(100); }
  await page.waitForTimeout(500);
}

const cellText = (page, id, col) => page.$eval(`#row-${id} td:nth-child(${col})`, td => {
  const a = td.querySelector('a[data-lightbox]'); return a ? a.getAttribute('href') : td.textContent.trim();
});

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) consoleErrors.push(m.text()); });
  page.on('pageerror', e => consoleErrors.push(e.message));
  const dialogs = []; page.on('dialog', d => { dialogs.push(d.message()); d.dismiss(); });
  await makeRoutes(page);

  // ===== FASE 1: RPC til stede, ret_slutrapport understøtter nr =====
  mode.rpcBilleder = true; mode.retSupportsNr = true;
  await load(page, 'Fuad');

  check((await page.textContent('#lonBody')).includes('45.170,00'), 'Lønseddel loader uændret (45.170,00)');
  check((await page.$$('#rapporter tr[id^="row-"]')).length === 4, 'Tabel har 4 rækker for valgt chauffør (Fuad)');
  check(await cellText(page, 'a1', 8) === STORE + '1001_Fuad.jpg', 'a1: billede fra RPC-opslag');
  check(await cellText(page, 'b2', 8) === STORE + '1002_fuad.jpg', 'b2: RPC finder små-bogstav-filen');
  check(await cellText(page, 'c3', 8) === '–', 'c3: intet billede -> "–"');
  check(await cellText(page, 'd4', 8) === 'https://example.test/custom.jpg', 'd4: billede_url bruges først');

  // Ret-panel: nyt "Slutrapport nr"-felt prefills og gemmes
  await page.click('#row-a1 button:has-text("Ret")');
  check(await page.isVisible('#ret-nr-a1'), 'Ret-panel har "Slutrapport nr"-felt');
  check(await page.inputValue('#ret-nr-a1') === '1001', 'Slutrapport nr er prefilled (1001)');
  retBodies.length = 0;
  await page.fill('#ret-nr-a1', '1091');       // ret fejllæst nummer
  await page.fill('#ret-ind-a1', '2600');
  await page.click('#ret-a1 button:has-text("Gem")');
  await page.waitForTimeout(300);
  const b = retBodies.find(x => x.p_id === 'a1');
  check(b && b.p_slutrapport_nr === '1091', 'Gem sender p_slutrapport_nr = 1091 til ret_slutrapport');
  check(b && b.p_indkort === 2600, 'Gem sender også de øvrige felter (indkort 2600)');
  check(dialogs.length === 0, 'Ingen fejl-alert når nr understøttes');

  // Adan/1114: fil hedder fuldt navn "1114_Adan abdi Abdulle.jpg" — matches via NUMMER
  await page.selectOption('#driver', 'Adan');
  await page.waitForTimeout(500);
  check(await cellText(page, 'e5', 8) === enc('1114_Adan abdi Abdulle.jpg'), 'e5: fuldt førernavn i filnavn rammes via slutrapport_nr');
  await page.click('#row-e5 button:has-text("Ret")');
  check(await page.isVisible('#ret-e5 img.ret-billede'), 'e5: billedet vises i Ret-panelet trods navne-mismatch');
  await page.click('#ret-e5 img.ret-billede');
  check(await page.getAttribute('#lightboxImg', 'src') === enc('1114_Adan abdi Abdulle.jpg'), 'e5: sidepanel åbner det rigtige billede');
  await page.click('#lightbox button:has-text("Luk")');

  // ===== FASE 2: RPC 404 (ikke deployet) + ret_slutrapport uden nr =====
  mode.rpcBilleder = false; mode.retSupportsNr = false;
  dialogs.length = 0;
  await load(page, 'Fuad');
  check(await cellText(page, 'a1', 8) === STORE + '1001_Fuad.jpg', 'Fallback: a1 rammes stadig via navne-gæt når RPC mangler');

  // ret_slutrapport uden nr-støtte: tallene gemmes stadig, nummer-advarsel vises
  await page.click('#row-a1 button:has-text("Ret")');
  retBodies.length = 0;
  await page.fill('#ret-nr-a1', '1091');
  await page.fill('#ret-ovf-a1', '2400');
  await page.click('#ret-a1 button:has-text("Gem")');
  await page.waitForTimeout(300);
  check(retBodies.length === 2, 'Ved 404 forsøges igen uden p_slutrapport_nr (2 kald)');
  check(retBodies[0].hasOwnProperty('p_slutrapport_nr') && !retBodies[1].hasOwnProperty('p_slutrapport_nr'), 'Andet kald udelader p_slutrapport_nr');
  check(retBodies[1].p_overfort === 2400, 'De øvrige felter (overfort 2400) gemmes alligevel');
  check(dialogs.some(m => /nummer/i.test(m)), 'Bruger advares om at nummeret kræver DB-opdatering');

  check(consoleErrors.length === 0, 'Ingen JS-fejl i konsollen' + (consoleErrors.length ? ': ' + consoleErrors.join(' | ') : ''));
  await browser.close();
  console.log(failures ? `\n${failures} FEJL` : '\nALLE TESTS BESTÅET');
  process.exit(failures ? 1 : 0);
})();
