// Kontrollerne i site/kontroller.js (bruges af dashboardets "Kontrol af måneden" og senere af den nye indlæsning).
const K = require('../../site/kontroller.js');
// De fleste tests her kører uden standardbiler (alle kører alle biler); standardbil og markering testes for sig nederst.
const STD = { ...K.STANDARD.STANDARD_BIL }; K.STANDARD.STANDARD_BIL = {};
let fails = 0; const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
let n = 0;
const r = (o) => ({ id: 'r' + String(++n).padStart(3, '0'), maaned: '2026-09', vagt_start: '06:00', vagt_slut: '14:00', indkort: 3000, overfort: 3000, ...o });
const typer = res => res.fund.map(f => f.type);
const af = (res, t) => res.fund.filter(f => f.type === t);
const rent = (rows, m = '2026-09') => K.kontrolMaaned(rows, m);

// Et rent grundmateriale: tre biler, chauffører roterer, ingen fejl
function rent_materiale() {
  const out = []; let a = 1800, b = 1100, c = 1600;
  const navne = ['Adan', 'Fuad', 'Qaalid', 'Faysal'];
  for (let dag = 1; dag <= 20; dag++) {
    const d = `2026-09-${String(dag).padStart(2, '0')}`;
    out.push(r({ dato: d, slutrapport_nr: String(a++), chauffor: navne[dag % 4], vagt_start: '06:00', vagt_slut: '14:00', indkort: 3000 + dag, overfort: 2990 + dag }));
    out.push(r({ dato: d, slutrapport_nr: String(b++), chauffor: navne[(dag + 1) % 4], vagt_start: '14:30', vagt_slut: '23:00', indkort: 2500 + dag, overfort: 2500 + dag }));
    out.push(r({ dato: d, slutrapport_nr: String(c++), chauffor: navne[(dag + 2) % 4], vagt_start: '22:00', vagt_slut: '06:00', indkort: 2000 + dag, overfort: 1995 + dag }));
  }
  return out;
}
const base = rent_materiale();
check(rent(base).fund.length === 0 && rent(base).uden_tider === 0, 'Rent materiale (alle chauffører kører alle biler, nattevagter over midnat): 0 fund');
check(K.bilFraNr('1101') === '001-7144' && K.bilFraNr(' 1650 ') === '001-8646' && K.bilFraNr('1899') === '001-8208' && K.bilFraNr('1200') === null && K.bilFraNr('1099') === null && K.bilFraNr('2303') === null && K.bilFraNr('11012') === null && K.bilFraNr('abc') === null, 'bilFraNr: områdegrænser 1100/1199, 1600/1699, 1800/1899; alt andet er null');

// 1) Samme nr hos flere chauffører
let m = base.concat([r({ dato: '2026-09-11', slutrapport_nr: '1150', chauffor: 'Adan', indkort: 4904, overfort: 4929, vagt_start: '02:13', vagt_slut: '13:31' }),
                     r({ dato: '2026-09-11', slutrapport_nr: ' 1150 ', chauffor: 'Fuad', indkort: 4904, overfort: 4929, vagt_start: '02:13', vagt_slut: '13:31' })]);
let res = rent(m);
let f1 = af(res, 'nr_flere_chauffoerer');
check(f1.length === 1 && f1[0].raekker.length === 2 && /række 1100–1150/.test(f1[0].tekst) && /Adan og Fuad/.test(f1[0].tekst), 'Samme nr hos to chauffører (1150 hos Adan og Fuad, nr med mellemrum) = ét fund');
check(af(res, 'overlap').filter(f => f.raekker.length === 2 && /1112/.test(f.tekst)).length === 0, 'Samme nr i samme bil giver ikke også et overlap-fund (det er en dublet)');
check(af(res, 'samme_dato_beloeb').length === 1, 'De samme to rækker er også samme dato og beløb (eget fund)');
check(K.kontrolMaaned(m, '2026-10').fund.length === 0, 'Fund hører til den valgte måned: i en anden måned vises de ikke');

// 2) Uden for områder
m = base.concat([r({ dato: '2026-09-13', slutrapport_nr: '2303', chauffor: 'Qaalid', vagt_start: '09:00', vagt_slut: '12:00', indkort: 3555, overfort: 3375 }),
                 r({ dato: '2026-09-14', slutrapport_nr: '1087', chauffor: 'Qaalid', vagt_start: '03:00', vagt_slut: '05:30' }), r({ dato: '2026-09-15', slutrapport_nr: '', chauffor: 'Adan' }), r({ dato: '2026-09-15', slutrapport_nr: 'abc', chauffor: 'Fuad' })]);
