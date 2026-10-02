// supabase/forespoergsler/kontrol_maaned.sql (SQL) og site/kontroller.js (dashboardet) skal give PRÆCIS de samme fund
// på de samme data. Testen bruger håndlavede grænsetilfælde og en seedet tilfældig stribe rækker over tre måneder.
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { bygFraMigrationer } from '../hjaelpere/skema.mjs';
const K = createRequire(import.meta.url)('../../site/kontroller.js');
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const SQL = readFileSync(new URL('../../supabase/forespoergsler/kontrol_maaned.sql', import.meta.url), 'utf8');
const uden = SQL.replace(/--.*$/gm, '');
check(!/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(uden) && uden.trim().split(';').filter(x => x.trim()).length === 1, 'SQL: ét select, ingen skrive-kommandoer');

// Parametrene i SQL'en er de samme som STANDARD i kontroller.js
const C = K.STANDARD;
const P = /500 as stor_diff_kr, 0\.2 as stor_diff_pct, 100 as stor_diff_min_kr, 180 as vagt_min_min, 960 as vagt_max_min, 5 as overlap_tol_min,\s+50 as nr_afstand, 2200 as vdt_fra, 2399 as vdt_til/.exec(SQL);
check(!!P && C.STOR_DIFF_KR === 500 && C.STOR_DIFF_PCT === 0.2 && C.STOR_DIFF_MIN_KR === 100 && C.VAGT_MIN_MIN === 180 && C.VAGT_MAX_MIN === 960 && C.OVERLAP_TOLERANCE_MIN === 5 && C.NR_AFSTAND === 50 && C.VDT_FRA === 2200 && C.VDT_TIL === 2399, 'SQL og kontroller.js har de samme parametre (500 kr, 20 %, 100 kr, 3–16 t, 5 min, naboer ±50, VDT 2200–2399)');
check(!/001-\d{4}/.test(SQL.replace(/--.*$/gm, '')), 'SQL-kontrollen bruger ingen faste biler eller 100-blokke (kun naboer)');

const { db, fejl } = await bygFraMigrationer();
check(!fejl, 'Kæden bygger' + (fejl ? ': ' + fejl.besked : ''));
const q = async (s, p = []) => (await db.query(s, p)).rows;
await db.exec(`insert into satser values ('Adan', 0.48, 50000, 0.4, false, 'a'), ('Fuad', 0.5, 10000000, 0.5, false, 'f'), ('Qaalid', 0.48, 10000000, 0.48, true, 'q'), ('Faysal', 0.5, 10000000, 0.5, false, 'y')`);

