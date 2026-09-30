// Fejlkort: forudfyldning fra raa_data (OCR) + dublet-visning (find_slutrapport, "Åbn i Ret", marker som rettet,
// dublet-data fra opret_slutrapport). Desktop og mobil (touch). Ældre database uden de nye funktioner virker stadig.
const { chromium } = require('playwright');
const path = require('path');

const BASE = 'https://vehgabygvxnkrqsoazfs.supabase.co';
const PUB = `${BASE}/storage/v1/object/public/`;
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const rm = d => { const [y, m, dd] = d.split('-').map(Number); const t = dd >= 28 ? new Date(Date.UTC(y, m, 1)) : new Date(Date.UTC(y, m - 1, 1)); return t.toISOString().slice(0, 7); };

let fails = 0;
const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

async function setup(browser, opts, { gammel } = {}) {
  const TURE = [
    { id: 'q-1860', dato: '2026-09-22', slutrapport_nr: '1860', chauffor: 'Qaalid', indkort: 3440, overfort: 3376, kontant: 0, bro_faerge: 0, vagt_start: '16:02', vagt_slut: '06:41' },
    { id: 'a-1114', dato: '2026-09-28', slutrapport_nr: '1114', chauffor: 'Adan', indkort: 2000, overfort: 2000, kontant: 0, bro_faerge: 0, vagt_start: '06:00', vagt_slut: '14:00' },
    { id: 'y-1672', dato: '2026-09-20', slutrapport_nr: '1672', chauffor: 'Faysal', indkort: 1013, overfort: 961, kontant: 0, bro_faerge: 0, vagt_start: '18:53', vagt_slut: '02:25' },
  ].map(t => ({ ...t, billede_url: null, bekraeftet: false }));
  const FEJL = [
    { id: 'f-1', status: 'ny', chauffor: 'Qaalid', driver_id: 'qaalid', modtaget: '2026-09-23T07:00:00Z', fejl_besked: 'Kunne ikke gemme i database', billede_url: null,
      raa_data: { slutrapport_nr: '1860', dato: '2026-09-22', vagt_start: '16:02', vagt_slut: '06:41', indkort: 3440.00, overfort: 3376.00, kontant: 0, bro_faerge: 0 } },
    { id: 'f-2', status: 'ny', chauffor: 'Adan', driver_id: 'adan', modtaget: '2026-09-26T15:00:00Z', fejl_besked: 'Kunne ikke gemme i database', billede_url: null,
      raa_data: JSON.stringify({ slutrapport_nr: '1114', dato: '25.09.2026', vagt_start: '6.05', vagt_slut: '14:10', indkort: '2.150,50', overfort: '2100', bro_faerge: '50' }) },
    { id: 'f-3', status: 'ny', chauffor: 'Faysal', driver_id: 'faysal', modtaget: '2026-09-27T20:38:47Z', fejl_besked: 'Ikke læsbar: nr 1682, dato 2026-09-27', billede_url: null },
    { id: 'f-4', status: 'ny', chauffor: 'Qaalid', driver_id: 'qaalid', modtaget: '2026-09-27T05:00:00Z', fejl_besked: 'Afvist: nr 1870', billede_url: null,
      raa_data: { slutrapport_nr: 'ABC', indkort: 999 } },
  ];
  const kald = [];
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  const find = (ch, nr) => TURE.filter(t => t.chauffor.toLowerCase() === String(ch).trim().toLowerCase() && t.slutrapport_nr === String(nr).trim());
  await page.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(`${BASE}/rest/v1/rpc/`)) {
      const fn = u.split('/rpc/')[1];
      const b = JSON.parse(route.request().postData() || '{}');
      kald.push({ fn, b });
      if (fn === 'hent_alle') {
        const pr = {};
        TURE.forEach(t => { const k = t.chauffor + '|' + rm(t.dato); (pr[k] = pr[k] || { chauffor: t.chauffor, regnskabsmaaned: rm(t.dato), antal_ture: 0, indkort_i_alt: 0, overfort_i_alt: 0, afregn_difference: 0, kontant_i_alt: 0, bro_faerge_i_alt: 0, model: '50%', andel_brutto: 0, til_udbetaling: 0 });
          pr[k].antal_ture++; pr[k].indkort_i_alt += t.indkort; pr[k].overfort_i_alt += t.overfort; });
        const rows = Object.values(pr);
        return route.fulfill({ json: b.p_maaned ? rows.filter(r => r.regnskabsmaaned === b.p_maaned) : rows });
      }
      if (fn === 'hent_ture') return route.fulfill({ json: TURE.filter(t => rm(t.dato) === b.p_maaned) });
      if (fn === 'hent_fejlede') return route.fulfill({ json: FEJL.map(f => gammel ? { ...f, raa_data: undefined } : f) });
      if (fn === 'hent_fejl_billeder') return route.fulfill({ json: [{ fejl_id: 'f-1', bucket: 'fejlede-billeder', navn: '_qaalid_1.jpg' }] });
      if (fn === 'hent_billeder') return route.fulfill({ json: TURE.filter(t => (b.p_numre || []).includes(t.slutrapport_nr) && t.chauffor === b.p_chauffor)
        .map(t => ({ navn: `${t.slutrapport_nr}_${t.chauffor.toLowerCase()}_1.jpg`, slutrapport_nr: t.slutrapport_nr, bucket: 'slutrapport-billeder' })) });
      if (fn === 'find_slutrapport') {
        if (gammel) return route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Could not find the function' } });
        return route.fulfill({ json: find(b.p_chauffor, b.p_slutrapport_nr) });
      }
      if (fn === 'opret_slutrapport') {
        const e = find(b.p_chauffor, b.p_slutrapport_nr)[0];
        if (e) return route.fulfill({ status: 400, json: { code: 'P0001', message: `Rapport nr ${e.slutrapport_nr} findes allerede for ${e.chauffor}`,
          details: gammel ? null : JSON.stringify(e), hint: gammel ? null : 'dublet' } });
        FEJL.find(f => f.id === b.p_fejl_id).status = 'rettet';
        return route.fulfill({ json: 'ny-id' });
      }
      if (fn === 'marker_fejl') { FEJL.find(f => f.id === b.p_id).status = b.p_status; return route.fulfill({ status: 204, body: '' }); }
      return route.fulfill({ status: 204, body: '' });
    }
    if (u.startsWith(PUB)) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (u.startsWith('file://')) return route.continue();
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('file://' + path.join(__dirname, '..', '..', 'site', 'dashboard.html') + '?k=test');
  await page.waitForSelector('#fejlListe > div');
  await page.selectOption('#month', '2026-09');
  await page.waitForTimeout(400);
  return { ctx, page, errs, kald, FEJL };
}
const val = (page, key, id) => page.inputValue(`#uf-${key}-${id}`);
const ocr = (page, key, id) => page.$eval(`#uf-${key}-${id}`, el => el.classList.contains('ocr'));
const dub = page => id => page.$eval(`#dub-${id}`, el => ({ skjult: el.classList.contains('hidden'), klasse: el.className, tekst: el.textContent.replace(/\s+/g, ' ').trim() }));