res = rent(m);
check(af(res, 'nr_uden_for_omraade').map(f => f.tekst.match(/Nr (\S+)/)[1]).sort().join() === '(tomt),abc', 'Uden for rækken: tomt nummer og "abc" (ikke firecifrede tal)');
check(af(res, 'nr_er_vdt').map(f => f.tekst.match(/Nr (\S+)/)[1]).join() === '2303' && /VDT\(Tk\)/.test(af(res, 'nr_er_vdt')[0].tekst), 'Nr 2303 (ensomt, i 2200–2399) markeres som VDT(Tk)-tallet, ikke som "uden for rækken"');
check(!res.fund.some(f => f.raekker.length === 1 && /Nr 1087/.test(f.tekst) && f.type === 'nr_uden_for_omraade'), '1087 ligger 13 fra 1100 og er ikke "uden for rækken" (naboer, ikke faste blokke)');

// Naboer ±50 frem for faste 100-blokke (1095–1098 blev tidligere fejlmarkeret, hullet 1099–1100 skjult)
const nb = (nr, dag, ch = 'Adan', extra = {}) => r({ dato: `2026-09-${String(dag).padStart(2, '0')}`, slutrapport_nr: String(nr), chauffor: ch, vagt_start: '06:00', vagt_slut: '14:00', indkort: 3000 + nr % 97, overfort: 3000 + nr % 97, ...extra });
const uf = rows => af(K.kontrolMaaned(rows, '2026-09'), 'nr_uden_for_omraade').map(f => f.tekst.match(/Nr (\S+)/)[1]).sort().join();
const aug = [nb(1095, 2), nb(1096, 3), nb(1097, 4), nb(1098, 5), nb(1101, 6), nb(1102, 7), nb(1105, 8)];
check(uf(aug) === '', '1095–1098 ligger i samme række som 1101 og er ikke længere "uden for områderne"');
const hullAug = af(K.kontrolMaaned(aug, '2026-09'), 'hul_i_raekken');
check(hullAug.some(x => x.identitet === 'hul_i_raekken|1098|1101' && /nr 1099, 1100 mangler/.test(x.tekst)), 'Hullet 1099–1100 mellem 1098 og 1101 vises nu (var skjult med faste blokke)');
check(uf([nb(1300, 2), nb(1350, 3)]) === '' && uf([nb(1300, 2), nb(1351, 3)]) === '1300,1351', 'Grænsen er præcis 50: 1300 og 1350 er naboer; 1300 og 1351 er hver for sig uden for rækken');
check(uf([nb(1300, 2), nb(1300, 3, 'Fuad')]) === '1300,1300', 'To vagter med samme nummer er ikke naboer til hinanden (samme nummer bekræfter ikke sig selv)');
check(uf([nb(1500, 2, 'Adan'), nb(1530, 3, 'Fuad')]) === '', 'Naboen kan være en anden chaufførs vagt');
check(uf([nb(1500, 2), nb(1540, 3), nb(1580, 4), nb(1620, 5)]) === '' && af(K.kontrolMaaned([nb(1500, 2), nb(1540, 3), nb(1580, 4), nb(1620, 5)], '2026-09'), 'hul_i_raekken').length === 4 - 1, 'Kæde af naboer (40 mellem hver) er én række');
check(uf([nb(1500, 2), nb(1551, 3, 'Fuad', { id: 'x' })]) === '1500,1551', 'Uden nogen vagt inden for 50 er nummeret uden for rækken, uanset chauffør');
const vf = rows => af(K.kontrolMaaned(rows, '2026-09'), 'nr_er_vdt').map(f => f.tekst.match(/Nr (\S+)/)[1]).sort().join();
check(vf([nb(2285, 20), nb(1800, 2), nb(1801, 3)]) === '2285', 'VDT(Tk): 2285 (ensomt) markeres');
check(vf([nb(2200, 2), nb(2399, 3)]) === '2200,2399' && vf([nb(2199, 2), nb(2400, 3)]) === '' && uf([nb(2199, 2), nb(2400, 3)]) === '2199,2400', 'VDT-intervallet 2200–2399: grænserne er med; 2199 og 2400 er almindeligt "uden for rækken"');
check(vf([nb(2285, 2), nb(2300, 3)]) === '', 'To numre i 2200–2399 tæt på hinanden er en række og ikke VDT');
check(vf([nb(1850, 2, 'Adan', { vdt_tk: '1850' }), nb(1851, 3)]) === '1850' && vf([nb(1850, 2, 'Adan', { vdt_tk: '1999' }), nb(1851, 3)]) === '', 'Er VDT(Tk) læst fra bonen og lig nummeret, markeres det, også i en række; ellers ikke');
check(uf([nb(2285, 20)]) === '' && af(K.kontrolMaaned([nb(2285, 20)], '2026-09'), 'nr_uden_for_omraade').length === 0, 'VDT-fundet erstatter "uden for rækken" (ingen dobbelt-fund på samme række)');
// taxi_nr fra bonen: kun naboer i samme bil tæller
check(uf([nb(1850, 2, 'Adan', { taxi_nr: '001-8208' }), nb(1851, 3, 'Fuad', { taxi_nr: '001-8646' })]) === '1850,1851' && uf([nb(1850, 2, 'Adan', { taxi_nr: '001-8208' }), nb(1851, 3, 'Fuad', { taxi_nr: '001-8208' })]) === '', 'Med taxi_nr på bonen tæller kun naboer i samme bil');

