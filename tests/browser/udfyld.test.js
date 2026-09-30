// "Udfyld og godkend" på fejlkort: forudfyldning, live-difference, validering, dublet, gem -> kort væk + tabel/lønseddel
// opdateres. Desktop (sidepanel ved siden af formularen) og mobil (touch, stablet layout).
const { chromium } = require('playwright');
const path = require('path');

const BASE = 'https://vehgabygvxnkrqsoazfs.supabase.co';
const PUB = `${BASE}/storage/v1/object/public/`;
const url = (b, n) => PUB + encodeURIComponent(b) + '/' + encodeURIComponent(n);
const IMG1 = url('fejlede-billeder', '_faysal_1790541527.jpg');
const IMG2 = url('fejlede-billeder', '1138_adan_1790516277.jpg');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const rm = d => { const [y, m, dd] = d.split('-').map(Number); const t = dd >= 28 ? new Date(Date.UTC(y, m, 1)) : new Date(Date.UTC(y, m - 1, 1)); return t.toISOString().slice(0, 7); };

let fails = 0;
const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

async function setup(browser, opts, { uden } = {}) {
  const TURE = [
    { id: 't1', dato: '2026-09-20', slutrapport_nr: '1672', chauffor: 'Faysal', indkort: 1013, overfort: 961, kontant: 0, bro_faerge: 0, vagt_start: '18:53', vagt_slut: '02:25' },
    { id: 't2', dato: '2026-09-21', slutrapport_nr: '1136', chauffor: 'Adan', indkort: 2000, overfort: 2000, kontant: 0, bro_faerge: 0, vagt_start: '06:00', vagt_slut: '14:00' },
  ];
  const FEJL = [
    { id: 'f-1', status: 'ny', chauffor: 'Faysal', driver_id: 'faysal', modtaget: '2026-09-27T20:38:47Z', fejl_besked: 'Ikke læsbar: nr 1682, dato 2026-09-27', billede_url: null },
    { id: 'f-2', status: 'ny', chauffor: 'Adan', driver_id: 'adan', modtaget: '2026-09-27T13:37:57Z', fejl_besked: 'Kunne ikke gemme i database', billede_url: null },
    { id: 'f-3', status: 'ny', chauffor: 'qaalid', driver_id: 'qaalid', modtaget: '2026-09-28T05:00:00Z', fejl_besked: 'Afvist, dato 28.09.2026', billede_url: null },
  ];
  const kald = [];
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
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
        const rows = Object.values(pr).concat([{ chauffor: 'Fuad', regnskabsmaaned: '2026-10', antal_ture: 1 }]);
        return route.fulfill({ json: b.p_maaned ? rows.filter(r => r.regnskabsmaaned === b.p_maaned) : rows });
      }
      if (fn === 'hent_ture') return route.fulfill({ json: TURE.filter(t => rm(t.dato) === b.p_maaned) });
      if (fn === 'hent_fejlede') return route.fulfill({ json: FEJL });
      if (fn === 'hent_fejl_billeder') return route.fulfill({ json: [{ fejl_id: 'f-1', bucket: 'fejlede-billeder', navn: '_faysal_1790541527.jpg' }, { fejl_id: 'f-2', bucket: 'fejlede-billeder', navn: '1138_adan_1790516277.jpg' }] });
      if (fn === 'opret_slutrapport') {
        if (uden) return route.fulfill({ status: 404, json: { message: 'Could not find the function' } });
        const ch = ['Fuad', 'Faysal', 'Abdikarin', 'Qaalid', 'Adan'].find(d => d.toLowerCase() === String(b.p_chauffor).trim().toLowerCase()) || b.p_chauffor;
        if (TURE.some(t => t.chauffor.toLowerCase() === ch.toLowerCase() && t.slutrapport_nr === b.p_slutrapport_nr))
          return route.fulfill({ status: 400, json: { code: 'P0001', message: `Rapport nr ${b.p_slutrapport_nr} findes allerede for ${ch}` } });
        TURE.push({ id: 'ny' + TURE.length, dato: b.p_dato, slutrapport_nr: b.p_slutrapport_nr, chauffor: ch, indkort: b.p_indkort, overfort: b.p_overfort, kontant: 0, bro_faerge: b.p_bro_faerge, vagt_start: b.p_vagt_start, vagt_slut: b.p_vagt_slut, billede_url: b.p_billede_url });
        FEJL.find(f => f.id === b.p_fejl_id).status = 'rettet';
        return route.fulfill({ json: 'ny-id' });
      }
      return route.fulfill({ status: 204, body: '' });
    }
    if (u.startsWith(PUB)) return route.fulfill({ status: 200, contentType: 'image/png', body: PNG });
    if (u.startsWith('file://')) return route.continue();
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('file://' + path.join(__dirname, '..', '..', 'site', 'dashboard.html') + '?k=test');
  await page.waitForSelector('#fejlListe > div');
  await page.selectOption('#month', '2026-09');
  await page.waitForTimeout(200);
  return { ctx, page, errs, kald, TURE, FEJL };
}
const val = (page, key, id) => page.inputValue(`#uf-${key}-${id}`);

