// Dashboardets "Kontrol af måneden": antal fund øverst, knap til rækken (Åbn i Ret med billede), "Kontrolleret – OK" der huskes,
// ingen automatiske rettelser, månedsskift og rettelse via Ret. Desktop og mobil (touch).
const { chromium, devices } = require('playwright');
const path = require('path');

const BASE = 'https://vehgabygvxnkrqsoazfs.supabase.co';
const SIDE = path.join(__dirname, '..', '..', 'site', 'dashboard.html');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const v = (id, dato, nr, ch, ind, ovf, s, e, extra = {}) => ({ id, dato, slutrapport_nr: nr, chauffor: ch, indkort: ind, overfort: ovf, kontant: 0, vagt_start: s, vagt_slut: e, billede_url: null, bekraeftet: false, ...extra });
const regnskab = d => { const [y, m, dd] = d.split('-').map(Number); const t = dd >= 28 ? new Date(Date.UTC(y, m, 1)) : new Date(Date.UTC(y, m - 1, 1)); return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0'); };
const nyData = () => [
  v('rA', '2026-09-02', '1801', 'Adan', 3000, 3000, '06:00', '14:00'),
  v('rB', '2026-09-03', '1802', 'Fuad', 3010, 3010, '06:00', '14:00'),
  v('rC', '2026-09-05', '1805', 'Qaalid', 3100, 3100, '06:00', '14:00'),                                   // hul: 1803–1804 mangler
  v('rD', '2026-09-11', '1150', 'Adan', 4904, 4929, '02:13', '13:31', { billede_url: 'https://example.test/d.jpg' }),
  v('rE', '2026-09-11', '1150', 'Fuad', 4904, 4929, '02:13', '13:31', { billede_url: 'https://example.test/e.jpg' }),   // samme nr hos to chauffører + samme dato og beløb
  v('rF', '2026-09-13', '2303', 'Qaalid', 3555, 3375, '09:00', '17:00'),                                   // VDT(Tk)-tallet læst som nummer
  v('rG', '2026-09-18', '1610', 'Faysal', 2000, 1400, '06:00', '23:00'),                                   // stor difference (600) + 17 t
  v('rH', '2026-09-18', '1612', 'Adan', 2500, 2500, '20:00', '23:59'),                                     // overlap med rG (samme bil) + hul: 1611 mangler
  v('rL', '2026-09-10', '1149', 'Qaalid', 3050, 3050, '06:00', '14:00'),                                   // naboer til 1150 (11xx-bilens række)
  v('rM', '2026-09-12', '1151', 'Faysal', 3060, 3060, '06:00', '14:00'),
  v('rI', '2026-08-27', '1800', 'Fuad', 2900, 2900, '06:00', '14:00'),                                     // forrige regnskabsmåned (2026-08)
  v('rJ', '2026-09-28', '1806', 'Adan', 3200, 3200, '06:00', '14:00'),                                     // 28/9 tæller til 2026-10
  v('rK', '2026-10-05', '1809', 'Fuad', 3300, 3300, '06:00', '14:00'),                                     // hul 1807–1808 (rapporteres i 2026-10)
];
const FORVENTET = { nr_flere_chauffoerer: 1, samme_dato_beloeb: 1, nr_er_vdt: 1, stor_difference: 1, vagtlaengde: 1, overlap: 1 };   // 6 fund i 2026-09 (+ 2 spørgsmål om huller)

let failures = 0;
const check = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

// Falsk database. okLog og rows overlever en genindlæsning af siden (som en rigtig database).
function lavDb({ okMangler = false } = {}) {
  const db = { rows: nyData(), okLog: [], kald: [], okMangler };
  db.okNu = () => { const sidst = new Map(); db.okLog.forEach(l => sidst.set(l.noegle, l)); return [...sidst.values()].filter(l => l.handling === 'ok'); };
  return db;
}
const klar = (page, m) => page.waitForFunction(m => { const i = document.getElementById('kontrolInfo').textContent, a = document.getElementById('kontrolAntal').textContent;
  return i.includes('Regnskabsmåned ' + m) && !/…/.test(a); }, m, { timeout: 8000 });
async function vaelgMaaned(page, m) {
  await page.waitForFunction(m => [...document.getElementById('month').options].some(o => o.value === m), m);
  await page.selectOption('#month', m);
  await klar(page, m);
}
async function aabn(browser, db, opts) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const fejl = []; let dialoger = 0;
  page.on('pageerror', e => fejl.push(e.message));
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) fejl.push(m.text()); });
  page.on('dialog', d => { dialoger++; d.dismiss(); });
  await page.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(`${BASE}/rest/v1/rpc/`)) {
      const fn = url.split('/rpc/')[1];
      const body = JSON.parse(route.request().postData() || '{}');
      db.kald.push({ fn, body });
      if (body.p_token !== 'ejer') return route.fulfill({ json: [] });
      if (fn === 'hent_alle') return route.fulfill({ json: ['2026-09', '2026-10'].filter(m => !body.p_maaned || m === body.p_maaned).map(m => ({ chauffor: 'Adan', regnskabsmaaned: m, antal_ture: 1, indkort_i_alt: 1000, overfort_i_alt: 1000, afregn_difference: 0, kontant_i_alt: 0, bro_faerge_i_alt: 0, model: '48%', andel_brutto: 480, til_udbetaling: 480 })) });
      if (fn === 'hent_ture') return route.fulfill({ json: db.rows.filter(r => regnskab(r.dato) === body.p_maaned) });
      if (fn === 'hent_chauffoer_biler') return db.biler ? route.fulfill({ json: db.biler }) : route.fulfill({ status: 404, json: { message: 'function not found' } });
      if (fn === 'hent_kontrol_ok') return db.okMangler ? route.fulfill({ status: 404, json: { message: 'function not found' } }) : route.fulfill({ json: db.okNu().map(l => ({ noegle: l.noegle, type: l.type, hvem: 'ejer (dashboard)', tidspunkt: '2026-10-02T10:00:00Z' })) });
      if (fn === 'saet_kontrol_ok') {
        if (db.okMangler) return route.fulfill({ status: 404, json: { message: 'function not found' } });
        const sidst = db.okLog.filter(l => l.noegle === body.p_noegle).pop();
        if (!((sidst && sidst.handling === 'ok') === body.p_ok)) db.okLog.push({ noegle: body.p_noegle, type: body.p_type, handling: body.p_ok ? 'ok' : 'fortryd_ok', raekker: body.p_raekker });
        return route.fulfill({ status: 204, body: '' });
      }
      if (fn === 'ret_slutrapport') {
        const r = db.rows.find(x => x.id === body.p_id);
        if (r) { if (body.p_dato) r.dato = body.p_dato; if (body.p_indkort != null) r.indkort = body.p_indkort; if (body.p_overfort != null) r.overfort = body.p_overfort; if (body.p_slutrapport_nr) r.slutrapport_nr = body.p_slutrapport_nr; }
        return route.fulfill({ status: 204, body: '' });
      }
      return route.fulfill({ json: [] });
    }
    if (url.startsWith('https://example.test/')) return route.fulfill({ status: 200, contentType: 'image/jpeg', body: PNG });
    if (url.startsWith(`${BASE}/storage/`)) return route.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    if (url.startsWith('file://')) return route.continue();
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('file://' + SIDE + '?k=ejer');
  // Dashboardet åbner på den nyeste måned (2026-10); testen vælger septembers regnskabsmåned, som en bruger ville
  await vaelgMaaned(page, '2026-09');
  await page.waitForSelector('#rapporter table', { timeout: 8000 });
  return { ctx, page, fejl, dialoger: () => dialoger };
}
const antal = page => page.textContent('#kontrolAntal');
const spm = async page => (await page.$eval('#kontrolSpoergsmaalAntal', e => e.classList.contains('hidden') ? '' : e.textContent));
const fundTyper = page => page.$$eval('#kontrolListe .fund:not(.ok)', ds => ds.reduce((o, d) => (o[d.dataset.type] = (o[d.dataset.type] || 0) + 1, o), {}));
const skrivEnd = db => db.kald.filter(k => /^(ret_slutrapport|opret_slutrapport|saet_bekraeftet|fortryd_aendring|marker_fejl)$/.test(k.fn));