// 3) Overlap
const o1 = r({ dato: '2026-09-05', slutrapport_nr: '1805', chauffor: 'Adan', vagt_start: '06:00', vagt_slut: '14:00' });
const o2 = r({ dato: '2026-09-05', slutrapport_nr: '1604', chauffor: 'Adan', vagt_start: '13:00', vagt_slut: '20:00' });       // samme chauffør, anden bil, 60 min
const o3 = r({ dato: '2026-09-05', slutrapport_nr: '1806', chauffor: 'Fuad', vagt_start: '10:00', vagt_slut: '16:00' });       // anden chauffør, samme bil som o1
const o4 = r({ dato: '2026-09-05', slutrapport_nr: '1807', chauffor: 'Qaalid', vagt_start: '14:03', vagt_slut: '20:00' });     // 3 min efter o1 slut, samme bil: under tolerance
const rowsO = [o1, o2, o3, o4];
res = K.kontrolMaaned(rowsO, '2026-09');
const ov = af(res, 'overlap');
check(ov.length === 3 && ov.some(f => f.raekker.includes(o1.id) && f.raekker.includes(o2.id) && /samme chauffør/.test(f.tekst) && /60 min/.test(f.tekst)), 'Samme chauffør i to biler på samme tid: overlap på 60 min');
check(ov.some(f => f.raekker.includes(o1.id) && f.raekker.includes(o3.id) && /samme bil \(række 1805–1807\)/.test(f.tekst)) && ov.some(f => f.raekker.includes(o3.id) && f.raekker.includes(o4.id) && /samme bil/.test(f.tekst)), 'To chauffører i samme bil på samme tid: overlap');
check(!ov.some(f => f.raekker.includes(o1.id) && f.raekker.includes(o4.id)), 'Overlap på 0 min og ≤ 5 min ignoreres (vagtskifte); o1 slutter 14:00, o4 starter 14:03');
const natA = r({ dato: '2026-09-06', slutrapport_nr: '1810', chauffor: 'Fuad', vagt_start: '22:00', vagt_slut: '06:00' });
const natB = r({ dato: '2026-09-07', slutrapport_nr: '1811', chauffor: 'Adan', vagt_start: '05:00', vagt_slut: '12:00' });      // overlapper nattens slut (7/9 kl. 5–6) i samme bil
check(af(K.kontrolMaaned([natA, natB], '2026-09'), 'overlap').length === 1 && af(K.kontrolMaaned([natA, natB], '2026-09'), 'overlap')[0].tekst.includes('60 min'), 'Nattevagt over midnat overlapper næste dags tidlige vagt (60 min)');
const mangler = r({ dato: '2026-09-05', slutrapport_nr: '1808', chauffor: 'Adan', vagt_start: null, vagt_slut: null });
res = K.kontrolMaaned([o1, mangler], '2026-09');
check(af(res, 'overlap').length === 0 && res.uden_tider === 1, 'Vagt uden tider kan ikke tjekkes for overlap, men tælles som "uden tider"');

// 4) Samme dato + beløb
m = base.concat([r({ dato: '2026-09-04', slutrapport_nr: '1160', chauffor: 'Adan', indkort: 3004, overfort: 2994, vagt_start: '07:00', vagt_slut: '09:00' })]);
res = rent(m);
check(af(res, 'samme_dato_beloeb').length === 1 && /3\.004/.test(af(res, 'samme_dato_beloeb')[0].tekst), 'Samme dato og samme indkørt (3.004) hos to vagter: ét fund');
check(af(rent(base.concat([r({ dato: '2026-09-04', slutrapport_nr: '1104', chauffor: 'Adan', indkort: 0, overfort: 0, vagt_start: '07:00', vagt_slut: '09:00' }), r({ dato: '2026-09-04', slutrapport_nr: '1105', chauffor: 'Fuad', indkort: 0, overfort: 0, vagt_start: '07:00', vagt_slut: '09:00' })])), 'samme_dato_beloeb').length === 0, 'Beløb 0 tæller ikke som samme beløb');

