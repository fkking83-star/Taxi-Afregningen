// supabase/pending/20261003100000_standard_biler.sql: standardbil pr. chauffør (udgangspunkt, ikke regel).
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { bygFraMigrationer } from '../hjaelpere/skema.mjs';
const K = createRequire(import.meta.url)('../../site/kontroller.js');
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const fil = p => readFileSync(new URL('../../supabase/' + p, import.meta.url), 'utf8');
const MIG = fil('pending/20261003100000_standard_biler.sql'), TILBAGE = fil('tilbagefoering/20261003100000_standard_biler.sql');
const { db, fejl } = await bygFraMigrationer();
check(!fejl, 'Kæden bygger' + (fejl ? ': ' + fejl.besked : ''));
const q = async (s, p = []) => (await db.query(s, p)).rows;
const fejlVed = async (s) => { try { await db.exec(s); return null; } catch (e) { try { await db.exec('rollback'); } catch (_) {} return e.message; } };
await db.exec(`
  alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
  insert into config values ('owner_token', 'ejer');
  insert into satser values ('Adan', 0.48, 50000, 0.4, false, 'a'), ('Fuad', 0.5, 10000000, 0.5, false, 'f'), ('Faysal', 0.5, 10000000, 0.5, false, 'y'), ('Qaalid', 0.48, 10000000, 0.48, true, 'q'), ('Abdikarin', 0.5, 10000000, 0.5, false, 'b');
  insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort) values ('2026-09-10', '1101', 'Adan', 2000, 2000)`);
const lonFoer = JSON.stringify(await q(`select * from v_lonseddel order by 1, 2`)), dataFoer = JSON.stringify(await q(`select * from slutrapporter`));
const funkFoer = (await q(`select md5(string_agg(prosrc, '' order by proname)) m from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`))[0].m;

// En kæde uden de fire chauffører i satser stopper tydeligt
{ const tom = await bygFraMigrationer(); await tom.db.exec(`insert into satser values ('Adan', 0.48, 50000, 0.4, false, 'a')`);
  let e = null; try { await tom.db.exec(MIG); } catch (x) { e = x.message; }
  check(e && /fandt kun 1 af de 4 chauffører/.test(e), 'Mangler chauffører i satser, stopper migrationen med en tydelig fejl (intet ændret)'); }

let e = await fejlVed(MIG);
check(!e, 'Migrationen kører uden fejl' + (e ? ': ' + e : ''));
const somAnon = async (sql, p = []) => { await db.exec('begin; set local role anon;'); try { const x = await q(sql, p); await db.exec('commit'); return x; } catch (x) { await db.exec('rollback'); return x.message; } };
let r = await somAnon(`select chauffor, taxi_nr from hent_chauffoer_biler('ejer') order by 1`);
const mapSql = Object.fromEntries(r.map(x => [x.chauffor.toLowerCase(), x.taxi_nr]));
check(Array.isArray(r) && r.length === 4 && JSON.stringify(mapSql) === JSON.stringify({ adan: '001-7144', faysal: '001-8646', fuad: '001-8646', qaalid: '001-8208' }), 'Standardbilerne: Adan 001-7144, Fuad og Faysal 001-8646, Qaalid 001-8208 (Abdikarin har ingen)');
check(JSON.stringify(Object.fromEntries(Object.entries(mapSql).sort())) === JSON.stringify(Object.fromEntries(Object.entries(K.STANDARD.STANDARD_BIL).sort())), 'Startværdierne i databasen er de samme som de indbyggede i kontroller.js');
check(r.map(x => x.chauffor).join() === 'Adan,Faysal,Fuad,Qaalid', 'Navnene har satsers stavemåde');
check((await somAnon(`select * from hent_chauffoer_biler('forkert')`)).length === 0 && (await somAnon(`select * from hent_chauffoer_biler('')`)).length === 0, 'Forkert og tom ejer-kode giver ingenting');
r = await somAnon(`select * from chauffoer_biler_log`);
check(typeof r === 'string' && /permission denied/.test(r), 'Anon kan ikke læse logtabellen direkte');
r = await somAnon(`insert into chauffoer_biler_log (chauffor, taxi_nr, hvem) values ('Adan', '001-1111', 'x')`);
check(typeof r === 'string' && /permission denied/.test(r), 'Anon kan ikke skrive i logtabellen direkte');
check(await fejlVed(MIG) === null && (await q(`select count(*)::int n from chauffoer_biler_log`))[0].n === 4, 'Migrationen kan køres igen uden dubletter (startværdierne sættes kun første gang)');

