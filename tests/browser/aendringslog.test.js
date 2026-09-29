// Ændringslog i dashboardet: "Ret" og "Udfyld og godkend" vises under "Seneste ændringer" med før → efter,
// og kan fortrydes (med bekræftelse). Den falske database her opfører sig som supabase/pending/20260929130000_aendringslog.sql.
const { chromium } = require('playwright');
const path = require('path');

const BASE = 'https://vehgabygvxnkrqsoazfs.supabase.co';
const rm = d => { const [y, m, dd] = d.split('-').map(Number); const t = dd >= 28 ? new Date(Date.UTC(y, m, 1)) : new Date(Date.UTC(y, m - 1, 1)); return t.toISOString().slice(0, 7); };
const FELTER = ['id', 'dato', 'slutrapport_nr', 'chauffor', 'indkort', 'overfort', 'kontant', 'bro_faerge', 'vagt_start', 'vagt_slut', 'billede_url'];
const felter = r => Object.fromEntries(FELTER.map(k => [k, r[k] ?? null]));
const ens = (a, b) => JSON.stringify(a) === JSON.stringify(b);

let fails = 0;
const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };

async function setup(browser, opts, { gammel } = {}) {
  const TURE = [
    { id: 't1', dato: '2026-09-02', slutrapport_nr: '1001', chauffor: 'Fuad', indkort: 2500, overfort: 2500, kontant: 0, bro_faerge: 0, vagt_start: '06:00', vagt_slut: '14:00' },
    { id: 't2', dato: '2026-09-03', slutrapport_nr: '1002', chauffor: 'Fuad', indkort: 2600, overfort: 2600, kontant: 0, bro_faerge: 0, vagt_start: '06:00', vagt_slut: '14:00' },
  ].map(t => ({ ...t, billede_url: null, bekraeftet: false }));
  const FEJL = [{ id: 'f-1', status: 'ny', chauffor: 'Fuad', driver_id: 'fuad', modtaget: '2026-09-05T10:00:00Z', fejl_besked: 'Ikke læsbar: nr 1003, dato 2026-09-04', billede_url: null }];
  const LOG = []; let logId = 0; const kald = [];
  const nyLog = (o) => { const l = { id: ++logId, hvem: 'ejer (dashboard)', tidspunkt: new Date(Date.UTC(2026, 8, 29, 18, logId)).toISOString(), foer: null, efter: null, fortrudt_tid: null, ...o }; LOG.push(l); return l; };
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errs = [], dialoger = [];
  page.on('pageerror', e => errs.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  const svar = { confirm: true };
  page.on('dialog', d => { dialoger.push(d.message()); svar.confirm ? d.accept() : d.dismiss(); });
  await page.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(`${BASE}/rest/v1/rpc/`)) {
      const fn = u.split('/rpc/')[1];
      const b = JSON.parse(route.request().postData() || '{}');
      kald.push({ fn, b });
      if (fn === 'hent_alle') {
        const pr = {};
        TURE.forEach(t => { const k = t.chauffor + '|' + rm(t.dato); (pr[k] = pr[k] || { chauffor: t.chauffor, regnskabsmaaned: rm(t.dato), antal_ture: 0, indkort_i_alt: 0, overfort_i_alt: 0, afregn_difference: 0, kontant_i_alt: 0, bro_faerge_i_alt: 0, model: '50%', andel_brutto: 0, til_udbetaling: 0 });
          pr[k].antal_ture++; pr[k].indkort_i_alt += t.indkort; pr[k].til_udbetaling += t.indkort / 2; });
        const rows = Object.values(pr);
        return route.fulfill({ json: b.p_maaned ? rows.filter(r => r.regnskabsmaaned === b.p_maaned) : rows });
      }
      if (fn === 'hent_ture') return route.fulfill({ json: TURE.filter(t => rm(t.dato) === b.p_maaned) });
      if (fn === 'hent_fejlede') return route.fulfill({ json: FEJL });
      if (fn === 'hent_aendringer') {
        if (gammel) return route.fulfill({ status: 404, json: { code: 'PGRST202', message: 'Could not find the function' } });
        return route.fulfill({ json: [...LOG].reverse().map(l => ({ ...l, kan_fortrydes: ['ret', 'opret'].includes(l.handling) && !l.fortrudt_tid
          && TURE.some(t => t.id === l.slutrapport_id && ens(felter(t), l.efter)) })) });
      }
      if (fn === 'ret_slutrapport') {
        const t = TURE.find(x => x.id === b.p_id); const foer = felter(t);
        for (const [k, p] of [['dato', 'p_dato'], ['indkort', 'p_indkort'], ['overfort', 'p_overfort'], ['kontant', 'p_kontant'], ['bro_faerge', 'p_bro_faerge'], ['slutrapport_nr', 'p_slutrapport_nr']])
          if (b[p] !== null && b[p] !== undefined) t[k] = b[p];
        if (!gammel && !ens(foer, felter(t))) nyLog({ slutrapport_id: t.id, handling: 'ret', foer, efter: felter(t) });
        return route.fulfill({ status: 204, body: '' });
      }
      if (fn === 'opret_slutrapport') {
        const t = { id: 'ny' + TURE.length, dato: b.p_dato, slutrapport_nr: b.p_slutrapport_nr, chauffor: b.p_chauffor, indkort: b.p_indkort, overfort: b.p_overfort, kontant: 0, bro_faerge: b.p_bro_faerge, vagt_start: b.p_vagt_start, vagt_slut: b.p_vagt_slut, billede_url: b.p_billede_url, bekraeftet: false };
        TURE.push(t); FEJL.find(x => x.id === b.p_fejl_id).status = 'rettet';
        if (!gammel) nyLog({ slutrapport_id: t.id, handling: 'opret', efter: felter(t), fejl_id: b.p_fejl_id });
        return route.fulfill({ json: t.id });
      }
      if (fn === 'fortryd_aendring') {
        const l = LOG.find(x => x.id === b.p_log_id);
        const t = TURE.find(x => x.id === l.slutrapport_id);
        if (!t || !ens(felter(t), l.efter)) return route.fulfill({ status: 400, json: { code: 'P0001', message: 'Rækken er ændret siden — fortryd den nyeste ændring først' } });
        const foer = felter(t);
        if (l.handling === 'ret') { Object.assign(t, l.foer); nyLog({ slutrapport_id: t.id, handling: 'fortryd', foer, efter: felter(t) }); }
        else { TURE.splice(TURE.indexOf(t), 1); FEJL.find(x => x.id === l.fejl_id).status = 'ny'; nyLog({ slutrapport_id: t.id, handling: 'fortryd', foer, efter: null }); }
        l.fortrudt_tid = new Date(Date.UTC(2026, 8, 29, 19, logId)).toISOString();
        return route.fulfill({ json: { handling: l.handling } });
      }
      return route.fulfill({ status: 204, body: '' });
    }
    if (u.startsWith('file://')) return route.continue();
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('file://' + path.join(__dirname, '..', '..', 'site', 'dashboard.html'));
  await page.waitForSelector('#rapporter table');
  await page.selectOption('#month', '2026-09');
  await page.waitForTimeout(300);
  return { ctx, page, errs, kald, dialoger, svar, TURE, LOG };
}
const celle = (page, id, n) => page.$eval(`#row-${id} td:nth-child(${n})`, td => td.textContent.trim());
const liste = page => page.$$eval('#aendringListe .aendring', ds => ds.map(d => ({ id: d.id, tekst: d.textContent.replace(/\s+/g, ' ').trim(),
  fortrudt: d.classList.contains('fortrudt'), knap: !!d.querySelector('.btn-fortryd') })));