// 5) Stor difference
const dd = (ind, ovf) => K.storDifference({ indkort: ind, overfort: ovf });
check(dd(5455, 4675) && dd(5455, 4675).diff === 780 && dd(3707, 2961) && dd(2226, 1756) && dd(353, 160), 'Stor difference: 780 (≥ 500), 746 (≥ 500), 470 af 2.226 (21 %), 193 af 353 (55 %)');
check(!dd(3000, 3000) && !dd(3000, 2900) && !dd(5000, 4650) && !dd(1700, 1400) && !dd(null, 100) && !dd('', ''), 'Ikke stor: 0, 100 af 3.000 (3 %), 350 af 5.000 (7 %), 300 af 1.700 (17,6 %), manglende tal');
check(dd(1000, 800) && !dd(1000, 801) && dd(5000, 4500) && !dd(5000, 4501), 'Grænser: 20 % af 1.000 (200) ja, 199 nej; 500 kr ja, 499 nej');
check(dd(3000, 3600).diff === -600 && /Overført er større/.test(af(rent([r({ dato: '2026-09-08', slutrapport_nr: '1811', chauffor: 'Adan', indkort: 3000, overfort: 3600 })]), 'stor_difference')[0].tekst), 'Negativ difference (overført > indkørt) fanges og forklares');

// 6) Vagtlængde
const L = (s, e) => r({ dato: '2026-09-09', slutrapport_nr: '1812', chauffor: 'Adan', vagt_start: s, vagt_slut: e });
const lf = (s, e) => af(rent([L(s, e)]), 'vagtlaengde').length;
check(lf('06:00', '08:59') === 1 && lf('06:00', '09:00') === 0 && lf('06:00', '22:00') === 0 && lf('06:00', '22:01') === 1 && lf('22:00', '06:00') === 0, 'Vagtlængde: under 3 t og over 16 t (grænserne 3:00 og 16:00 er ok); 22:00–06:00 er 8 t');
check(lf('06:00', '06:00') === 1 && lf('02:13', '13:31') === 0 && lf('16:02', '06:41') === 0 && lf('6:00', '14:00') === 0, 'Vagt på 0 min fanges; 02:13–13:31 og 16:02–06:41 (rigtige vagter) er ok; "6:00" uden nul forstås');
check(K.vagtLaengdeMin({ dato: '2026-09-09', vagt_start: '22:00', vagt_slut: '06:00' }) === 480 && K.vagtLaengdeMin({ dato: '2026-09-09', vagt_start: '', vagt_slut: '06:00' }) === null, 'vagtLaengdeMin: nat = 480 min; manglende tid = null');

