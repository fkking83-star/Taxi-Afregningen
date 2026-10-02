// supabase/pending/20261002100000_kontrol_ok.sql: "Kontrolleret – OK" i dashboardets "Kontrol af måneden".
import { readFileSync } from 'fs';
import { bygFraMigrationer } from '../hjaelpere/skema.mjs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const fil = p => readFileSync(new URL('../../supabase/' + p, import.meta.url), 'utf8');
const MIG = fil('pending/20261002100000_kontrol_ok.sql'), TILBAGE = fil('tilbagefoering/20261002100000_kontrol_ok.sql');

const { db, fejl } = await bygFraMigrationer();
check(!fejl, 'Kæden bygger' + (fejl ? ': ' + fejl.besked : ''));
const q = async (s, p = []) => (await db.query(s, p)).rows;
const fejlVed = async (s, p = []) => { try { await db.query(s, p); return null; } catch (e) { return e.message; } };
await db.exec(`
  alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;   -- som i Supabase
  insert into config values ('owner_token', 'ejer');
  insert into satser values ('Adan', 0.48, 50000, 0.4, false, 'tok-a');
  insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort) values ('2026-09-10', '1101', 'Adan', 2000, 2000)`);
const lonFoer = JSON.stringify(await q(`select * from v_lonseddel order by 1, 2`)), dataFoer = JSON.stringify(await q(`select * from slutrapporter`));
const funktionerFoer = (await q(`select md5(string_agg(prosrc, '' order by proname)) m from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`))[0].m;

let e = null; try { await db.exec(MIG); } catch (x) { e = x.message; }
check(!e, 'Migrationen kører uden fejl' + (e ? ': ' + e : ''));
const somAnon = async (sql, p = []) => { await db.exec('begin; set local role anon;'); try { const x = await q(sql, p); await db.exec('commit'); return x; } catch (x) { await db.exec('rollback'); return x.message; } };
const nogle = 'samme_dato_beloeb|a,b|k3f9x';
check(await somAnon(`select * from hent_kontrol_ok('ejer')`).then(r => Array.isArray(r) && r.length === 0), 'Ingen markeringer til at begynde med');
let r = await somAnon(`select * from kontrol_log`);
check(typeof r === 'string' && /permission denied/.test(r), 'Anon kan ikke læse kontrol_log direkte');
r = await somAnon(`insert into kontrol_log (noegle, type, handling, hvem) values ('x', 'y', 'ok', 'z')`);
check(typeof r === 'string' && /permission denied/.test(r), 'Anon kan ikke skrive i kontrol_log direkte');

// Ejer-kode
r = await somAnon(`select saet_kontrol_ok('forkert', $1, 'samme_dato_beloeb', array['a','b'], true)`, [nogle]);
check(typeof r === 'string' && /Ugyldig ejer-kode/.test(r) && (await q(`select count(*)::int n from kontrol_log`))[0].n === 0, 'Forkert ejer-kode: afvist, intet gemt');
check((await somAnon(`select * from hent_kontrol_ok('forkert')`)).length === 0 && (await somAnon(`select * from hent_kontrol_ok('')`)).length === 0, 'Forkert og tom ejer-kode giver ingen markeringer');
check(typeof await somAnon(`select saet_kontrol_ok('tok-a', $1, 'x', null, true)`, [nogle]) === 'string', 'En chaufførs kode er ikke en ejer-kode');