(async () => {
  const browser = await chromium.launch();

  // ================= DESKTOP =================
  {
    const { ctx, page, errs, kald, dialoger, svar } = await setup(browser, { viewport: { width: 1440, height: 900 } });
    check(!(await page.isVisible('#aendringCard')), 'Ingen ændringer endnu: kortet "Seneste ændringer" er skjult');
    // Ret: indkørt 2500 -> 2650 og nr 1001 -> 1011
    await page.click('#row-t1 button:has-text("Ret")');
    await page.fill('#ret-ind-t1', '2650'); await page.fill('#ret-nr-t1', '1011');
    await page.click('#ret-t1 button:has-text("Gem")');
    await page.waitForSelector('#aendringListe .aendring');
    let l = await liste(page);
    check(await page.isVisible('#aendringCard') && l.length === 1, 'Efter Ret: ændringen vises under "Seneste ændringer"');
    check(l[0].tekst.includes('Ret') && l[0].tekst.includes('Fuad · nr 1011') && l[0].tekst.includes('nr 1001 → 1011') && l[0].tekst.includes('indkørt 2.500 → 2.650') && l[0].tekst.includes('ejer (dashboard)'),
      `Viser hvem, hvad og før → efter: "${l[0].tekst.slice(0, 120)}…"`);
    check(l[0].knap, 'Ret-ændringen har en Fortryd-knap');
    check(await celle(page, 't1', 3) === '2.650,00', 'Tabellen viser den rettede værdi');
    // Annullér i bekræftelsen: intet sker
    svar.confirm = false;
    await page.click(`#${l[0].id} .btn-fortryd`);
    check(dialoger.at(-1).includes('Fortryd rettelsen?') && dialoger.at(-1).includes('nr 1011 → 1001') && dialoger.at(-1).includes('indkørt 2.650 → 2.500'), 'Bekræftelsen siger præcis, hvad der sættes tilbage');
    check(!kald.some(k => k.fn === 'fortryd_aendring'), 'Annullér i bekræftelsen: intet fortrydes');
    // Fortryd
    svar.confirm = true;
    await page.click(`#${l[0].id} .btn-fortryd`);
    await page.waitForFunction(() => document.querySelectorAll('#aendringListe .aendring').length === 2);
    await page.waitForFunction(() => document.querySelector('#row-t1 td:nth-child(3)')?.textContent.trim() === '2.500,00');
    check(await celle(page, 't1', 2) === '1001' && await celle(page, 't1', 3) === '2.500,00', 'Fortryd: rækken er tilbage (nr 1001, indkørt 2.500) i tabellen');
    l = await liste(page);
    check(l[0].tekst.startsWith('Fortrudt') && l[0].tekst.includes('indkørt 2.650 → 2.500') && !l[0].knap, 'Fortrydelsen står øverst i loggen (uden Fortryd-knap)');
    check(l[1].fortrudt && l[1].tekst.includes('(fortrudt') && !l[1].knap, 'Den oprindelige ændring er markeret som fortrudt');
    check((await page.textContent('#lonBody')).includes('5.100,00'), 'Lønsedlen er opdateret efter fortryd (indkørt i alt 5.100)');

    // To Ret i træk: kun den nyeste kan fortrydes
    await page.click('#row-t2 button:has-text("Ret")');
    await page.fill('#ret-ovf-t2', '2550'); await page.click('#ret-t2 button:has-text("Gem")');
    await page.waitForFunction(() => document.querySelectorAll('#aendringListe .aendring').length === 3);
    await page.click('#row-t2 button:has-text("Ret")');
    await page.fill('#ret-kon-t2', '50'); await page.click('#ret-t2 button:has-text("Gem")');
    await page.waitForFunction(() => document.querySelectorAll('#aendringListe .aendring').length === 4);
    l = await liste(page);
    check(l[0].knap && !l[1].knap, 'To Ret i træk på samme række: kun den nyeste har Fortryd');

    // Udfyld og godkend -> logges -> Fortryd sletter rækken og viser fejlkortet igen
    await page.click('#fejl-f-1 button:has-text("Udfyld og godkend")');
    await page.fill('#uf-ind-f-1', '1800'); await page.fill('#uf-ovf-f-1', '1700');
    await page.click('#uf-gem-f-1');
    await page.waitForFunction(() => !document.getElementById('fejl-f-1'));
    await page.waitForFunction(() => document.querySelectorAll('#aendringListe .aendring').length === 5);
    l = await liste(page);
    check(l[0].tekst.startsWith('Udfyld og godkend') && l[0].tekst.includes('oprettet: 4/9, indkørt 1.800, overført 1.700') && l[0].knap, 'Udfyld og godkend vises i loggen med Fortryd');
    await page.click(`#${l[0].id} .btn-fortryd`);
    check(dialoger.at(-1).includes('Fortryd godkendelsen?') && dialoger.at(-1).includes('slettes, og fejlkortet kommer tilbage'), 'Bekræftelsen advarer om, at rækken slettes');
    await page.waitForSelector('#fejl-f-1');
    check(!(await page.$('#rapporter td:has-text("1003")')), 'Fortryd godkendelse: rækken er væk fra tabellen');
    check(await page.isVisible('#fejl-f-1'), 'Fejlkortet er tilbage');
    l = await liste(page);
    check(l[0].tekst.includes('slettede rækken') && l[1].fortrudt, 'Loggen viser, at rækken blev slettet, og godkendelsen er fortrudt');

    // Afvisning fra databasen vises ved ændringen
    await page.evaluate(() => { const b = document.createElement('button'); b.className = 'btn-fortryd'; b.onclick = () => fortrydAendring(3); document.getElementById('aend-3').appendChild(b); });
    await page.click('#aend-3 .btn-fortryd');
    await page.waitForFunction(() => document.getElementById('aend-fejl-3').textContent.length > 0);
    check((await page.textContent('#aend-fejl-3')) === 'Rækken er ændret siden — fortryd den nyeste ændring først', 'Afvist fortryd: databasens forklaring vises ved ændringen');
    check(errs.length === 0, 'Desktop: ingen JS-fejl' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  }

  // ================= MOBIL =================
  {
    const { ctx, page, errs } = await setup(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
    await page.tap('#row-t1 button:has-text("Ret")');
    await page.fill('#ret-ind-t1', '2650'); await page.tap('#ret-t1 button:has-text("Gem")');
    await page.waitForSelector('#aendringListe .btn-fortryd');
    const lay = await page.evaluate(() => ({ bredde: document.documentElement.scrollWidth,
      knap: document.querySelector('#aendringListe .btn-fortryd').getBoundingClientRect().height }));
    check(lay.bredde <= 390, `Mobil: ingen vandret scroll (bredde ${lay.bredde})`);
    check(lay.knap >= 40, `Mobil: Fortryd-knappen er stor nok til at trykke på (${Math.round(lay.knap)} px)`);
    await page.tap('#aendringListe .btn-fortryd');
    await page.waitForFunction(() => document.querySelector('#row-t1 td:nth-child(3)')?.textContent.trim() === '2.500,00');
    check(true, 'Mobil: Fortryd virker');
    check(errs.length === 0, 'Mobil: ingen JS-fejl' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  }

  // ================= Før migrationen er kørt =================
  {
    const { ctx, page, errs } = await setup(browser, { viewport: { width: 1200, height: 800 } }, { gammel: true });
    await page.click('#row-t1 button:has-text("Ret")');
    await page.fill('#ret-ind-t1', '2650'); await page.click('#ret-t1 button:has-text("Gem")');
    await page.waitForFunction(() => document.querySelector('#row-t1 td:nth-child(3)')?.textContent.trim() === '2.650,00');
    check(!(await page.isVisible('#aendringCard')), 'Uden hent_aendringer i databasen: kortet er skjult, Ret virker som i dag');
    check(errs.length === 0, 'Ingen JS-fejl');
    await ctx.close();
  }

  await browser.close();
  console.log(fails ? `\n${fails} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(fails ? 1 : 0);
})();