// 7) Huller
m = rent_materiale().filter(x => !['1805', '1806', '1610'].includes(x.slutrapport_nr));
res = rent(m);
const h = af(res, 'hul_i_raekken');
check(h.length === 2 && h.some(x => x.fra === 1804 && x.til === 1807 && /nr 1805, 1806 mangler/.test(x.tekst)) && h.some(x => x.fra === 1609 && x.til === 1611 && /nr 1610 mangler/.test(x.tekst)), 'Hul: 1805–1806 mangler (2 numre), 1610 mangler (1 nummer); ét fund pr. hul');
check(h.every(x => x.raekker.length === 2), 'Hvert hul peger på de to nabovagter (til "Åbn i Ret")');
const h1805 = h.find(x => x.fra === 1804);
check(h.every(x => x.spoergsmaal === true) && K.TYPER.hul_i_raekken.spoergsmaal === true && K.TYPER.hul_i_raekken.titel === 'Mangler der en bon?' && !Object.entries(K.TYPER).some(([t, v]) => t !== 'hul_i_raekken' && v.spoergsmaal), 'Huller er spørgsmål (spoergsmaal: true), ingen anden kontrol er det');
check(JSON.stringify(h1805.mangler) === '[1805,1806]' && h1805.foer.nr === '1804' && h1805.efter.nr === '1807' && h1805.foer.chauffor && h1805.foer.dato && h1805.efter.chauffor && h1805.efter.dato && h1805.foer.id !== h1805.efter.id, 'Hullet kender de manglende numre og nabovagterne før og efter (nr, chauffør, dato)');
check(h1805.dage === 3 && K.hulNoegle(1805) === 'hul_nr|1805' && /uden for lønsystemet/.test(K.FORSLAG.hul_i_raekken), 'Dage mellem nabovagterne, nøgle pr. nummer (hul_nr|1805), og forslaget nævner chauffører uden for lønsystemet');
const dagH = af(K.kontrolMaaned([r({ slutrapport_nr: '1800', dato: '2026-09-03', chauffor: 'Fuad' }), r({ slutrapport_nr: '1803', dato: '2026-09-06', chauffor: 'Adan' })], '2026-09'), 'hul_i_raekken')[0];
check(dagH.dage === 3 && dagH.foer.dato === '2026-09-03' && dagH.efter.dato === '2026-09-06' && dagH.foer.chauffor === 'Fuad' && dagH.efter.chauffor === 'Adan', 'Hul over flere dage: 3 dage mellem Fuads 3/9 og Adans 6/9');
// tjekNy: et hul er et spørgsmål og må ikke blive en afvigelse for en ny bon
const tnHul = K.tjekNy({ dato: '2026-09-20', slutrapport_nr: '1835', chauffor: 'Adan', indkort: 3000, overfort: 3000, vagt_start: '06:00', vagt_slut: '14:00' }, [r({ dato: '2026-09-19', slutrapport_nr: '1830', chauffor: 'Fuad' })]);
check(tnHul.length === 1 && tnHul[0].type === 'hul_i_raekken' && tnHul[0].spoergsmaal === true, 'tjekNy: en ny bon med hul foran er markeret som spørgsmål (spoergsmaal: true), så indlæsningen ikke sender den til godkendelse');
const stort = rent(rent_materiale().filter(x => !(Number(x.slutrapport_nr) >= 1805 && Number(x.slutrapport_nr) <= 1812)));
check(af(stort, 'hul_i_raekken').length === 1 && /nr 1805–1812 \(8 numre\)/.test(af(stort, 'hul_i_raekken')[0].tekst), 'Stort hul vises som interval (nr 1805–1812, 8 numre)');
// månedsskifte: hul rapporteres én gang, i måneden efter hullet
const okt = [r({ dato: '2026-09-27', maaned: '2026-09', slutrapport_nr: '1850', chauffor: 'Adan' }), r({ dato: '2026-09-28', maaned: '2026-10', slutrapport_nr: '1853', chauffor: 'Fuad', vagt_start: '07:00', vagt_slut: '15:00', indkort: 3100, overfort: 3100 })];
check(af(K.kontrolMaaned(okt, '2026-10'), 'hul_i_raekken').length === 1 && af(K.kontrolMaaned(okt, '2026-09'), 'hul_i_raekken').length === 0, 'Hul over månedsskiftet: vises kun i måneden, hvor vagten efter hullet ligger (ikke to gange)');
check(af(K.kontrolMaaned(okt.slice(1), '2026-10'), 'hul_i_raekken').length === 0, 'Uden nabomåneden ses hullet ikke (derfor hentes nabomånederne)');
check(af(rent([r({ slutrapport_nr: '1803', dato: '2026-09-03' }), r({ slutrapport_nr: '1803', dato: '2026-09-03', chauffor: 'Fuad', id: 'x' })]), 'hul_i_raekken').length === 0, 'Samme nummer to gange giver ikke hul');

// Nøgler
const a1 = af(rent(m = base.concat([r({ dato: '2026-09-04', slutrapport_nr: '1160', chauffor: 'Adan', indkort: 3004, overfort: 2994, vagt_start: '07:00', vagt_slut: '09:00' })])), 'samme_dato_beloeb')[0];
const a2 = af(rent(m), 'samme_dato_beloeb')[0];
check(a1.noegle === a2.noegle && a1.noegle.startsWith(a1.identitet + '|') && a1.identitet.startsWith('samme_dato_beloeb|'), 'Nøglen er stabil mellem kørsler: identitet + fingeraftryk');
const ændret = m.map(x => x.slutrapport_nr === '1160' ? { ...x, vagt_slut: '09:30' } : x);
check(af(rent(ændret), 'samme_dato_beloeb')[0].noegle !== a1.noegle && af(rent(ændret), 'samme_dato_beloeb')[0].identitet === a1.identitet, 'Rettes en af rækkerne, får fundet samme identitet men NY nøgle (et gammelt "OK" dækker ikke en ny situation)');
check(af(rent(base.concat([r({ slutrapport_nr: '1850', dato: '2026-09-21' })])), 'hul_i_raekken')[0].noegle === 'hul_i_raekken|1819|1850', 'Hul-nøglen er nummerne omkring hullet (uafhængig af værdier)');

// Alle fund har tekst, forslag og kun forslag (ingen ændringer)
const alleTyper = K.kontrolMaaned(base.concat(o1 && [o1, o2, o3], [r({ dato: '2026-09-13', slutrapport_nr: '2303' })]), '2026-09');
check(alleTyper.fund.every(f => f.tekst && f.forslag && f.titel && f.noegle && Array.isArray(f.raekker)), 'Alle fund har titel, tekst, forslag, nøgle og rækker');
check(Object.keys(K.FORSLAG).sort().join() === Object.keys(K.TYPER).sort().join(), 'Hver type har et forslag og en titel');
const frys = JSON.stringify(base);
K.kontrolMaaned(base, '2026-09');
check(JSON.stringify(base) === frys, 'Kontrollerne ændrer ikke de rækker, de får (kun læsning)');

