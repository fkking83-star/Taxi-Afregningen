// Punkt 0.3: dashboardet har ingen indbygget ejer-kode. Koden skal stå i linket (?k=).
// Uden ?k= hentes intet, og kun en besked vises. Med en forkert kode vises en tydelig besked.
const { chromium, devices } = require('playwright');
const path = require('path');
const fs = require('fs');

const BASE = 'https://vehgabygvxnkrqsoazfs.supabase.co';
const SIDE = path.join(__dirname, '..', '..', 'site', 'dashboard.html');
const lon = (chauffor, udb) => ({ chauffor, regnskabsmaaned: '2026-09', antal_ture: 4, indkort_i_alt: 10000,
  overfort_i_alt: 10000, afregn_difference: 0, kontant_i_alt: 0, bro_faerge_i_alt: 0, model: '45%',
  andel_brutto: 4500, til_udbetaling: udb });
const ALLE = [lon('Fuad', 45170.00), lon('Adan', 47415.20)];

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

// Falsk database: kun koden "ejer" giver data (som de rigtige RPC'er, der returnerer tomt for en forkert kode)
async function aabn(browser, query, opts = {}) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const kald = [], fejl = [];
  page.on('pageerror', e => fejl.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) fejl.push(m.text()); });
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(`${BASE}/rest/v1/rpc/`)) {
      const fn = url.split('/rpc/')[1];
      const body = JSON.parse(route.request().postData() || '{}');
      kald.push({ fn, token: body.p_token });
      if (body.p_token !== 'ejer') return route.fulfill({ json: [] });
      if (fn === 'hent_alle') return route.fulfill({ json: body.p_maaned ? ALLE.filter(r => r.regnskabsmaaned === body.p_maaned) : ALLE });
      return route.fulfill({ json: [] });
    }
    if (url.startsWith('file://')) return route.continue();
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('file://' + SIDE + query);
  await page.waitForTimeout(600);
  return { ctx, page, kald, fejl };
}

(async () => {
  const kilde = fs.readFileSync(SIDE, 'utf8');
  check(!/OWNER_TOKEN_DEFAULT/.test(kilde) && !/d159855a/.test(kilde), 'Kildekoden indeholder ingen indbygget ejer-kode');
  check(/<meta name="referrer" content="no-referrer">/.test(kilde), 'Linket (med ?k=) sendes ikke videre som Referer');

  const browser = await chromium.launch();
  for (const [navn, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobil', { ...devices['iPhone 13'] }]]) {
    // 1) Intet ?k=
    let { ctx, page, kald, fejl } = await aabn(browser, '', opts);
    check(kald.length === 0, `${navn}, uden ?k=: ingen kald til databasen (${kald.length})`);
    check(await page.isVisible('#kodeBox') && (await page.textContent('#kodeBox')).includes('Linket mangler ejer-koden'), `${navn}, uden ?k=: beskeden "Linket mangler ejer-koden" vises`);
    check(!(await page.isVisible('#lonseddelCard')) && !(await page.isVisible('#driver')) && !(await page.isVisible('#rapporter')), `${navn}, uden ?k=: lønseddel, valg og tabeller er skjult`);
    check((await page.textContent('.version')).includes('v2026-10-02a') && await page.isVisible('.version'), `${navn}, uden ?k=: versionsnummeret (v2026-10-02a) ses stadig`);
    check(fejl.length === 0, `${navn}, uden ?k=: ingen JS-fejl` + (fejl.length ? ': ' + fejl.join(' | ') : ''));
    await ctx.close();

    // 2) Tomt ?k= og kun mellemrum
    for (const q of ['?k=', '?k=%20%20']) {
      ({ ctx, page, kald } = await aabn(browser, q, opts));
      check(kald.length === 0 && await page.isVisible('#kodeBox'), `${navn}, ${q}: behandles som manglende kode`);
      await ctx.close();
    }

    // 3) Forkert kode
    ({ ctx, page, kald, fejl } = await aabn(browser, '?k=forkert', opts));
    check(kald.length > 0 && kald.every(k => k.token === 'forkert'), `${navn}, forkert kode: kaldene bruger koden fra linket`);
    check(await page.isVisible('#kodeBox') && (await page.textContent('#kodeBox')).includes('gav ingen data'), `${navn}, forkert kode: beskeden "Ejer-koden i linket gav ingen data" vises`);
    check(fejl.length === 0, `${navn}, forkert kode: ingen JS-fejl` + (fejl.length ? ': ' + fejl.join(' | ') : ''));
    await ctx.close();

    // 4) Rigtig kode
    ({ ctx, page, kald, fejl } = await aabn(browser, '?k=ejer', opts));
    await page.waitForSelector('#lonBody :text("TIL UDBETALING")');
    check(!(await page.isVisible('#kodeBox')), `${navn}, rigtig kode: ingen besked`);
    check((await page.textContent('#lonBody')).includes('45.170,00'), `${navn}, rigtig kode: lønsedlen vises (45.170,00)`);
    check(kald.length > 0 && kald.every(k => k.token === 'ejer'), `${navn}, rigtig kode: alle ${kald.length} kald bruger koden fra linket`);
    check(fejl.length === 0, `${navn}, rigtig kode: ingen JS-fejl` + (fejl.length ? ': ' + fejl.join(' | ') : ''));
    await ctx.close();

    // 5) Kode med mellemrum omkring (fx kopieret fra en besked)
    ({ ctx, page, kald } = await aabn(browser, '?k=%20ejer%20', opts));
    check(kald.length > 0 && kald.every(k => k.token === 'ejer') && !(await page.isVisible('#kodeBox')), `${navn}, kode med mellemrum omkring: virker`);
    await ctx.close();
  }
  await browser.close();
  console.log(failures ? `\n${failures} FEJL` : '\nALLE TESTS BESTÅET');
  process.exit(failures ? 1 : 0);
})();