// OK, fortryd, OK igen
r = await somAnon(`select saet_kontrol_ok('ejer', $1, 'samme_dato_beloeb', array['a','b'], true)`, [nogle]);
check(Array.isArray(r), 'Markér OK som ejer virker (som anon, via funktionen)');
let ok = await somAnon(`select * from hent_kontrol_ok('ejer')`);
check(ok.length === 1 && ok[0].noegle === nogle && ok[0].type === 'samme_dato_beloeb' && ok[0].hvem === 'ejer (dashboard)' && ok[0].tidspunkt, 'Fundet står som OK med hvem og hvornår');
await somAnon(`select saet_kontrol_ok('ejer', $1, 'samme_dato_beloeb', array['a','b'], true)`, [nogle]);
check((await q(`select count(*)::int n from kontrol_log`))[0].n === 1, 'OK to gange giver kun én logrække');
await somAnon(`select saet_kontrol_ok('ejer', $1, 'samme_dato_beloeb', array['a','b'], false)`, [nogle]);
check((await somAnon(`select * from hent_kontrol_ok('ejer')`)).length === 0, 'Fortryd OK: fundet er ikke OK længere');
await somAnon(`select saet_kontrol_ok('ejer', $1, 'samme_dato_beloeb', array['a','b'], false)`, [nogle]);
check((await q(`select count(*)::int n from kontrol_log`))[0].n === 2, 'Fortryd to gange giver ikke en ekstra logrække');
await somAnon(`select saet_kontrol_ok('ejer', $1, 'samme_dato_beloeb', array['a','b'], true)`, [nogle]);
check((await somAnon(`select * from hent_kontrol_ok('ejer')`)).length === 1 && (await q(`select handling from kontrol_log order by id`)).map(x => x.handling).join() === 'ok,fortryd_ok,ok', 'OK igen: fundet er OK; loggen har hele historikken (ok, fortryd_ok, ok)');
await somAnon(`select saet_kontrol_ok('ejer', 'hul_i_raekken|001-8208|1819|1850', 'hul_i_raekken', array[]::text[], true)`);
check((await somAnon(`select noegle from hent_kontrol_ok('ejer')`)).length === 2, 'Flere fund kan være OK samtidig');
// Fortryd uden tidligere OK gør ingenting
await somAnon(`select saet_kontrol_ok('ejer', 'aldrig-set', 'overlap', null, false)`);
check((await q(`select count(*)::int n from kontrol_log where noegle = 'aldrig-set'`))[0].n === 0, 'Fortryd af et fund, der aldrig var OK, gemmer intet');
// Validering
check(/Ugyldig nøgle/.test(String(await somAnon(`select saet_kontrol_ok('ejer', '', 'x', null, true)`))) && /Ugyldig nøgle/.test(String(await somAnon(`select saet_kontrol_ok('ejer', repeat('x', 401), 'x', null, true)`))) && /Ugyldig type/.test(String(await somAnon(`select saet_kontrol_ok('ejer', 'k', '', null, true)`))), 'Tom eller for lang nøgle og tom type afvises');

// Intet andet er rørt
check(JSON.stringify(await q(`select * from v_lonseddel order by 1, 2`)) === lonFoer && JSON.stringify(await q(`select * from slutrapporter`)) === dataFoer, 'Lønsedler og slutrapporter er uændrede');
const fn = await q(`select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and proname in ('hent_kontrol_ok', 'saet_kontrol_ok') order by 1`);
check(fn.length === 2, 'Kun de to nye funktioner er tilføjet');
// Gentagelse
let e2 = null; try { await db.exec(MIG); } catch (x) { e2 = x.message; }
check(!e2 && (await somAnon(`select * from hent_kontrol_ok('ejer')`)).length === 2, 'Migrationen kan køres igen; markeringerne bevares');

// Tilbageføring
let e3 = null; try { await db.exec(TILBAGE); } catch (x) { e3 = x.message; }
check(!e3 && (await q(`select count(*)::int n from pg_proc where proname in ('hent_kontrol_ok', 'saet_kontrol_ok')`))[0].n === 0, 'Tilbageføringen fjerner de to funktioner');
check((await q(`select count(*)::int n from kontrol_log`))[0].n === 4, 'Tilbageføringen lader markeringerne (kontrol_log) stå');
const funktionerEfter = (await q(`select md5(string_agg(prosrc, '' order by proname)) m from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`))[0].m;
check(funktionerEfter === funktionerFoer, 'Efter tilbageføringen er alle funktioner præcis som før migrationen');
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