// ---- Data: seedet tilfældighed + indbyggede fejl ----
let seed = 20260930; const rnd = () => (seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296;
const pick = a => a[Math.floor(rnd() * a.length)];
const navne = ['Adan', 'Fuad', 'Qaalid', 'Faysal'];
const pad = n => String(n).padStart(2, '0');
const tid = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const rows = []; let idn = 0; const brugt = new Set();
function add(o) {
  const id = '00000000-0000-0000-0000-' + String(++idn).padStart(12, '0');
  const nøgle = o.chauffor + '|' + o.nr; if (brugt.has(nøgle)) return; brugt.add(nøgle);
  rows.push({ id, ...o });
}
const tællere = { a: 1800, b: 1100, c: 1600 };
for (let dag = 0; dag < 90; dag++) {   // 28/8 → 26/11
  const d = new Date(Date.UTC(2026, 7, 28 + dag)).toISOString().slice(0, 10);
  for (const bil of ['a', 'b', 'c']) {
    if (rnd() < 0.2) { tællere[bil] += 1 + Math.floor(rnd() * 3); continue; }   // en dag uden vagt, eller huller i rækken
    const start = pick([360, 390, 840, 870, 1320, 600]), len = pick([480, 540, 600, 480, 120, 1000, 30, 840]);
    const ind = Math.round(1500 + rnd() * 4000), diff = pick([0, 0, 10, 25, 150, 300, 480, 500, 520, 700, ind * 0.2, -40, -600]);
    add({ dato: d, nr: String(tællere[bil]++), chauffor: pick(navne), indkort: ind, overfort: Math.round(ind - diff), vagt_start: tid(start), vagt_slut: tid(start + len) });
  }
}
// Håndlavede grænsetilfælde (i september 2026, regnskabsmåned 2026-09)
const hand = [
  { dato: '2026-09-11', nr: '1150', chauffor: 'Adan', indkort: 4904, overfort: 4929, vagt_start: '02:13', vagt_slut: '13:31' },
  { dato: '2026-09-11', nr: ' 1150 ', chauffor: 'Fuad', indkort: 4904, overfort: 4929, vagt_start: '02:13', vagt_slut: '13:31' },    // samme bon, to chauffører
  { dato: '2026-09-13', nr: '2303', chauffor: 'Qaalid', indkort: 3555, overfort: 3375, vagt_start: '09:00', vagt_slut: '12:00' },       // uden for områderne; præcis 3 t
  { dato: '2026-09-14', nr: '1087', chauffor: 'Qaalid', indkort: 1000, overfort: 800, vagt_start: '06:00', vagt_slut: '08:59' },        // 20 % præcis; 2:59
  { dato: '2026-09-15', nr: '', chauffor: 'Adan', indkort: 1000, overfort: 801, vagt_start: '6:00', vagt_slut: '22:00' },              // tomt nr; 16:00 præcis; 19,9 %
  { dato: '2026-09-15', nr: '99', chauffor: 'Fuad', indkort: 5000, overfort: 4500, vagt_start: '06:00', vagt_slut: '22:01' },          // 500 præcis; 16:01
  { dato: '2026-09-16', nr: 'abc', chauffor: 'Faysal', indkort: 5000, overfort: 4501, vagt_start: null, vagt_slut: null },             // 499; ingen tider
  { dato: '2026-09-17', nr: '1705', chauffor: 'Adan', indkort: 1000, overfort: 1000, vagt_start: '06:00', vagt_slut: '06:00' },        // 0 min
  { dato: '2026-09-18', nr: '1610', chauffor: 'Adan', indkort: 2000, overfort: 2000, vagt_start: '06:00', vagt_slut: '14:00' },
  { dato: '2026-09-18', nr: '1611', chauffor: 'Adan', indkort: 2100, overfort: 2100, vagt_start: '14:00', vagt_slut: '20:00' },        // 0 min overlap
  { dato: '2026-09-18', nr: '1612', chauffor: 'Fuad', indkort: 2200, overfort: 2200, vagt_start: '19:55', vagt_slut: '23:59' },        // 5 min: ignoreres
  { dato: '2026-09-18', nr: '1613', chauffor: 'Qaalid', indkort: 2300, overfort: 2300, vagt_start: '19:54', vagt_slut: '23:00' },     // 6 min: overlap med 1611 og 1612
  { dato: '2026-09-19', nr: '1830', chauffor: 'Faysal', indkort: 3000, overfort: 2400, vagt_start: '22:00', vagt_slut: '06:00' },
  { dato: '2026-09-20', nr: '1833', chauffor: 'Fuad', indkort: 3100, overfort: 3100, vagt_start: '05:30', vagt_slut: '12:00' },        // overlapper nattens slut i samme bil; hul 1831–1832
  { dato: '2026-09-27', nr: '1880', chauffor: 'Adan', indkort: 1234, overfort: 1234, vagt_start: '06:00', vagt_slut: '14:00' },
  { dato: '2026-09-28', nr: '1884', chauffor: 'Adan', indkort: 1235, overfort: 1235, vagt_start: '06:00', vagt_slut: '14:00' },        // hul hen over månedsskiftet
  // naboer ±50 (grænsetilfælde) og VDT(Tk)-tal
  { dato: '2026-09-02', nr: '1300', chauffor: 'Adan', indkort: 2001, overfort: 2001, vagt_start: '06:00', vagt_slut: '14:00' },
  { dato: '2026-09-03', nr: '1350', chauffor: 'Fuad', indkort: 2002, overfort: 2002, vagt_start: '06:00', vagt_slut: '14:00' },        // præcis 50 fra 1300: samme række
  { dato: '2026-09-04', nr: '1401', chauffor: 'Qaalid', indkort: 2003, overfort: 2003, vagt_start: '06:00', vagt_slut: '14:00' },     // 51 fra 1350: ensom
  { dato: '2026-09-05', nr: '2200', chauffor: 'Adan', indkort: 2004, overfort: 2004, vagt_start: '06:00', vagt_slut: '14:00' },        // VDT-grænse, ensom
  { dato: '2026-09-06', nr: '2399', chauffor: 'Fuad', indkort: 2005, overfort: 2005, vagt_start: '06:00', vagt_slut: '14:00' },        // VDT-grænse, ensom
  { dato: '2026-09-07', nr: '2400', chauffor: 'Faysal', indkort: 2006, overfort: 2006, vagt_start: '06:00', vagt_slut: '14:00' },     // lige uden for VDT: bare ensom
  { dato: '2026-09-08', nr: '2285', chauffor: 'Qaalid', indkort: 2007, overfort: 2007, vagt_start: '06:00', vagt_slut: '14:00' },     // VDT-tal
  { dato: '2026-09-09', nr: '2310', chauffor: 'Adan', indkort: 2008, overfort: 2008, vagt_start: '06:00', vagt_slut: '14:00' },        // 25 fra 2285: de to er en række og ingen af dem er VDT
  { dato: '2026-09-10', nr: '1095', chauffor: 'Adan', indkort: 2009, overfort: 2009, vagt_start: '06:00', vagt_slut: '14:00' },        // 1095–1098 + 1101 (tidligere fejlmarkeret)
  { dato: '2026-09-10', nr: '1096', chauffor: 'Fuad', indkort: 2010, overfort: 2010, vagt_start: '15:00', vagt_slut: '20:00' },
];
hand.forEach(h => add(h));
for (const x of rows) await db.query(`insert into slutrapporter (id, dato, slutrapport_nr, chauffor, indkort, overfort, vagt_start, vagt_slut) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
  [x.id, x.dato, x.nr, x.chauffor, x.indkort, x.overfort, x.vagt_start, x.vagt_slut]);
check(rows.length > 150, `Testdata: ${rows.length} vagter over fire regnskabsmåneder`);

const forrige = m => { const [y, mm] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mm - 2, 1)); return d.toISOString().slice(0, 7); };
const naeste = m => { const [y, mm] = m.split('-').map(Number); const d = new Date(Date.UTC(y, mm, 1)); return d.toISOString().slice(0, 7); };
let samlet = 0;
for (const maaned of ['2026-09', '2026-10', '2026-11', '2026-08']) {
  const sqlFund = (await q(SQL.replace(`select '2026-09'::text as maaned`, `select '${maaned}'::text as maaned`))).map(x => x.type + ' :: ' + x.identitet).sort();
  const data = (await q(`select id, dato::text as dato, slutrapport_nr, chauffor, indkort::float8 as indkort, overfort::float8 as overfort, vagt_start, vagt_slut, regnskabsmaaned as maaned
                         from v_data where regnskabsmaaned in ($1, $2, $3)`, [forrige(maaned), maaned, naeste(maaned)]));
  const jsFund = K.kontrolMaaned(data, maaned).fund.map(x => x.type + ' :: ' + x.identitet).sort();
  samlet += jsFund.length;
  const kun = (a, b) => a.filter(x => !b.includes(x));
  check(JSON.stringify(sqlFund) === JSON.stringify(jsFund), `${maaned}: SQL og kontroller.js giver de samme ${jsFund.length} fund` + (JSON.stringify(sqlFund) !== JSON.stringify(jsFund) ? `\n   kun SQL: ${kun(sqlFund, jsFund).slice(0, 4).join(' | ')}\n   kun JS: ${kun(jsFund, sqlFund).slice(0, 4).join(' | ')}` : ''));
  if (maaned === '2026-09') {
    const typer = new Set(jsFund.map(x => x.split(' :: ')[0]));
    check(typer.size === 8, `2026-09: alle 8 kontrol-typer er repræsenteret i testdata (${[...typer].join(', ')})`);
  }
}
check(samlet > 40, `I alt ${samlet} fund sammenlignet`);
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