// Genbrug i den nye indlæsning: den samme logik på en NY vagt
const ny = { dato: '2026-09-11', slutrapport_nr: '1150', chauffor: 'Fuad', indkort: 4904, overfort: 4929, vagt_start: '02:13', vagt_slut: '13:31' };
const eks = [r({ dato: '2026-09-11', slutrapport_nr: '1150', chauffor: 'Adan', indkort: 4904, overfort: 4929, vagt_start: '02:13', vagt_slut: '13:31' }), r({ dato: '2026-09-12', slutrapport_nr: '1113', chauffor: 'Adan' })];
const tn = K.tjekNy(ny, eks);
check(tn.some(f => f.type === 'nr_flere_chauffoerer') && tn.some(f => f.type === 'samme_dato_beloeb') && tn.every(f => f.raekker.includes('__ny__')), 'tjekNy: en ny bon, der findes hos en anden chauffør, giver fund (kun fund, hvor den nye indgår)');
check(K.tjekNy({ dato: '2026-09-20', slutrapport_nr: '1830', chauffor: 'Adan', indkort: 3000, overfort: 3000, vagt_start: '06:00', vagt_slut: '14:00' }, [r({ dato: '2026-09-19', slutrapport_nr: '1829', chauffor: 'Fuad' })]).length === 0, 'tjekNy: en rigtig ny bon (næste nummer i bilen) giver 0 fund');
check(K.tjekNy({ dato: '2026-09-20', slutrapport_nr: '1830', chauffor: 'Adan', indkort: 3000, overfort: 2000, vagt_start: '06:00', vagt_slut: '14:00' }, []).map(f => f.type).join() === 'nr_uden_for_omraade,stor_difference', 'tjekNy uden andre vagter: kontrollerne på selve bonen (stor difference) og "ny bil uden historik" (nummeret har ingen naboer)');

// ---------- Standardbil pr. chauffør (udgangspunkt, ikke regel): afvigelse = markering, ikke fejl ----------
check(JSON.stringify(STD) === JSON.stringify({ adan: '001-7144', fuad: '001-8646', faysal: '001-8646', qaalid: '001-8208' }), 'Standardbiler: Adan 001-7144, Fuad og Faysal 001-8646, Qaalid 001-8208');
const bilRaekke = (nr0, antal, ch, d0 = 1, start = 0) => Array.from({ length: antal }, (_, i) => r({ dato: `2026-09-${String(d0 + i).padStart(2, '0')}`, slutrapport_nr: String(nr0 + start + i), chauffor: ch(i), vagt_start: '06:00', vagt_slut: '14:00', indkort: 3000 + i + nr0 % 97, overfort: 3000 + i + nr0 % 97 }));
const fastBil = [
  ...bilRaekke(1100, 8, () => 'Adan'),                                       // 001-7144
  ...bilRaekke(1600, 8, i => (i % 2 ? 'Fuad' : 'Faysal')),                   // 001-8646
  ...bilRaekke(1800, 8, () => 'Qaalid'),                                     // 001-8208
];
const mark = (rows, m = '2026-09') => K.kontrolMaaned(rows, m, { STANDARD_BIL: STD });
check(af(mark(fastBil), 'afvigende_bil').length === 0 && mark(fastBil).fund.length === 0, 'Alle kører deres standardbil: ingen markeringer');
const adan8646 = r({ dato: '2026-09-09', slutrapport_nr: '1608', chauffor: 'Adan', vagt_start: '06:00', vagt_slut: '14:00', indkort: 3100, overfort: 3100 });
const mk = af(mark(fastBil.concat([adan8646])), 'afvigende_bil');
check(mk.length === 1 && mk[0].standard === '001-7144' && mk[0].koert === '001-8646' && /Adan kørte 001-8646/.test(mk[0].tekst) && /9\/9/.test(mk[0].tekst) && /Standardbilen er 001-7144/.test(mk[0].tekst), 'Adan på 8646 den 9/9: én markering ("Adan kørte 001-8646 … Standardbilen er 001-7144")');
check(mark(fastBil.concat([adan8646])).fund.every(f => f.type === 'afvigende_bil') && K.TYPER.afvigende_bil.markering === true && !K.TYPER.afvigende_bil.spoergsmaal, 'Afvigelsen er KUN en markering (ingen andre fund; markering: true, ikke et spørgsmål)');
check(af(mark(fastBil.concat([adan8646])), 'afvigende_bil')[0].noegle.startsWith('afvigende_bil|') && /anden bil kan forekomme/.test(K.FORSLAG.afvigende_bil), 'Markeringen har nøgle (kan markeres OK) og et forslag der siger, at en anden bil kan forekomme');
check(af(K.kontrolMaaned(fastBil.concat([adan8646]), '2026-09', { STANDARD_BIL: { ...STD, adan: '001-8646' } }), 'afvigende_bil').length === 0, 'Standardbilen er et udgangspunkt, der kan ændres pr. chauffør: med Adan = 8646 er hans vagt på 8646 ikke længere en afvigelse');
check(af(K.kontrolMaaned(fastBil, '2026-09', { STANDARD_BIL: {} }), 'afvigende_bil').length === 0, 'Uden standardbiler markeres intet');
check(af(mark(fastBil.concat([r({ dato: '2026-09-10', slutrapport_nr: '1609', chauffor: 'Abdikarin', vagt_start: '06:00', vagt_slut: '14:00', indkort: 3200, overfort: 3200 })])), 'afvigende_bil').length === 0, 'En chauffør uden standardbil (Abdikarin, afløser) markeres aldrig');
// uafgjort række (to chauffører med hver sin standardbil, ingen flertal) -> ukendt bil -> ingen markering
const uafgjort = [r({ dato: '2026-09-01', slutrapport_nr: '1700', chauffor: 'Adan', vagt_start: '06:00', vagt_slut: '14:00' }), r({ dato: '2026-09-02', slutrapport_nr: '1701', chauffor: 'Qaalid', vagt_start: '06:00', vagt_slut: '14:00' })];
check(af(mark(uafgjort), 'afvigende_bil').length === 0, 'Uafgjort række (1 vagt hver fra to standardbiler): bilen er ukendt, ingen markering');
check(af(mark([r({ slutrapport_nr: '1700', chauffor: 'Adan' })]), 'afvigende_bil').length === 0, 'En enkelt vagt giver ikke nok stemmer til at kende bilen');
// taxi_nr på bonen går forud
const medTaxi = fastBil.concat([r({ dato: '2026-09-09', slutrapport_nr: '1108', chauffor: 'Adan', taxi_nr: '001-8208', vagt_start: '06:00', vagt_slut: '14:00', indkort: 3300, overfort: 3300 })]);
check(af(mark(medTaxi), 'afvigende_bil').length === 1 && af(mark(medTaxi), 'afvigende_bil')[0].koert === '001-8208', 'Står taxi_nr på bonen (001-8208), bruges den: Adan på 8208 markeres');

