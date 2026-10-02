// Kontrollerne i site/kontroller.js (bruges af dashboardets "Kontrol af måneden" og senere af den nye indlæsning).
const K = require('../../site/kontroller.js');
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
console.log(fails ? `\n${fails} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(fails ? 1 : 0);