(async () => {
  const browser = await chromium.launch();

  // ================= DESKTOP =================
  {
    const { ctx, page, errs, kald } = await setup(browser, { viewport: { width: 1440, height: 900 } });
    check((await page.$$('#fejlListe button:has-text("Udfyld og godkend")')).length === 3, 'Hvert fejlkort har knappen "Udfyld og godkend"');
    check(!(await page.isVisible('#udfyld-f-1')), 'Formularen er skjult, indtil man trykker');
    await page.click('#fejl-f-1 button:has-text("Udfyld og godkend")');
    check(await page.isVisible('#udfyld-f-1'), 'Knappen åbner formularen');
    // Forudfyldning
    check(await val(page, 'nr', 'f-1') === '1682' && await val(page, 'dato', 'f-1') === '2026-09-27', 'Nr og dato forudfyldt fra fejlbeskeden ("nr 1682, dato 2026-09-27")');
    check(await val(page, 'ch', 'f-1') === 'Faysal' && await val(page, 'bro', 'f-1') === '0', 'Chauffør forudfyldt fra kortet, bro/færge = 0');
    check(await val(page, 'nr', 'f-2') === '1138', 'Uden nr i beskeden: nr fra billedets filnavn (1138_adan_...)');
    check(await val(page, 'ch', 'f-3') === 'Qaalid' && await val(page, 'dato', 'f-3') === '2026-09-28', 'Chauffør "qaalid" matches til Qaalid; dato 28.09.2026 læses som 2026-09-28');
    // Billede ved siden af (sidepanel)
    const lb = await page.evaluate(() => ({ open: !document.getElementById('lightbox').classList.contains('hidden'), src: document.getElementById('lightboxImg').getAttribute('src'),
      formRight: document.getElementById('udfyld-f-1').getBoundingClientRect().right, lbLeft: document.getElementById('lightbox').getBoundingClientRect().left }));
    check(lb.open && lb.src === '' + await page.getAttribute('#udfyld-f-1 img', 'src') && lb.formRight <= lb.lbLeft + 1, 'Desktop: bonen åbnes i zoom-viseren ved siden af formularen (dækker den ikke)');
    await page.dblclick('#lbStage');
    check((await page.textContent('#lbZoom')) === '250%', 'Zoom-viseren virker (dobbeltklik 250 %)');
    // Live difference
    await page.fill('#uf-ind-f-1', '1638'); await page.fill('#uf-ovf-f-1', '1484');
    check((await page.textContent('#uf-diff-f-1')) === '154,00 kr.', 'Live difference: 1638 − 1484 − 0 = 154,00 kr.');
    await page.fill('#uf-bro-f-1', '4');
    check((await page.textContent('#uf-diff-f-1')) === '150,00 kr.', 'Bro/færge trækkes fra: 150,00 kr.');
    await page.fill('#uf-bro-f-1', '0');
    // Tastatur i felterne må ikke styre viseren
    await page.click('#uf-ind-f-1'); await page.keyboard.press('End'); await page.keyboard.type('0'); await page.keyboard.press('Backspace');
    check((await page.textContent('#lbZoom')) === '250%' && await val(page, 'ind', 'f-1') === '1638', '"0" skrevet i et felt nulstiller ikke viseren');
    // Validering uden kald
    const foer = kald.filter(k => k.fn === 'opret_slutrapport').length;
    await page.fill('#uf-nr-f-1', '');
    await page.click('#uf-gem-f-1');
    check((await page.textContent('#uf-fejl-f-1')).includes('3–5 cifre') && kald.filter(k => k.fn === 'opret_slutrapport').length === foer, 'Tomt nr: tydelig besked, intet sendt');
    // Dublet
    await page.fill('#uf-nr-f-1', '1672');
    await page.click('#uf-gem-f-1');
    await page.waitForFunction(() => document.getElementById('uf-fejl-f-1').textContent.includes('findes'));
    check((await page.textContent('#uf-fejl-f-1')) === 'Rapport nr 1672 findes allerede for Faysal', 'Dublet: databasens besked vises i formularen ("Rapport nr 1672 findes allerede for Faysal")');
    check(await page.isVisible('#fejl-f-1') && await page.isEnabled('#uf-gem-f-1'), 'Ved dublet bliver kortet stående, og Gem kan bruges igen');
    // Gem
    await page.fill('#uf-nr-f-1', '1682');
    await page.fill('#uf-vs-f-1', '21:32'); await page.fill('#uf-ve-f-1', '01:54');
    await page.selectOption('#driver', 'Adan');   // står på en anden chauffør
    await page.click('#uf-gem-f-1');
    await page.waitForFunction(() => !document.getElementById('fejl-f-1'));
    const sendt = kald.filter(k => k.fn === 'opret_slutrapport').pop().b;
    check(sendt.p_fejl_id === 'f-1' && sendt.p_chauffor === 'Faysal' && sendt.p_slutrapport_nr === '1682' && sendt.p_dato === '2026-09-27'
      && sendt.p_vagt_start === '21:32' && sendt.p_vagt_slut === '01:54' && sendt.p_indkort === 1638 && sendt.p_overfort === 1484 && sendt.p_bro_faerge === 0
      && sendt.p_billede_url === IMG1 && !('p_kontant' in sendt), 'Gem sender de rigtige værdier til opret_slutrapport (inkl. billedet, ingen kontant)');
    check((await page.$$('#fejlListe > div')).length === 2, 'Kortet forsvinder efter gem');
    await page.waitForSelector('#rapporter table');
    check(await page.inputValue('#driver') === 'Faysal' && await page.inputValue('#month') === '2026-09', 'Dashboardet skifter til chaufføren og regnskabsmåneden for den nye række');
    check((await page.textContent('#rapporter')).includes('1682'), 'Tabellen viser den nye række 1682');
    check((await page.textContent('#lonBody')).includes('Antal ture') && (await page.$eval('#lonBody', el => el.textContent)).match(/Antal ture\s*2/), 'Lønsedlen er opdateret (Faysal: 2 ture)');
    check(await page.evaluate(() => document.getElementById('lightbox').classList.contains('hidden')), 'Zoom-viseren lukkes efter gem');
    check(errs.length === 0, 'Desktop: ingen JS-fejl' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  }

  // ================= MOBIL =================
  {
    const { ctx, page, errs, kald } = await setup(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.tap('#fejl-f-2 button:has-text("Udfyld og godkend")');
    check(await page.isVisible('#udfyld-f-2') && await page.evaluate(() => document.getElementById('lightbox').classList.contains('hidden')), 'Mobil: formularen åbner uden at viseren dækker den');
    const lay = await page.evaluate(() => {
      const img = document.querySelector('#udfyld-f-2 .udfyld-billede').getBoundingClientRect();
      const felter = document.querySelector('#udfyld-f-2 .udfyld-felter').getBoundingClientRect();
      const inp = [...document.querySelectorAll('#udfyld-f-2 input, #udfyld-f-2 select')];
      return { stablet: felter.top >= img.bottom - 1, bredde: document.documentElement.scrollWidth,
        font: Math.min(...inp.map(i => parseFloat(getComputedStyle(i).fontSize))),
        indenfor: inp.every(i => { const r = i.getBoundingClientRect(), k = document.getElementById('udfyld-f-2').getBoundingClientRect(); return r.left >= k.left && r.right <= k.right; }) };
    });
    check(lay.stablet, 'Mobil: billede over felterne (stablet)');
    check(lay.bredde <= 390 && lay.indenfor, `Mobil: ingen vandret scroll, alle felter inden for formularens kant (bredde ${lay.bredde})`);
    check(lay.font >= 16, 'Mobil: felter har 16px skrift (iPhone zoomer ikke ind ved tryk)');
    await page.tap('#udfyld-f-2 .udfyld-billede img');
    check(!(await page.evaluate(() => document.getElementById('lightbox').classList.contains('hidden'))) && (await page.getAttribute('#lightboxImg', 'src')) === IMG2, 'Mobil: tryk på billedet åbner zoom-viseren i fuld skærm');
    await page.tap('#lightbox button:has-text("Luk")');
    await page.fill('#uf-dato-f-2', '2026-09-28');
    await page.fill('#uf-ind-f-2', '5046'); await page.fill('#uf-ovf-f-2', '5000');
    check((await page.textContent('#uf-diff-f-2')) === '46,00 kr.', 'Mobil: live difference virker');
    await page.tap('#uf-gem-f-2');
    await page.waitForFunction(() => !document.getElementById('fejl-f-2'));
    check(await page.inputValue('#driver') === 'Adan' && await page.inputValue('#month') === '2026-10', 'Mobil: gem virker; dato 28/9 -> regnskabsmåned 2026-10 vælges');
    check(kald.filter(k => k.fn === 'opret_slutrapport').pop().b.p_billede_url === IMG2, 'Billedet (fundet via hent_fejl_billeder) sendes med');
    check(errs.length === 0, 'Mobil: ingen JS-fejl' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  }

  // ================= Funktionen findes ikke endnu =================
  {
    const { ctx, page, errs } = await setup(browser, { viewport: { width: 1200, height: 800 } }, { uden: true });
    await page.click('#fejl-f-1 button:has-text("Udfyld og godkend")');
    await page.fill('#uf-ind-f-1', '1'); await page.fill('#uf-ovf-f-1', '1');
    await page.click('#uf-gem-f-1');
    await page.waitForFunction(() => document.getElementById('uf-fejl-f-1').textContent.length > 0);
    check((await page.textContent('#uf-fejl-f-1')).includes('ikke kørt') && await page.isVisible('#fejl-f-1'), 'Uden opret_slutrapport i databasen: tydelig besked, kortet bliver');
    check(errs.length === 0, 'Ingen JS-fejl');
    await ctx.close();
  }

  await browser.close();
  console.log(fails ? `\n${fails} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(fails ? 1 : 0);
})();