// ---------- Omsætning mellem boner ----------
const bon = (nr, dato, total, tx, fp, ch = 'Adan', extra = {}) => r({ dato, slutrapport_nr: String(nr), chauffor: ch, total_dkk: total, taxameter: tx, fastpris: fp, ...extra });
const O = rows => K.omsaetningMellemBoner(rows).led;
// Tællere: TOTAL stiger med hver vagts taxameter + fastpris
const kaede = [bon(1100, '2026-09-01', 100000, 2500, 0), bon(1101, '2026-09-02', 103000, 2800, 200), bon(1102, '2026-09-03', 105100, 2000, 100)];
let OL = O(kaede);
check(OL.length === 2 && OL.every(l => l.type === 'ok') && OL[0].diff === 3000 && OL[0].forventet === 3000 && OL[0].mangler === 0, 'Boner i rækkefølge: ΔTOTAL = taxameter + fastpris for den senere bon (3.000 = 2.800 + 200) -> ok');
OL = O([kaede[0], bon(1102, '2026-09-03', 105100, 2000, 100)]);
check(OL.length === 1 && OL[0].type === 'vagt_mangler' && OL[0].numre.join() === '1101' && OL[0].mangler === 3000 && OL[0].diff === 5100 && OL[0].forventet === 2100, 'Nr 1101 mangler: TOTAL steg 5.100, bon 1102 forklarer 2.100 -> "vagt mangler" 3.000 kr (nr 1101)');
OL = O([kaede[0], bon(1103, '2026-09-04', 100000 + 2300, 2000, 300)]);
check(OL[0].type === 'tom_vagt' && OL[0].numre.join() === '1101,1102' && OL[0].mangler === 0, 'Hul i nummer (1101–1102) med 0 kr imellem: tom vagt, ikke fejl');
OL = O([kaede[0], bon(1101, '2026-09-02', 103000 + 50, 2800, 200)]);
check(OL[0].type === 'omsaetning_passer_ikke' && OL[0].mangler === 50 && OL[0].numre.length === 0, 'Numre følger hinanden, men 50 kr passer ikke: "omsætning passer ikke" (ikke "vagt mangler")');
OL = O([kaede[0], bon(1101, '2026-09-02', 100000 + 2999.5, 2800, 200)]);
check(OL[0].type === 'ok', 'Afvigelse på 0,5 kr (afrunding) ignoreres (tolerance 1 kr)');
OL = O([kaede[0], bon(1101, '2026-09-02', 99000, 2800, 200)]);
check(OL[0].type === 'taeller_faldt' && OL[0].diff === -1000, 'TOTAL lavere end på den foregående bon: "tæller faldt"');
OL = O([kaede[0], bon(1101, '2026-09-02', 103000, 2800, null)]);
check(OL[0].type === 'omsaetning_passer_ikke' && OL[0].forventet === 2800 && OL[0].mangler === 200, 'Mangler fastpris på bonen, regnes den som 0');
OL = O([kaede[0], bon(1101, '2026-09-02', 103000, null, 200)]);
check(OL[0].type === 'ukendt' && OL[0].diff === null, 'Mangler taxameter eller TOTAL: kan ikke vurderes ("ukendt"), ikke en fejl');
OL = O([bon(1100, '2026-09-01', '100.000,50', '2.500,25', '0'), bon(1101, '2026-09-02', 103000.5, 2800, 200)]);
check(OL[0].type === 'ok' || OL[0].type === 'ukendt', 'Tal som tekst accepteres, hvis de er almindelige tal (danske tusindtalsformater skal omregnes før kontrollen)');
OL = O([bon(1100, '2026-09-01', 100000, 2500, 0), bon(1101, '2026-09-02', 103000, 2800, 200, 'Adan', { ture_kum: 1250, ture: 20 }), bon(1105, '2026-09-04', 108000, 2000, 0, 'Fuad', { ture_kum: 1290, ture: 25 })].map((x, i) => i === 0 ? { ...x, ture_kum: 1200 } : x));
check(OL[1].type === 'vagt_mangler' && OL[1].numre.join() === '1102,1103,1104' && OL[1].mangler === 3000 && OL[1].mangler_ture === 15, 'Mangler_ture: ΔANTAL TURE (40) − bonens egne ture (25) = 15 ture mangler, sammen med 3.000 kr');
check(O([bon(1100, '2026-09-01', 100000, 2500, 0, 'Adan', { taxi_nr: '001-7144' }), bon(1101, '2026-09-02', 103000, 2800, 200, 'Fuad', { taxi_nr: '001-8646' })]).length === 0, 'Boner i forskellige biler (taxi_nr) sammenlignes ikke');
check(O([bon(1100, '2026-09-01', 100000, 2500, 0), bon(1700, '2026-09-02', 500, 100, 0)]).length === 0, 'Rækker, der er mere end 50 numre fra hinanden, er forskellige biler og sammenlignes ikke');

