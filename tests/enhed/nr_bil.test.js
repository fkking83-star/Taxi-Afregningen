// Nummer-advarsel med 3 syntetiske biler (A: 18xx, B: 10xx, C: 16xx) og 5 chauffører der deler biler.
// (Numrene er opdigtede testdata; den rigtige bil-fordeling står i docs/plan-indlaesning.md.)
const f = require('../hjaelpere/nr_advarsler.cjs');
let fails = 0; const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const d = n => `2026-09-${String(n).padStart(2, '0')}`;
const r = (id, dag, nr, ch, vs = '16:00') => ({ id, dato: d(dag), slutrapport_nr: String(nr), chauffor: ch, vagt_start: vs });
const mine = (alle, ch) => alle.filter(x => x.chauffor === ch);
const flag = (alle, ch) => Object.keys(f(mine(alle, ch), alle)).sort();

// Bil A (18xx): Qaalid nat, Abdikarin dag  |  Bil B (10xx): Adan, Fuad på skift  |  Bil C (16xx): Faysal
let A = [], nA = 1830, nB = 1080, nC = 1660;
for (let dag = 1; dag <= 27; dag++) {
  A.push(r('ab' + dag, dag, nA++, 'Abdikarin', '06:00'));
  if (dag !== 12) A.push(r('q' + dag, dag, nA++, 'Qaalid'));           // 12/9 låner Qaalid bil B
  A.push(r((dag % 2 ? 'ad' : 'fu') + dag, dag, nB++, dag % 2 ? 'Adan' : 'Fuad'));
  if (dag === 12) A.push(r('q12', dag, nB++, 'Qaalid', '17:45'));
  if (dag % 3) A.push(r('fa' + dag, dag, nC++, 'Faysal'));
}
for (const ch of ['Qaalid', 'Abdikarin', 'Adan', 'Fuad', 'Faysal'])
  check(flag(A, ch).length === 0, `${ch}: ingen falske alarmer (delte biler, numre springer)` + (flag(A, ch).length ? ' ' + flag(A, ch) : ''));
check(mine(A, 'Qaalid').find(x => x.id === 'q12').slutrapport_nr.startsWith('10'), '(Qaalids lånte vagt 12/9 har bil B-nummer)');

// Qaalid skifter fast bil midt i måneden (A -> C)
let B = [], a = 1850, b = 1600;
for (let dag = 1; dag <= 27; dag++) {
  if (dag <= 14) B.push(r('q' + dag, dag, a++, 'Qaalid')); else B.push(r('q' + dag, dag, b++, 'Qaalid'));
  if (dag <= 14) B.push(r('fa' + dag, dag, b++, 'Faysal')); else B.push(r('fa' + dag, dag, a++, 'Faysal'));
}
check(flag(B, 'Qaalid').length === 0 && flag(B, 'Faysal').length === 0, 'Bilskift midt i måneden: ingen alarm ved skiftet');

// Rigtige OCR-fejl fanges stadig, selvom bilerne deles
const C = A.map(x => ({ ...x }));
C.find(x => x.id === 'q20').slutrapport_nr = String(Number(C.find(x => x.id === 'q20').slutrapport_nr) + 100).replace(/^18/, '19'); // 18xx -> 19xx
const q20 = C.find(x => x.id === 'q20');
const rigtig = String(A.find(x => x.id === 'q20').slutrapport_nr);
const adv = f(mine(C, 'Qaalid'), C);
check(!!adv['q20'], `18/19-fejl (${rigtig} læst som ${q20.slutrapport_nr}) markeres stadig`);
C.find(x => x.id === 'fu10').slutrapport_nr = '2303';
check(!!f(mine(C, 'Fuad'), C)['fu10'], 'Nummer der ikke passer med nogen bil (2303) markeres');
const D = A.map(x => ({ ...x })); D.find(x => x.id === 'q5').slutrapport_nr = '1936';
const advD = f(mine(D, 'Qaalid'), D);
check(advD['q5'] && advD['q5'].includes('Måske 1836?'), '18/19-forslag peger på bilens rigtige række (1936 -> 1836)');

// To fejl tæt på hinanden "godkender" ikke hinanden (taxameteret tæller kun op)
const E = [r('q1', 18, 1857, 'Qaalid'), r('q2', 19, 1958, 'Qaalid'), r('q3', 21, 1859, 'Qaalid'), r('q4', 21, 1951, 'Qaalid', '16:45'), r('q5', 23, 1861, 'Qaalid')];
check(JSON.stringify(Object.keys(f(E, E)).sort()) === '["q2","q4"]', '1958 (19/9) og 1951 (21/9) støtter ikke hinanden, da nummeret falder mens datoen stiger');

// Uden alle-listen (gammel kaldform) virker funktionen stadig
check(typeof f(mine(A, 'Qaalid')) === 'object', 'nrAdvarsler(rows) uden alle-liste virker stadig');
console.log(fails ? `\n${fails} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(fails ? 1 : 0);
