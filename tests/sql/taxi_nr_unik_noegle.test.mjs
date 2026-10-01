// Trin 1.1: den unikke nøgle (kilde, taxi_nr, slutrapport_nr) uden chauffør. Forespørgsel 4 viser par af samme bon hos flere chauffører,
// og vagten (taxi_nr_5) stopper migrationen med en tydelig fejl, hvis der stadig er nogen. Nøglen oprettes først bagefter.
import { readFileSync } from 'fs';
import { bygFraMigrationer } from '../hjaelpere/skema.mjs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const Q = n => readFileSync(new URL(`../../supabase/forespoergsler/${n}.sql`, import.meta.url), 'utf8');
const Q4 = Q('taxi_nr_4_samme_bon_hos_flere_chauffoerer'), VAGT = Q('taxi_nr_5_vagt_foer_unik_noegle');
const uden = Q4.replace(/--.*$/gm, '');
check(!/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(uden) && uden.trim().split(';').filter(x => x.trim()).length === 1, 'Forespørgsel 4: ét select, ingen skrive-kommandoer');

const { db, fejl } = await bygFraMigrationer();
check(!fejl, 'Kæden bygger' + (fejl ? ': ' + fejl.besked : ''));
const q = async (s) => (await db.query(s)).rows;
const fejlVed = async sql => { try { await db.exec(sql); return null; } catch (e) { try { await db.exec('rollback'); } catch (_) {} return e; } };
await db.exec(`
  insert into satser values ('Adan', 0.48, 50000, 0.4, false, 'a'), ('Fuad', 0.5, 10000000, 0.5, false, 'f'), ('Qaalid', 0.48, 10000000, 0.48, true, 'q'), ('Faysal', 0.5, 10000000, 0.5, false, 'y');
  insert into slutrapporter (id, dato, slutrapport_nr, chauffor, indkort, overfort) values
    ('00000000-0000-0000-0000-000000000001', '2026-09-11', '1112', 'Adan', 4904, 4929),
    ('00000000-0000-0000-0000-000000000002', '2026-09-11', '1112', 'Fuad', 4904, 4929),      -- samme bon hos to chauffører, samme bil
    ('00000000-0000-0000-0000-000000000003', '2026-09-12', ' 1650 ', 'Faysal', 3000, 3000),  -- mellemrum
    ('00000000-0000-0000-0000-000000000004', '2026-09-12', '1650', 'Qaalid', 3000, 3000),
    ('00000000-0000-0000-0000-000000000005', '2026-09-13', '2303', 'Qaalid', 3555, 3375),     -- uden for områderne
    ('00000000-0000-0000-0000-000000000006', '2026-09-20', '2303', 'Adan', 4226, 3878),
    ('00000000-0000-0000-0000-000000000007', '2026-09-14', '1101', 'Adan', 1000, 1000),       -- ingen dublet
    ('00000000-0000-0000-0000-000000000008', '2026-09-15', '1801', 'Qaalid', 1000, 1000)`);

// ---- Forespørgsel 4 (før taxi_nr findes) ----
const par = await q(Q4);
const nr1112 = par.filter(x => x.nr === '1112'), nr1650 = par.filter(x => x.nr === '1650'), nr2303 = par.filter(x => x.nr === '2303');
check(nr1112.length === 2 && nr1112.every(x => x.bil === '001-7144' && x.sikkerhed === 'i område (stopper nøglen)') && nr1112.map(x => x.chauffor).sort().join() === 'Adan,Fuad', 'Q4: nr 1112 hos Adan og Fuad i bil 001-7144 vises som par, og stopper nøglen');
check(nr1650.length === 2 && nr1650.every(x => x.bil === '001-8646'), 'Q4: " 1650 " (med mellemrum) og "1650" hos to chauffører ses som samme bon');
check(nr2303.length === 2 && nr2303.every(x => x.bil === 'UDEN FOR OMRÅDERNE' && x.sikkerhed === 'uden for områderne (hint)'), 'Q4: samme nummer uden for områderne vises som hint (stopper ikke nøglen)');
check(!par.some(x => ['1101', '1801'].includes(x.nr)), 'Q4: rækker uden dublet er ikke med');
check(par.length === 6, 'Q4: præcis 6 rækker (3 par)');