(async () => {
  const browser = await chromium.launch();

  // ================= DESKTOP =================
  {
    const { ctx, page, errs, kald } = await setup(browser, { viewport: { width: 1440, height: 900 } });
    const d = dub(page);
    // --- 1) Forudfyldning fra raa_data ---
    check(await val(page, 'nr', 'f-1') === '1860' && await val(page, 'dato', 'f-1') === '2026-09-22' && await val(page, 'vs', 'f-1') === '16:02'
      && await val(page, 've', 'f-1') === '06:41' && await val(page, 'ind', 'f-1') === '3440' && await val(page, 'ovf', 'f-1') === '3376' && await val(page, 'bro', 'f-1') === '0',
      'raa_data: ALLE felter forudfyldt (nr, dato, vagt start/slut, indkørt, overført, bro)');
    check((await Promise.all(['nr', 'dato', 'vs', 've', 'ind', 'ovf', 'bro'].map(k => ocr(page, k, 'f-1')))).every(Boolean), 'raa_data: felterne er markeret som OCR-forslag');
    await page.click('#fejl-f-1 button:has-text("Udfyld og godkend")');
    check(await page.isVisible('#udfyld-f-1 .udfyld-ocr-note') && (await page.$$('#udfyld-f-1 .ocr-tag')).length === 7, 'Formularen viser, at gule felter er OCR-forslag (7 felter)');
    check((await page.textContent('#uf-diff-f-1')) === '64,00 kr.', 'Live difference ud fra OCR-tallene: 3440 − 3376 − 0 = 64,00 kr.');
    check(await val(page, 'nr', 'f-2') === '1114' && await val(page, 'dato', 'f-2') === '2026-09-25' && await val(page, 'vs', 'f-2') === '06:05'
      && await val(page, 'ind', 'f-2') === '2150.5' && await val(page, 'ovf', 'f-2') === '2100' && await val(page, 'bro', 'f-2') === '50',
      'raa_data som JSON-tekst med dansk format (25.09.2026, "2.150,50", 6.05) læses korrekt');
    check(await val(page, 'nr', 'f-3') === '1682' && await val(page, 'dato', 'f-3') === '2026-09-27' && await val(page, 'ind', 'f-3') === '' && await val(page, 'bro', 'f-3') === '0'
      && !(await ocr(page, 'nr', 'f-3')) && !(await page.$('#udfyld-f-3 .udfyld-ocr-note')), 'Uden raa_data: som i dag (nr og dato fra fejlbeskeden, ingen OCR-markering)');
    check(await val(page, 'nr', 'f-4') === '1870' && !(await ocr(page, 'nr', 'f-4')) && await val(page, 'ind', 'f-4') === '999' && await ocr(page, 'ind', 'f-4'),
      'Ugyldigt OCR-nr ("ABC"): nr fra fejlbeskeden; gyldige OCR-felter bruges stadig');
    // Forslag kan rettes; differencen følger med
    await page.fill('#uf-ind-f-1', '3450');
    check((await page.textContent('#uf-diff-f-1')) === '74,00 kr.' && await val(page, 'ind', 'f-1') === '3450', 'OCR-forslag kan rettes; live difference opdateres (74,00 kr.)');

    // --- 2) Dublet-visning ---
    check(kald.some(k => k.fn === 'find_slutrapport' && k.b.p_chauffor === 'Adan' && k.b.p_slutrapport_nr === '1114'), 'Kortet slår selv op med chauffør + nr (find_slutrapport)');
    let x = await d('f-1');
    check(!x.skjult && x.tekst.includes('Findes allerede: 22/9, indkørt 3.440, overført 3.376'), `Dublet vises direkte på kortet: "${x.tekst.split('⚠')[0].split('✓')[0].trim()}"`);
    check(x.klasse.includes('dublet-anden') && x.tekst.includes('Samme nummer, anden vagt — ét af numrene er sandsynligvis fejllæst.'), 'Rettet beløb (3450 ≠ 3440): advarsel om anden vagt');
    await page.fill('#uf-ind-f-1', '3440');
    x = await d('f-1');
    check(x.klasse.includes('dublet-ens') && x.tekst.includes('Samme vagt er allerede gemt — marker som rettet') && await page.isVisible('#dub-f-1 .btn-ens'),
      'Identisk dato og beløb: "Samme vagt er allerede gemt — marker som rettet" + knap');
    x = await d('f-2');
    check(x.tekst.includes('Findes allerede: 28/9, indkørt 2.000, overført 2.000') && x.tekst.includes('Samme nummer, anden vagt') && !(await page.$('#dub-f-2 .btn-ens')),
      'Forskellig dato/beløb (Adan 1114): advarsel, ingen "marker som rettet"-knap');
    check((await d('f-3')).skjult, 'Intet eksisterende nr (1682): ingen dublet-boks');
    // Skriv et nr, der findes -> boksen dukker op; sammenlignes live mens der tastes
    await page.click('#fejl-f-3 button:has-text("Udfyld og godkend")');
    await page.fill('#uf-nr-f-3', '1672');
    await page.waitForFunction(() => !document.getElementById('dub-f-3').classList.contains('hidden'));
    x = await d('f-3');
    check(x.klasse.includes('dublet-neutral') && x.tekst.includes('Findes allerede: 20/9, indkørt 1.013, overført 961'), 'Nr skrevet i hånden (1672): dublet findes; uden beløb vises ingen dom endnu');
    await page.fill('#uf-dato-f-3', '2026-09-20'); await page.fill('#uf-ind-f-3', '1013'); await page.fill('#uf-ovf-f-3', '961');
    check((await d('f-3')).klasse.includes('dublet-ens'), 'Dato og beløb udfyldt = den gemte vagt: "samme vagt"');
    await page.fill('#uf-ovf-f-3', '960');
    check((await d('f-3')).klasse.includes('dublet-anden'), 'Ét beløb ændret: "anden vagt"');
    await page.fill('#uf-nr-f-3', '1683');
    await page.waitForFunction(() => document.getElementById('dub-f-3').classList.contains('hidden'));
    check(true, 'Nr ændret til et ledigt nr: boksen forsvinder');

    // Gem ved dublet: databasens besked + eksisterende række fra svaret
    await page.fill('#uf-nr-f-3', '1672');
    await page.click('#uf-gem-f-3');
    await page.waitForFunction(() => document.getElementById('uf-fejl-f-3').textContent.includes('findes'));
    check((await page.textContent('#uf-fejl-f-3')) === 'Rapport nr 1672 findes allerede for Faysal' && !(await d('f-3')).skjult, 'Gem ved dublet: besked i formularen og den gemte vagt på kortet');

    // "Åbn i Ret" (Adan 28/9 -> regnskabsmåned 2026-10, anden chauffør og måned end valgt)
    await page.click('#dub-f-2 button:has-text("Åbn i Ret")');
    await page.waitForFunction(() => document.getElementById('row-a-1114') && !document.getElementById('ret-a-1114').classList.contains('hidden'));
    check(await page.inputValue('#driver') === 'Adan' && await page.inputValue('#month') === '2026-10', 'Åbn i Ret: skifter til chaufføren og regnskabsmåneden (28/9 → 2026-10)');
    await page.waitForSelector('#ret-a-1114 img.ret-billede');
    const synlig = await page.$eval('#row-a-1114', el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
    check(synlig && await page.isVisible('#ret-a-1114 img.ret-billede') && await page.inputValue('#ret-nr-a-1114') === '1114',
      'Åbn i Ret: ruller til rækken og åbner Ret-panelet med billedet');
    check((await page.textContent('#lonBody')).includes('Antal ture'), 'Lønsedlen vises for den valgte chauffør/måned');

    // Marker som rettet fra dublet-boksen
    await page.click('#dub-f-1 .btn-ens');
    await page.waitForFunction(() => !document.getElementById('fejl-f-1'));
    check(kald.some(k => k.fn === 'marker_fejl' && k.b.p_id === 'f-1' && k.b.p_status === 'rettet'), '"Marker som rettet" markerer fejl-rækken og fjerner kortet');
    check(!kald.some(k => k.fn === 'opret_slutrapport' && k.b.p_fejl_id === 'f-1'), 'Samme vagt: der oprettes ingen ny række');
    check(errs.length === 0, 'Desktop: ingen JS-fejl' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  }

  // ================= MOBIL =================
  {
    const { ctx, page, errs } = await setup(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    const d = dub(page);
    await page.waitForFunction(() => !document.getElementById('dub-f-2').classList.contains('hidden'));
    const lay = await page.evaluate(() => {
      const b = document.getElementById('dub-f-2').getBoundingClientRect(), k = document.getElementById('fejl-f-2').getBoundingClientRect();
      return { bredde: document.documentElement.scrollWidth, inde: b.left >= k.left && b.right <= k.right,
        knap: document.querySelector('#dub-f-2 button').getBoundingClientRect().height };
    });
    check(lay.bredde <= 390 && lay.inde, `Mobil: dublet-boksen holder sig inden for kortet, ingen vandret scroll (bredde ${lay.bredde})`);
    check(lay.knap >= 36, `Mobil: knappen er stor nok til at trykke på (${Math.round(lay.knap)} px)`);
    await page.tap('#fejl-f-1 button:has-text("Udfyld og godkend")');
    check(await val(page, 'ind', 'f-1') === '3440' && (await page.textContent('#uf-diff-f-1')) === '64,00 kr.', 'Mobil: OCR-forslag og live difference');
    await page.fill('#uf-ovf-f-1', '3300');
    check((await d('f-1')).klasse.includes('dublet-anden') && (await page.textContent('#uf-diff-f-1')) === '140,00 kr.', 'Mobil: rettelse opdaterer difference og dublet-dom');
    await page.tap('#dub-f-2 button:has-text("Åbn i Ret")');
    await page.waitForFunction(() => document.getElementById('row-a-1114') && !document.getElementById('ret-a-1114').classList.contains('hidden'));
    check(await page.inputValue('#driver') === 'Adan' && await page.evaluate(() => document.getElementById('lightbox').classList.contains('hidden')),
      'Mobil: Åbn i Ret virker, og viseren dækker ikke Ret-panelet');
    check(errs.length === 0, 'Mobil: ingen JS-fejl' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  }

  // ================= Ældre database (uden raa_data, find_slutrapport og dublet-data) =================
  {
    const { ctx, page, errs } = await setup(browser, { viewport: { width: 1200, height: 800 } }, { gammel: true });
    const d = dub(page);
    check(await val(page, 'nr', 'f-3') === '1682' && await val(page, 'ind', 'f-1') === '', 'Uden raa_data: formularen som i dag');
    check((await d('f-1')).skjult && (await d('f-2')).skjult, 'Uden find_slutrapport: ingen dublet-boks, intet brud');
    await page.click('#fejl-f-3 button:has-text("Udfyld og godkend")');
    await page.fill('#uf-nr-f-3', '1672'); await page.fill('#uf-ind-f-3', '1'); await page.fill('#uf-ovf-f-3', '1');
    await page.click('#uf-gem-f-3');
    await page.waitForFunction(() => document.getElementById('uf-fejl-f-3').textContent.includes('findes'));
    check((await page.textContent('#uf-fejl-f-3')) === 'Rapport nr 1672 findes allerede for Faysal' && (await d('f-3')).skjult, 'Dublet uden data i svaret: beskeden vises som i dag');
    check(errs.length === 0, 'Ældre database: ingen JS-fejl' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  }

  await browser.close();
  console.log(fails ? `\n${fails} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(fails ? 1 : 0);
})();