(async () => {
  const browser = await chromium.launch();
  for (const [navn, opts] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['mobil', { ...devices['iPhone 13'] }]]) {
    const db = lavDb();
    let { ctx, page, fejl, dialoger } = await aabn(browser, db, opts);

    // 1) Antal fund øverst + typer
    check(await antal(page) === '6 fund', `${navn}: antal fund øverst: "6 fund"`);
    check(JSON.stringify(Object.entries(await fundTyper(page)).sort()) === JSON.stringify(Object.entries(FORVENTET).sort()), `${navn}: de syv kontroltyper med de forventede antal (1 af hver)`);
    const chips = await page.$$eval('.kontrol-chip', cs => cs.map(c => c.textContent));
    check(chips.length === 6 && chips.includes('Nummer er VDT(Tk)-tallet: 1') && !chips.some(c => /Mangler|Hul/.test(c)) && chips.includes('Samme nr hos flere chauffører: 1'), `${navn}: oversigt pr. type (chips)`);
    const info = await page.textContent('#kontrolInfo');
    check(info.includes('2026-09') && info.includes('10 vagter kontrolleret'), `${navn}: viser regnskabsmåned og antal kontrollerede vagter (${info.slice(0, 60)}…)`);
    check((await page.textContent('#kontrolListe .fund .fund-forslag')).startsWith('Forslag:'), `${navn}: hvert fund har et forslag`);
    // Huller er spørgsmål, ikke fejl: eget afsnit og egen tæller, med nabovagterne før og efter
    check(await spm(page) === '2 spørgsmål' && (await page.$$('#kontrolListe [data-type="hul_i_raekken"]')).length === 0 && (await page.$$('#kontrolSpoergsmaal .fund.sp')).length === 2, `${navn}: huller står som "2 spørgsmål" i et eget afsnit, ikke blandt fundene`);
    const sp = await page.$eval('#kontrolSpoergsmaal', d => d.textContent);
    check(sp.includes('Spørgsmål: mangler der en bon?') && sp.includes('uden for lønsystemet'), `${navn}: afsnittet er formuleret som spørgsmål og nævner chauffører uden for lønsystemet`);
    const h1 = await page.$eval('#kontrolSpoergsmaal .fund.sp', d => d.textContent);
    check(h1.includes('nr 1803, 1804 mangler') && /Før\s*nr 1802 · Fuad · 3\/9 · 06:00–14:00/.test(h1) && /Efter\s*nr 1805 · Qaalid · 5\/9 · 06:00–14:00/.test(h1) && h1.includes('2 dage mellem'), `${navn}: hullet vises med nabovagterne (chauffør + dato før og efter) og dage imellem`);
    check((await page.$$eval('#kontrolSpoergsmaal [data-hul-ok]', bs => bs.map(b => b.textContent + ':' + b.dataset.hulOk))).join() === 'Kendt hul – OK:1803,Kendt hul – OK:1804,Kendt hul – OK:1611', `${navn}: "Kendt hul – OK" findes pr. manglende nummer (1803, 1804, 1611)`);
    check((await page.$$('#kontrolSpoergsmaal .fund.sp [data-aabn]')).length === 4, `${navn}: hver nabovagt har en knap til rækken`);
    if (navn === 'mobil') { const bs = await page.$$('#kontrolSpoergsmaal .hul-nr button'); const hs = await Promise.all(bs.map(async b => (await b.boundingBox()).height)); check(hs.every(h => h >= 44), `${navn}: kendt-hul-knapperne er store nok til touch (min ${Math.round(Math.min(...hs))} px)`); }
    const vdt = await page.$eval('#kontrolListe .fund[data-type="nr_er_vdt"]', d => d.textContent);
    check(vdt.includes('Nr 2303') && vdt.includes('VDT(Tk)') && vdt.includes('Åbn i Ret: Qaalid nr 2303'), `${navn}: nr 2303 vises som VDT(Tk)-tallet med knap til rækken`);
    check(skrivEnd(db).length === 0, `${navn}: kontrollen har ikke ændret noget (ingen ret/opret/bekræft-kald)`);
    const hentet = new Set(db.kald.filter(k => k.fn === 'hent_ture').map(k => k.body.p_maaned));
    check(['2026-08', '2026-09', '2026-10'].every(m => hentet.has(m)), `${navn}: hentede den valgte måned (2026-09) og begge nabomåneder (2026-08, 2026-10) til sammenligning`);

    if (process.env.SKAERM) await page.locator('#kontrolCard').screenshot({ path: process.env.SKAERM + `/kontrol-${navn}.png` });   // kun til manuel gennemsyn

    // 2) Åbn i Ret med billede, også for en anden chauffør end den valgte
    const nrFlere = '#kontrolListe .fund[data-type="nr_flere_chauffoerer"]';
    const knapper = await page.$$eval(`${nrFlere} [data-aabn]`, bs => bs.map(b => b.textContent));
    check(knapper.length === 2 && knapper.some(t => t.includes('Adan nr 1150')) && knapper.some(t => t.includes('Fuad nr 1150')), `${navn}: knap til hver række i fundet (Adan og Fuad nr 1150)`);
    await page.click(`${nrFlere} [data-aabn="rE"]`);
    await page.waitForSelector('#ret-rE:not(.hidden)');
    check(await page.inputValue('#driver') === 'Fuad' && await page.inputValue('#month') === '2026-09', `${navn}: Åbn i Ret skifter til chaufføren (Fuad) og måneden`);
    check(await page.isVisible('#ret-rE img.ret-billede') && (await page.getAttribute('#ret-rE img.ret-billede', 'src')) === 'https://example.test/e.jpg', `${navn}: Ret-panelet åbner med billedet`);
    check(await antal(page) === '6 fund', `${navn}: kontrol-kortet er uændret efter Åbn i Ret`);
    await page.click(`${nrFlere} [data-aabn="rD"]`);
    await page.waitForSelector('#ret-rD:not(.hidden)');
    check(await page.inputValue('#driver') === 'Adan' && await page.isVisible('#ret-rD img.ret-billede'), `${navn}: ...og til Adans række med hans billede`);
    check(skrivEnd(db).length === 0, `${navn}: Åbn i Ret ændrer intet`);

    // 3) Kontrolleret – OK, huskes
    const dato = '#kontrolListe .fund[data-type="samme_dato_beloeb"]';
    const okKnap = await page.$(`${dato} .btn-ok`);
    check(!!okKnap && (await okKnap.textContent()).includes('Kontrolleret – OK'), `${navn}: fund har knappen "Kontrolleret – OK"`);
    if (navn === 'mobil') { const bb = await okKnap.boundingBox(); check(bb.height >= 44 && bb.width >= 44, `${navn}: OK-knappen er stor nok til touch (${Math.round(bb.height)} px)`); }
    await page.click(`${dato} .btn-ok`);
    await page.waitForFunction(() => document.getElementById('kontrolAntal').textContent === '5 fund');
    const ok = db.kald.filter(k => k.fn === 'saet_kontrol_ok');
    check(ok.length === 1 && ok[0].body.p_ok === true && ok[0].body.p_type === 'samme_dato_beloeb' && ok[0].body.p_noegle.startsWith('samme_dato_beloeb|rD,rE|') && ok[0].body.p_raekker.join() === 'rD,rE' && ok[0].body.p_token === 'ejer', `${navn}: OK gemmes i databasen med nøgle, type og rækker`);
    check(!(await page.$(dato)) && await antal(page) === '5 fund', `${navn}: fundet forsvinder, og tallet bliver "5 fund"`);
    check(skrivEnd(db).length === 0, `${navn}: OK ændrer ingen vagter`);
    await page.reload(); await vaelgMaaned(page, '2026-09');
    check(await antal(page) === '5 fund' && !(await page.$(dato)), `${navn}: efter genindlæsning dukker det ikke op igen`);
    check(!(await page.$eval('#kontrolVisOkLabel', e => e.classList.contains('hidden'))) && (await page.textContent('#kontrolVisOkTekst')) === 'Vis kontrollerede (1)', `${navn}: "Vis kontrollerede (1)" findes`);
    await page.check('#kontrolVisOk');
    check(!!(await page.$(`${dato}.ok`)) && !!(await page.$(`${dato}.ok [data-fortryd-ok]`)), `${navn}: kontrollerede fund kan vises, med "Fortryd OK"`);
    await page.click(`${dato}.ok [data-fortryd-ok]`);
    await page.waitForFunction(() => document.getElementById('kontrolAntal').textContent === '6 fund');
    check(db.okNu().length === 0 && db.okLog.map(l => l.handling).join() === 'ok,fortryd_ok', `${navn}: Fortryd OK sætter fundet tilbage (loggen har ok og fortryd_ok)`);

    // 3b) Kendt hul pr. nummer
    const hulKald = () => db.kald.filter(k => k.fn === 'saet_kontrol_ok' && k.body.p_noegle.startsWith('hul_nr|'));
    await page.click('#kontrolSpoergsmaal [data-hul-ok="1803"]');
    await page.waitForFunction(() => !document.querySelector('#kontrolSpoergsmaal [data-nr="1803"]'));
    check(hulKald().length === 1 && hulKald()[0].body.p_noegle === 'hul_nr|1803' && hulKald()[0].body.p_type === 'hul_nr' && hulKald()[0].body.p_raekker.join() === 'rB,rC' && hulKald()[0].body.p_ok === true, `${navn}: kendt hul gemmes pr. nummer (hul_nr|1803) med nabovagterne`);
    check(await spm(page) === '2 spørgsmål' && !!(await page.$('#kontrolSpoergsmaal [data-nr="1804"]')), `${navn}: resten af hullet (1804) er stadig et åbent spørgsmål`);
    await page.click('#kontrolSpoergsmaal [data-hul-ok="1804"]');
    await page.waitForFunction(() => document.getElementById('kontrolSpoergsmaalAntal').textContent === '1 spørgsmål');
    check(await antal(page) === '6 fund' && (await page.$$('#kontrolSpoergsmaal .fund.sp')).length === 1, `${navn}: når alle numre i hullet er kendt, forsvinder spørgsmålet; fundene er uændrede ("6 fund")`);
    check(skrivEnd(db).length === 0, `${navn}: kendt hul ændrer ingen vagter`);
    await page.reload(); await vaelgMaaned(page, '2026-09');
    check(await spm(page) === '1 spørgsmål' && (await page.textContent('#kontrolVisOkTekst')) === 'Vis kontrollerede (2)', `${navn}: efter genindlæsning er de to kendte huller stadig kendt ("Vis kontrollerede (2)")`);
    await page.check('#kontrolVisOk');
    check((await page.$$('#kontrolSpoergsmaal .hul-nr.kendt')).length === 2, `${navn}: de kendte huller kan vises igen`);
    await page.click('#kontrolSpoergsmaal [data-hul-fortryd="1803"]');
    await page.waitForFunction(() => document.querySelector('#kontrolSpoergsmaal [data-hul-ok="1803"]'));
    check(await spm(page) === '2 spørgsmål' && hulKald().map(k => k.body.p_noegle + ':' + k.body.p_ok).join() === 'hul_nr|1803:true,hul_nr|1804:true,hul_nr|1803:false', `${navn}: Fortryd sætter 1803 tilbage som spørgsmål (logges som fortryd)`);
    await page.click('#kontrolSpoergsmaal [data-hul-fortryd="1804"]');
    await page.waitForFunction(() => document.querySelector('#kontrolSpoergsmaal [data-hul-alle]'));
    await page.click('#kontrolSpoergsmaal [data-hul-alle]');
    await page.waitForFunction(() => document.getElementById('kontrolSpoergsmaalAntal').textContent === '1 spørgsmål');
    check(db.okNu().filter(l => l.noegle.startsWith('hul_nr|')).map(l => l.noegle).sort().join() === 'hul_nr|1803,hul_nr|1804', `${navn}: "Alle 2 er kendte huller" markerer begge numre (hvert for sig)`);

    // 4) Månedsskift: kontrollen følger den valgte regnskabsmåned
    await page.selectOption('#month', '2026-10');
    await klar(page, '2026-10');
    check(await antal(page) === 'Ingen fund ✓' && await spm(page) === '1 spørgsmål' && (await page.textContent('#kontrolSpoergsmaal')).includes('nr 1807, 1808 mangler') && /Før\s*nr 1806 · Adan · 28\/9/.test(await page.textContent('#kontrolSpoergsmaal')) && /Efter\s*nr 1809 · Fuad · 5\/10/.test(await page.textContent('#kontrolSpoergsmaal')), `${navn}: 2026-10 har ingen fund, kun spørgsmålet om 1807–1808 med nabovagterne (hullet over månedsskiftet vises ikke i september)`);
    await page.selectOption('#month', '2026-09');
    await page.waitForFunction(() => document.getElementById('kontrolAntal').textContent === '6 fund');

    // 5) Rettelse går gennem Ret og logges; kontrollen opdateres bagefter
    await page.selectOption('#driver', 'Faysal');
    await page.waitForSelector('#row-rG');
    await page.evaluate(() => aabnRet('rG'));
    await page.fill('#ret-ovf-rG', '2000');
    await page.click('#ret-rG button:has-text("Gem")');
    await page.waitForFunction(() => document.getElementById('kontrolAntal').textContent === '5 fund', null, { timeout: 8000 });
    const retKald = db.kald.filter(k => k.fn === 'ret_slutrapport');
    check(retKald.length === 1 && retKald[0].body.p_id === 'rG' && retKald[0].body.p_overfort === 2000, `${navn}: rettelsen sendes gennem ret_slutrapport (som logger den)`);
    check(!((await fundTyper(page)).stor_difference), `${navn}: efter Ret er "Stor difference" væk, og kontrollen er opdateret ("5 fund")`);

    // 6) Mobil: ingen sidelæns rulning
    if (navn === 'mobil') check(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), `${navn}: ingen sidelæns rulning`);
    check(fejl.length === 0 && dialoger() === 0, `${navn}: ingen JS-fejl og ingen alert` + (fejl.length ? ': ' + fejl.join(' | ') : ''));
    await ctx.close();

    // 7) Databasen uden migrationen: fund vises, men uden OK-knapper
    const db2 = lavDb({ okMangler: true });
    ({ ctx, page, fejl } = await aabn(browser, db2, opts));
    check(await antal(page) === '6 fund' && await spm(page) === '2 spørgsmål' && (await page.$$('#kontrolCard .btn-ok')).length === 0, `${navn}: uden migrationen vises alle 6 fund og 2 spørgsmål, men ingen OK-knapper`);
    check((await page.textContent('#kontrolInfo')).includes('ikke slået til'), `${navn}: uden migrationen står der, at markering ikke er slået til`);
    check(fejl.length === 0, `${navn}: uden migrationen ingen JS-fejl`);
    await ctx.close();

    // 7b) Standardbil pr. chauffør: anden bil = markering, ikke fejl (Adan på 001-8646 den 9/9)
    const std = [2, 3, 4, 5, 6].map((d, i) => v('a' + i, `2026-09-0${d}`, String(1100 + i), 'Adan', 3000 + i, 3000 + i, '06:00', '14:00'))
      .concat([2, 3, 4, 5, 6, 7].map((d, i) => v('f' + i, `2026-09-0${d}`, String(1600 + i), i % 2 ? 'Faysal' : 'Fuad', 2500 + i, 2500 + i, '06:00', '14:00')))
      .concat([v('aX', '2026-09-09', '1606', 'Adan', 3300, 3300, '06:00', '14:00', { billede_url: 'https://example.test/ax.jpg' })]);
    const db4 = lavDb(); db4.rows = std;
    ({ ctx, page, fejl } = await aabn(browser, db4, opts));
    check(await antal(page) === 'Ingen fund ✓' && (await page.textContent('#kontrolMarkeringAntal')) === '1 markering' && (await spm(page)) === '', `${navn}: anden bil end standard er en markering ("1 markering"), ikke et fund ("Ingen fund ✓")`);
    const mkTxt = await page.$eval('#kontrolMarkeringer', d => d.textContent);
    check(mkTxt.includes('Markeringer: anden bil end standard') && mkTxt.includes('Adan kørte 001-8646') && mkTxt.includes('Standardbilen er 001-7144') && mkTxt.includes('en anden bil kan forekomme'), `${navn}: markeringen siger, hvilken bil Adan kørte, og hvad standarden er`);
    check((await page.textContent('#kontrolInfo')).includes('Standardbiler: indbygget'), `${navn}: uden databasen bruges de indbyggede standardbiler (og det står der)`);
    await page.click('#kontrolMarkeringer [data-aabn="aX"]');
    await page.waitForSelector('#ret-aX:not(.hidden)');
    check(await page.inputValue('#driver') === 'Adan' && await page.isVisible('#ret-aX img.ret-billede'), `${navn}: markeringen har knap til rækken (Åbn i Ret med billede)`);
    await page.click('#kontrolMarkeringer .btn-ok');
    await page.waitForFunction(() => document.getElementById('kontrolMarkeringAntal').classList.contains('hidden'));
    check(db4.okLog.length === 1 && db4.okLog[0].type === 'afvigende_bil' && db4.okLog[0].noegle.startsWith('afvigende_bil|aX|') && skrivEnd(db4).length === 0, `${navn}: "Kendt – OK" gemmes (afvigende_bil|aX|…) og ændrer ingen vagter`);
    await ctx.close();
    // Standardbilen kommer fra databasen, når den findes: Adan = 8646 -> ingen afvigelse
    const db5 = lavDb(); db5.rows = std; db5.biler = [{ chauffor: 'Adan', taxi_nr: '001-8646' }, { chauffor: 'Fuad', taxi_nr: '001-8646' }, { chauffor: 'Faysal', taxi_nr: '001-8646' }];
    ({ ctx, page, fejl } = await aabn(browser, db5, opts));
    check(await antal(page) === 'Ingen fund ✓' && (await page.$eval('#kontrolMarkeringAntal', e => e.classList.contains('hidden'))) && (await page.textContent('#kontrolInfo')).includes('Standardbiler: databasen'), `${navn}: standardbilerne hentes fra databasen (Adan = 8646: ingen markering)`);
    check(fejl.length === 0, `${navn}: ingen JS-fejl`);
    await ctx.close();

    // 8) Ingen fund
    const db3 = lavDb(); db3.rows = [v('x1', '2026-09-02', '1801', 'Adan', 3000, 3000, '06:00', '14:00'), v('x2', '2026-09-03', '1802', 'Fuad', 3010, 3010, '06:00', '14:00')];
    ({ ctx, page } = await aabn(browser, db3, opts));
    check(await antal(page) === 'Ingen fund ✓' && (await page.textContent('#kontrolListe')).includes('Ingen fund i 2026-09'), `${navn}: ingen fund: "Ingen fund ✓"`);
    await ctx.close();
  }
  await browser.close();
  console.log(failures ? `\n${failures} FEJL` : '\nALLE TESTS BESTÅET');
  process.exit(failures ? 1 : 0);
})();
