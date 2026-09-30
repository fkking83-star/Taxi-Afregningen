// Nummer-advarsel med 3 syntetiske biler (A: 18xx, B: 11xx, C: 16xx). Der er INGEN fast bil pr. chauffør: alle chauffører
// kører alle biler, og de roterer mellem dem. Nummeret tæller pr. bil, så det sammenlignes med alle chaufførers vagter.
// (Numrene er opdigtede testdata; nummerområderne står i docs/plan-indlaesning.md.)
const f = require('../hjaelpere/nr_advarsler.cjs');
let fails = 0; const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const d = n => `2026-09-${String(n).padStart(2, '0')}`;
const r = (id, dag, nr, ch, vs = '16:00') => ({ id, dato: d(dag), slutrapport_nr: String(nr), chauffor: ch, vagt_start: vs });
const mine = (alle, ch) => alle.filter(x => x.chauffor === ch);
const flag = (alle, ch) => Object.keys(f(mine(alle, ch), alle)).sort();
const NAVNE = ['Qaalid', 'Adan', 'Fuad', 'Faysal'];
const hvem = (dag, bil, skift) => NAVNE[(dag + bil * 3 + skift) % NAVNE.length];   // rotation: samme chauffør kører forskellige biler fra dag til dag

// Bil A (18xx): dag- og natvagt hver dag  |  Bil B (11xx): én vagt om dagen  |  Bil C (16xx): to ud af tre dage
let A = [], nA = 1830, nB = 1101, nC = 1660;
for (let dag = 1; dag <= 27; dag++) {
  A.push(r('a' + dag + 'd', dag, nA++, hvem(dag, 0, 0), '06:00'));
  A.push(r('a' + dag + 'n', dag, nA++, hvem(dag, 0, 1)));
  A.push(r('b' + dag, dag, nB++, hvem(dag, 1, 0)));
  if (dag % 3) A.push(r('c' + dag, dag, nC++, hvem(dag, 2, 0)));
}
const bilerPrChauffoer = ch => new Set(mine(A, ch).map(x => x.slutrapport_nr.slice(0, 2)));
check(NAVNE.every(ch => bilerPrChauffoer(ch).size === 3), 'Testdata: hver chauffør kører alle tre biler (ingen fast bil)');
for (const ch of NAVNE)
  check(flag(A, ch).length === 0, `${ch}: ingen falske alarmer (alle kører alle biler, numre springer)` + (flag(A, ch).length ? ' ' + flag(A, ch) : ''));

// En chauffør skifter bil midt i måneden (A -> C), en anden den anden vej
let B = [], a = 1850, b = 1600;
for (let dag = 1; dag <= 27; dag++) {
  if (dag <= 14) B.push(r('q' + dag, dag, a++, 'Qaalid')); else B.push(r('q' + dag, dag, b++, 'Qaalid'));
  if (dag <= 14) B.push(r('fa' + dag, dag, b++, 'Faysal')); else B.push(r('fa' + dag, dag, a++, 'Faysal'));
}
check(flag(B, 'Qaalid').length === 0 && flag(B, 'Faysal').length === 0, 'Bilskift midt i måneden: ingen alarm ved skiftet');

// Rigtige OCR-fejl fanges stadig, selvom alle kører alle biler
const C = A.map(x => ({ ...x }));
const ejer = id => C.find(x => x.id === id).chauffor;
const rigtig = C.find(x => x.id === 'a20d').slutrapport_nr;
C.find(x => x.id === 'a20d').slutrapport_nr = '19' + rigtig.slice(2);   // 18xx -> 19xx
const adv = f(mine(C, ejer('a20d')), C);
check(!!adv['a20d'], `18/19-fejl (${rigtig} læst som ${'19' + rigtig.slice(2)}) markeres stadig`);
C.find(x => x.id === 'b10').slutrapport_nr = '2303';
check(!!f(mine(C, ejer('b10')), C)['b10'], 'Nummer der ikke passer med nogen bil (2303) markeres');
const D = A.map(x => ({ ...x })); const rigtig5 = D.find(x => x.id === 'a5n').slutrapport_nr; D.find(x => x.id === 'a5n').slutrapport_nr = '19' + rigtig5.slice(2);
const advD = f(mine(D, D.find(x => x.id === 'a5n').chauffor), D);
check(advD['a5n'] && advD['a5n'].includes(`Måske ${rigtig5}?`), `18/19-forslag peger på bilens rigtige række (${'19' + rigtig5.slice(2)} -> ${rigtig5})`);
// Det hjælper ikke at se på chaufførens egne vagter alene: en chauffør med få vagter i en bil får ingen falsk alarm
const F = [r('x1', 10, 1850, 'Afløser'), ...A.filter(x => x.id.startsWith('a'))];
check(Object.keys(f([F[0]], F)).length === 0, 'En chauffør med kun én vagt i bilen får ingen alarm, når andre chaufførers vagter i samme bil passer');

// To fejl tæt på hinanden "godkender" ikke hinanden (taxameteret tæller kun op)
const E = [r('q1', 18, 1857, 'Qaalid'), r('q2', 19, 1958, 'Qaalid'), r('q3', 21, 1859, 'Qaalid'), r('q4', 21, 1951, 'Qaalid', '16:45'), r('q5', 23, 1861, 'Qaalid')];
check(JSON.stringify(Object.keys(f(E, E)).sort()) === '["q2","q4"]', '1958 (19/9) og 1951 (21/9) støtter ikke hinanden, da nummeret falder mens datoen stiger');

// Uden alle-listen (gammel kaldform) virker funktionen stadig
check(typeof f(mine(A, 'Qaalid')) === 'object', 'nrAdvarsler(rows) uden alle-liste virker stadig');
console.log(fails ? `\n${fails} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(fails ? 1 : 0);
