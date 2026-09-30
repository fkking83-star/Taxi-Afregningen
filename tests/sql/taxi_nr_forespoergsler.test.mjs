// taxi_nr på gamle rækker: de to læseforespørgsler i supabase/forespoergsler/taxi_nr_*.sql.
// Bilen findes ud fra NUMMERET (11xx = 001-7144, 16xx = 001-8646, 18xx = 001-8208), aldrig ud fra chaufføren.
import { readFileSync } from 'fs';
import { bygFraMigrationer } from '../hjaelpere/skema.mjs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const Q = n => readFileSync(new URL(`../../supabase/forespoergsler/${n}.sql`, import.meta.url), 'utf8');
const Q1 = Q('taxi_nr_1_oversigt'), Q2 = Q('taxi_nr_2_uden_for_omraaderne'), Q3 = Q('taxi_nr_3_mulige_fejllaeste_dubletter');
for (const [n, sql] of [['1', Q1], ['2', Q2], ['3', Q3]]) {
  const uden = sql.replace(/--.*$/gm, '');
  check(!/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(uden) && uden.trim().split(';').filter(x => x.trim()).length === 1, `Forespørgsel ${n}: ét select, ingen skrive-kommandoer`);
}
const { db, fejl } = await bygFraMigrationer();
check(!fejl, 'Kæden bygger' + (fejl ? ': ' + fejl.besked : ''));
const q = async s => (await db.query(s)).rows;
await db.exec(`
  insert into satser values ('Adan', 0.48, 50000, 0.4, false, 'a'), ('Fuad', 0.5, 10000000, 0.5, false, 'f'), ('Qaalid', 0.48, 10000000, 0.48, true, 'q'), ('Faysal', 0.5, 10000000, 0.5, false, 'y');
  insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort) values
    -- alle kører alle biler: hver bil har flere chauffører
    ('2026-09-01', '1101', 'Adan', 1000, 1000), ('2026-09-02', '1150', 'Fuad', 1000, 1000), ('2026-09-03', '1199', 'Qaalid', 1000, 1000),
    ('2026-09-04', '1600', 'Adan', 1000, 1000), ('2026-09-05', '1650', 'Faysal', 1000, 1000), ('2026-09-06', '1699', 'Qaalid', 1000, 1000),
    ('2026-09-07', '1800', 'Fuad', 1000, 1000), ('2026-09-08', '1850', 'Qaalid', 1000, 1000), ('2026-09-09', '1899', 'Adan', 1000, 1000),
    ('2026-09-10', ' 1651 ', 'Fuad', 1000, 1000);   -- nummer med mellemrum tæller som 1651
  insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort) values
    ('2026-08-30', '1097', 'Adan', 4486, 4388),     -- lige under 11xx
    ('2026-09-11', '1200', 'Fuad', 100, 100),       -- lige over 11xx
    ('2026-09-12', '1337', 'Faysal', 100, 100),
    ('2026-09-13', '2303', 'Qaalid', 3555, 3375),
    ('2026-09-14', '1955', 'Adan', 100, 100),
    ('2026-09-15', '11012', 'Fuad', 100, 100),      -- femcifret
    ('2026-09-16', '999', 'Fuad', 100, 100),        -- trecifret
    ('2026-09-17', '01150', 'Fuad', 100, 100),      -- foranstillet nul
    ('2026-09-18', 'abc', 'Fuad', 100, 100),
    ('2026-09-19', '', 'Fuad', 100, 100)`);
const total = (await q(`select count(*)::int n from slutrapporter`))[0].n;

// Forespørgsel 1
const o = await q(Q1);
const get = t => o.find(x => x.taxi_nr === t);
check(Number(get('001-7144').antal_raekker) === 3 && Number(get('001-8646').antal_raekker) === 4 && Number(get('001-8208').antal_raekker) === 3, 'Q1: 3 rækker i 11xx (001-7144), 4 i 16xx (001-8646, inkl. nr med mellemrum), 3 i 18xx (001-8208)');
check(Number(get('001-7144').antal_chauffoerer) === 3 && Number(get('001-8646').antal_chauffoerer) >= 3 && Number(get('001-8208').antal_chauffoerer) === 3, 'Q1: hver bil har flere forskellige chauffører (alle kører alle biler)');
check(Number(get('UDEN FOR OMRÅDERNE').antal_raekker) === 10, 'Q1: 10 rækker uden for områderne');
check(o.reduce((s, x) => s + Number(x.antal_raekker), 0) === total, 'Q1: alle rækker er talt med, ingen mistet eller talt to gange');