// ---- Simulér 1.1: kolonnerne kilde og taxi_nr, udfyldt ud fra nummerområdet ----
await db.exec(`alter table slutrapporter add column kilde text not null default 'dantaxi', add column taxi_nr text;
  update slutrapporter set taxi_nr = case when btrim(slutrapport_nr) ~ '^11[0-9]{2}$' then '001-7144' when btrim(slutrapport_nr) ~ '^16[0-9]{2}$' then '001-8646' when btrim(slutrapport_nr) ~ '^18[0-9]{2}$' then '001-8208' end`);
const antalFoer = (await q(`select count(*)::int n from slutrapporter`))[0].n;

// ---- Vagten stopper ----
let e = await fejlVed(VAGT);
check(e && /^STOP: samme bon ligger flere gange i samme bil/.test(e.message), 'Vagten stopper med en tydelig fejl, når samme bon stadig ligger hos to chauffører');
check(e && /nr 1112 i 001-7144 hos Adan, Fuad/.test(e.message) && /nr 1650 i 001-8646 hos Faysal, Qaalid/.test(e.message) && /\(2 fundet/.test(e.message), 'Fejlen nævner antal (2) og hvilke numre, biler og chauffører');
check(e && /taxi_nr_4_samme_bon_hos_flere_chauffoerer\.sql/.test(e.message) && /Intet er ændret/.test(e.message), 'Fejlen henviser til forespørgsel 4 og siger, at intet er ændret');
const ix0 = await q(`select count(*)::int n from pg_indexes where tablename = 'slutrapporter' and indexname = 'ux_bon_kilde_taxi_nr'`);
check(ix0[0].n === 0 && (await q(`select count(*)::int n from slutrapporter`))[0].n === antalFoer, 'Intet er oprettet eller ændret, da vagten stoppede');
// Migration = vagt + oprettelse i én transaktion: den oprettes ikke
const MIG = `begin;\n${VAGT}\ncreate unique index ux_bon_kilde_taxi_nr on public.slutrapporter (kilde, taxi_nr, btrim(slutrapport_nr)) where taxi_nr is not null;\ncommit;`;
e = await fejlVed(MIG);
check(e && /STOP/.test(e.message) && (await q(`select count(*)::int n from pg_indexes where indexname = 'ux_bon_kilde_taxi_nr'`))[0].n === 0, 'Som migration (vagt + oprettelse i én transaktion): nøglen oprettes ikke, mens der er par');

// ---- Ret par: slet Fuads 1112 og Qaalids "1650"; nr 2303 (uden taxi_nr) er ikke et problem for nøglen ----
await db.exec(`delete from slutrapporter where id in ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000004')`);
check(await fejlVed(VAGT) === null, 'Når parrene er rettet, går vagten igennem (2303 uden taxi_nr tæller ikke)');
e = await fejlVed(MIG);
check(!e && (await q(`select count(*)::int n from pg_indexes where indexname = 'ux_bon_kilde_taxi_nr'`))[0].n === 1, 'Så oprettes den unikke nøgle');
check((await q(Q4)).filter(x => x.sikkerhed.startsWith('i område')).length === 0, 'Forespørgsel 4 viser nu ingen par i områderne');

// ---- Nøglen virker uden chauffør ----
e = await fejlVed(`insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort, taxi_nr) values ('2026-09-16', '1112', 'Fuad', 1, 1, '001-7144')`);
check(e && /unique|duplicate/i.test(e.message), 'Samme bon hos en anden chauffør (samme kilde, taxi_nr, nr) kan ikke længere indsættes');
e = await fejlVed(`insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort, taxi_nr) values ('2026-09-16', ' 1112 ', 'Faysal', 1, 1, '001-7144')`);
check(e && /unique|duplicate/i.test(e.message), 'Også med mellemrum omkring nummeret');
e = await fejlVed(`insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort, taxi_nr) values ('2026-09-16', '1112', 'Fuad', 1, 1, '001-8646')`);
check(!e, 'Samme nummer i en ANDEN bil er tilladt (nøglen indeholder taxi_nr)');
e = await fejlVed(`insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort, taxi_nr) values ('2026-09-17', '2303', 'Fuad', 1, 1, null)`);
check(!e, 'Rækker uden taxi_nr rammes ikke af nøglen');
e = await fejlVed(`insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort, taxi_nr, kilde) values ('2026-09-18', '1112', 'Qaalid', 1, 1, '001-7144', 'drivr')`);
check(!e, 'Samme nummer og bil i en anden kilde er tilladt (nøglen indeholder kilde)');
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
