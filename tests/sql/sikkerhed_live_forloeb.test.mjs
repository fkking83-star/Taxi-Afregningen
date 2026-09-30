// Live-forløbet 29/9: tabellerne blev lukket før sikkerhedskopien blev taget (kopien fik kun sekvenserne),
// og derefter blev tilbageføringen kørt. Tester supplement_kopi.sql + ny lukning + tilbageføring fra den tilstand.
import { readFileSync } from 'fs';
import { bygFraMigrationer } from '../hjaelpere/skema.mjs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const fil = p => readFileSync(new URL('../../supabase/' + p, import.meta.url), 'utf8');
const LUK = fil('pending/20260929100000_luk_direkte_adgang.sql');
const TILBAGE = fil('tilbagefoering/20260929100000_luk_direkte_adgang.sql');
const SUPP = fil('tilbagefoering/20260929100000_supplement_kopi.sql');

const { db, fejl } = await bygFraMigrationer();
check(!fejl, 'Kæden bygger' + (fejl ? ': ' + fejl.besked : ''));
const q = async (s, p = []) => (await db.query(s, p)).rows;
// anons rettigheder live 29/9 (role_table_grants)
const ALLE = ['DELETE', 'INSERT', 'REFERENCES', 'SELECT', 'TRIGGER', 'TRUNCATE', 'UPDATE'];
const UDEN_SELECT = ALLE.filter(p => p !== 'SELECT');
const LIVE_29_9 = {
  'chauffør Afregning': ALLE, config: UDEN_SELECT, fejlede_uploads: UDEN_SELECT, satser: ALLE,
  slutrapporter: UDEN_SELECT, v_advarsler: UDEN_SELECT, v_afregning: ALLE, v_data: ALLE,
  v_dato_tjek: ALLE, v_dubletter: UDEN_SELECT, v_lonseddel: ALLE,
};
const forventet = Object.entries(LIVE_29_9).flatMap(([o, ps]) => ps.map(p => `${o}:${p}`)).sort();
const anonTabeller = async () => (await q(`select c.relname || ':' || a.privilege_type k
  from pg_class c join pg_namespace n on n.oid = c.relnamespace cross join lateral aclexplode(c.relacl) a
  join pg_roles r on r.oid = a.grantee where n.nspname = 'public' and c.relkind in ('r','v') and r.rolname = 'anon' order by 1`)).map(x => x.k);
const alleRettigheder = async () => (await q(`select c.relname || ':' || r.rolname || ':' || a.privilege_type k
  from pg_class c join pg_namespace n on n.oid = c.relnamespace cross join lateral aclexplode(c.relacl) a
  join pg_roles r on r.oid = a.grantee where n.nspname = 'public' and r.rolname in ('anon','authenticated') order by 1`)).map(x => x.k);
const kopiAntal = async () => (await q(`select count(*)::int n from sikkerhed_backup.rettigheder_20260929`))[0].n;
const rls = async () => (await q(`select string_agg(relname || '=' || relrowsecurity, ',' order by relname) s from pg_class where relname in ('satser','slutrapporter')`))[0].s;

// Live-tilstanden 29/9 før noget blev kørt
await db.exec(`
  alter role service_role bypassrls;
  alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
  revoke all on all tables in schema public from anon, authenticated;
  ${Object.entries(LIVE_29_9).map(([o, ps]) => `grant ${ps.join(', ')} on "${o}" to anon;`).join('\n  ')}
  grant all on all sequences in schema public to anon, authenticated;
  insert into config values ('owner_token', 'ejer');
  insert into satser values ('Fuad', 0.5, 10000000, 0.5, false, 'tok-fuad');
  insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort) values ('2026-09-10', '1001', 'Fuad', 1000, 900);
`);
check((await anonTabeller()).join() === forventet.join(), `Udgangspunkt = live 29/9 (${forventet.length} tabel-rettigheder for anon)`);

// Hvad der skete live: tabellerne lukket (gammel lukning uden kopi) -> ny lukning (kopi kun sekvenser) -> tilbageføring
await db.exec(`revoke all on all tables in schema public from anon, authenticated;`);
await db.exec(LUK);
check(await kopiAntal() === 12, 'Kopien har kun sekvenserne (12 rækker), som live');
await db.exec(TILBAGE);
check((await anonTabeller()).length === 0 && await rls() === 'satser=false,slutrapporter=false', 'Live-tilstand genskabt: tabeller lukket, RLS fra, sekvenser åbne');

// Supplementet
const foerSupp = await alleRettigheder();
await db.exec(SUPP);
check(await kopiAntal() === 12 + forventet.length, `Supplement: kopien har nu ${12 + forventet.length} rækker`);
check((await alleRettigheder()).join() === foerSupp.join(), 'Supplement ændrer ingen rettigheder');
await db.exec(SUPP);
check(await kopiAntal() === 12 + forventet.length, 'Supplement kan køres igen uden dubletter');

// Ny lukning
await db.exec(LUK);
check((await alleRettigheder()).length === 0, 'Ny lukning: ingen rettigheder på tabeller, views eller sekvenser');
check(await rls() === 'satser=true,slutrapporter=true', 'Ny lukning: RLS til');
check(!(await q(`select has_function_privilege('anon', 'lonseddel(text,text)', 'execute') x`))[0].x, 'Ny lukning: anon kan ikke kalde lonseddel()');
await db.exec(`create table ny_tabel (x int)`);
check(!(await q(`select has_table_privilege('anon', 'ny_tabel', 'select') x`))[0].x, 'Ny lukning: en ny tabel giver ikke anon adgang');
check(await kopiAntal() === 12 + forventet.length, 'Ny lukning overskriver ikke kopien');
await db.exec('begin; set local role anon;');
let r; try { r = (await db.query(`select * from hent_alle('ejer')`)).rows.length; } catch (e) { r = e.message; }
await db.exec('rollback');
check(r === 1, 'Dashboardets funktion hent_alle virker efter lukningen' + (typeof r === 'string' ? ': ' + r : ''));

// Tilbageføring nu = præcis live 29/9
await db.exec(`drop table ny_tabel`);
await db.exec(TILBAGE);
check((await anonTabeller()).join() === forventet.join(), 'Tilbageføring åbner præcis som live 29/9 (tabeller og views)');
check(await rls() === 'satser=false,slutrapporter=false', 'Tilbageføring: RLS fra som før');
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