// ... i "Kontrol af måneden": omsætningen erstatter spørgsmålet om hullet
const m1 = [bon(1100, '2026-09-01', 100000, 2500, 0), bon(1102, '2026-09-03', 102300, 2000, 300, 'Fuad', { vagt_start: '14:30', vagt_slut: '23:00' })];
let km = K.kontrolMaaned(m1, '2026-09', { STANDARD_BIL: {} });
check(af(km, 'hul_i_raekken').length === 0 && af(km, 'vagt_mangler').length === 0 && km.tomme.length === 1 && km.tomme[0].numre.join() === '1101', 'Hullet 1101 med 0 kr imellem er en tom vagt: intet spørgsmål, intet fund (kun i "tomme")');
km = K.kontrolMaaned([m1[0], { ...m1[1], total_dkk: 102300 + 4000 }], '2026-09', { STANDARD_BIL: {} });
const vm = af(km, 'vagt_mangler');
check(vm.length === 1 && af(km, 'hul_i_raekken').length === 0 && vm[0].belob === 4000 && /Der mangler 4\.000 kr/.test(vm[0].tekst) && /nr 1101/.test(vm[0].tekst) && vm[0].raekker.length === 2, 'Er der kroner til overs, bliver hullet til "Vagt mangler" med beløb (4.000 kr) og begge nabovagter');
km = K.kontrolMaaned([m1[0], { ...m1[1], total_dkk: undefined, taxameter: undefined, fastpris: undefined }], '2026-09', { STANDARD_BIL: {} });
check(af(km, 'hul_i_raekken').length === 1 && af(km, 'vagt_mangler').length === 0, 'Uden tællere på bonerne er hullet stadig et spørgsmål (som før)');
check(K.TYPER.vagt_mangler.spoergsmaal !== true && vm[0].spoergsmaal === false && !K.TYPER.vagt_mangler.markering, '"Vagt mangler" er et fund (ikke spørgsmål, ikke markering)');
check(af(K.kontrolMaaned(kaede.concat([bon(1103, '2026-09-04', 105100 + 100, 2000, 100)]), '2026-09', { STANDARD_BIL: {} }), 'omsaetning_passer_ikke').length === 1, 'Sammenhængende numre med forkert omsætning bliver et fund i måneden');
check(af(K.kontrolMaaned(kaede, '2026-10', { STANDARD_BIL: {} }), 'omsaetning_passer_ikke').length === 0, 'Omsætningsfund hører til måneden, hvor den senere bon ligger');

console.log(fails ? `\n${fails} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(fails ? 1 : 0);