// Forespørgsel 2
const u = await q(Q2);
const nr = u.map(x => x.nr).sort();
check(JSON.stringify(nr) === JSON.stringify(['', '01150', '1097', '11012', '1200', '1337', '1955', '2303', '999', 'abc'].sort()), 'Q2: præcis de ti numre uden for områderne');
check(!u.some(x => ['1101', '1150', '1199', '1600', '1650', '1699', '1800', '1850', '1899', ' 1651 '].includes(x.nr)), 'Q2: numre i de tre områder (inkl. grænserne 1100/1199 osv.) er ikke med');
const x1097 = u.find(x => x.nr === '1097'), x1200 = u.find(x => x.nr === '1200'), x1955 = u.find(x => x.nr === '1955');
check(x1097.naermeste_bil === '001-7144' && Number(x1097.afstand) === 3 && x1200.naermeste_bil === '001-7144' && Number(x1200.afstand) === 1, 'Q2: hint for 1097 og 1200: nærmeste bil 001-7144, afstand 3 og 1');
check(x1955.naermeste_bil === '001-8208' && Number(x1955.afstand) === 56, 'Q2: hint for 1955: 001-8208, afstand 56');
check(u.find(x => x.nr === 'abc').bemaerkning === 'nummeret er ikke et tal' && u.find(x => x.nr === '11012').bemaerkning === 'ikke firecifret' && u.find(x => x.nr === '01150').bemaerkning === 'ikke firecifret', 'Q2: bemærkning ved ikke-tal og ikke-firecifrede numre');
check(u.find(x => x.nr === 'abc').naermeste_bil === null, 'Q2: ingen hint for et nummer, der ikke er et tal');
// Uafhængig af chauffør: samme nummer hos en anden chauffør giver samme placering
await db.exec(`insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort) values ('2026-09-20', '1101', 'Qaalid', 1, 1), ('2026-09-21', '1337', 'Adan', 1, 1)`);
const o2 = await q(Q1), u2 = await q(Q2);
check(Number(o2.find(x => x.taxi_nr === '001-7144').antal_raekker) === 4 && u2.filter(x => x.nr === '1337').length === 2, 'Chaufføren spiller ingen rolle: 1101 hos en ny chauffør er stadig 001-7144, 1337 er uden for områderne hos begge');
check((await q(`select count(*)::int n from slutrapporter`))[0].n === total + 2, 'Forespørgslerne har ikke ændret data');
// Forespørgsel 3: samme beløb, forlæst nummer og dato (som Faysals 1635 -> 1035 og 1639 -> 1937 i live)
await db.exec(`insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort) values
  ('2026-09-04', '1635', 'Faysal', 3034, 3022), ('2023-09-03', '1035', 'Faysal', 3034, 3022),
  ('2026-09-06', '1639', 'Faysal', 2430, 2430), ('2025-09-05', '1937', 'Faysal', 2430, 2430),
  ('2026-09-07', '1640', 'Faysal', 2660, 2198)`);
const dub = await q(Q3);
const ægte = dub.filter(x => Number(x.indkort) >= 2000 && Number(x.indkort) !== 3555);   // testdataene har mange runde 1000/1000- og 100/100-rækker, som naturligt også er "samme beløb"
check(ægte.map(x => x.nr).sort().join() === '1035,1635,1639,1937', 'Q3: finder de to par med samme beløb og forskelligt nummer/dato (1635/1035 og 1639/1937)');
check(dub.filter(x => x.indkort == 3034).map(x => x.maaned).sort().join() === '2023-09,2026-09', 'Q3: viser måneden for begge rækker i et par');
check(!dub.some(x => x.nr === '1640'), 'Q3: en række med unikke beløb er ikke med');
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