// Ændre standardbil
r = await somAnon(`select saet_chauffoer_bil('forkert', 'Adan', '001-8646')`);
check(typeof r === 'string' && /Ugyldig ejer-kode/.test(r) && (await q(`select count(*)::int n from chauffoer_biler_log`))[0].n === 4, 'Forkert ejer-kode: afvist, intet gemt');
check(/Ukendt chauffør/.test(String(await somAnon(`select saet_chauffoer_bil('ejer', 'Findes ikke', '001-8646')`))) && /Ugyldigt taxi nr/.test(String(await somAnon(`select saet_chauffoer_bil('ejer', 'Adan', '8646')`))), 'Ukendt chauffør og ugyldigt taxi nr afvises');
await somAnon(`select saet_chauffoer_bil('ejer', ' adan ', '001-8646')`);
r = await somAnon(`select taxi_nr from hent_chauffoer_biler('ejer') where chauffor = 'Adan'`);
check(r[0].taxi_nr === '001-8646', 'Standardbilen kan ændres (navn uden hensyn til store/små bogstaver og mellemrum)');
check((await q(`select taxi_nr, hvem from chauffoer_biler_log where chauffor = 'Adan' order by id`)).map(x => x.taxi_nr).join() === '001-7144,001-8646', 'Ændringen er en ny logrække; den gamle står i loggen');
await somAnon(`select saet_chauffoer_bil('ejer', 'Adan', '001-8646')`);
check((await q(`select count(*)::int n from chauffoer_biler_log where chauffor = 'Adan'`))[0].n === 2, 'Samme standardbil igen gemmer intet');
await somAnon(`select saet_chauffoer_bil('ejer', 'Abdikarin', '')`);
check((await q(`select count(*)::int n from chauffoer_biler_log where chauffor = 'Abdikarin'`))[0].n === 0, 'Fjern standardbil for en chauffør uden: gemmer intet');
await somAnon(`select saet_chauffoer_bil('ejer', 'Qaalid', null)`);
r = await somAnon(`select chauffor from hent_chauffoer_biler('ejer') order by 1`);
check(r.map(x => x.chauffor).join() === 'Adan,Faysal,Fuad', 'Tom p_taxi_nr fjerner standardbilen (Qaalid har ingen nu); loggen bevares');
await somAnon(`select saet_chauffoer_bil('ejer', 'Abdikarin', '001-8208')`);
check((await somAnon(`select taxi_nr from hent_chauffoer_biler('ejer') where chauffor = 'Abdikarin'`))[0].taxi_nr === '001-8208', 'En chauffør uden standardbil kan få en');

// Intet andet rørt
check(JSON.stringify(await q(`select * from v_lonseddel order by 1, 2`)) === lonFoer && JSON.stringify(await q(`select * from slutrapporter`)) === dataFoer, 'Lønsedler og slutrapporter er uændrede');
// Tilbageføring
let e3 = null; try { await db.exec(TILBAGE); } catch (x) { e3 = x.message; }
check(!e3 && (await q(`select count(*)::int n from pg_proc where proname in ('hent_chauffoer_biler', 'saet_chauffoer_bil')`))[0].n === 0 && (await q(`select count(*)::int n from chauffoer_biler_log`))[0].n >= 4, 'Tilbageføringen fjerner funktionerne og lader loggen stå');
check((await q(`select md5(string_agg(prosrc, '' order by proname)) m from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`))[0].m === funkFoer, 'Efter tilbageføringen er alle funktioner præcis som før');
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
