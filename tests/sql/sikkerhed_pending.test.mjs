// Forslaget supabase/pending/20260929100000_luk_direkte_adgang.sql:
// FØR: anon kan læse tokens/løn og ændre satser direkte. EFTER: kun RPC'erne virker for anon.
// Bygger på baseline-migrationen (grants som live). Skiftes til hele kæden, når 20260919220000 er rettet.
import { readFileSync } from 'fs';
import { bygFraMigrationer } from '../hjaelpere/skema.mjs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const FORSLAG = readFileSync(new URL('../../supabase/pending/20260929100000_luk_direkte_adgang.sql', import.meta.url), 'utf8');

const { db, fejl } = await bygFraMigrationer({ til: '20260919201534_remote_schema.sql' });
check(!fejl, 'Baseline bygger' + (fejl ? ': ' + fejl.besked : ''));
await db.exec(`
  alter role service_role bypassrls;   -- som i Supabase
  alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;   -- som i Supabase
  -- Live har også disse grants på views (information_schema.role_table_grants, 29/9); baseline-filen mangler dem
  grant select, insert, update, delete, truncate, references, trigger on v_data, v_lonseddel, v_afregning, v_dato_tjek to anon;
  grant insert, update, delete, truncate, references, trigger on v_advarsler, v_dubletter to anon;
  insert into config values ('owner_token', 'ejer');
  insert into satser values ('Fuad', 0.5, 10000000, 0.5, false, 'tok-fuad'), ('Adan', 0.48, 50000, 0.4, false, 'tok-adan');
  insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort) values
    ('2026-09-10', '1001', 'Fuad', 1000, 900), ('2026-09-11', '1101', 'Adan', 2000, 2000);
  insert into fejlede_uploads (chauffor, fejl_besked) values ('Adan', 'x');
`);

// Kør som anon (som PostgREST gør med anon-nøglen). Returnerer rækker eller fejlbesked.
async function somAnon(sql, p = []) {
  await db.exec('begin; set local role anon;');
  try { const r = (await db.query(sql, p)).rows; await db.exec('commit'); return { rows: r }; }
  catch (e) { await db.exec('rollback'); return { fejl: e.message }; }
}
const naegtet = r => !!r.fejl && /permission denied/.test(r.fejl);
const direkte = {
  'SELECT token fra satser': `select token from satser`,
  'UPDATE satser (ændre sats)': `update satser set sats1 = 0.9 where chauffor = 'Fuad'`,
  'INSERT falsk slutrapport': `insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort) values ('2026-09-12','9999','Fuad',99999,0)`,
  'SELECT fra v_lonseddel (alles løn)': `select chauffor, til_udbetaling from v_lonseddel`,
  'SELECT fra v_data': `select * from v_data`,
  'UPDATE gennem v_data': `update v_data set indkort = 1 where chauffor = 'Adan'`,
  'SELECT fra v_afregning': `select * from v_afregning`,
  'lonseddel() uden token': `select * from lonseddel('Adan', '2026-09')`,
};

// ---------- FØR ----------
const foer = {};
for (const [navn, sql] of Object.entries(direkte)) foer[navn] = await somAnon(sql);
check(!foer['SELECT token fra satser'].fejl && foer['SELECT token fra satser'].rows.length === 2, 'FØR: anon kan læse alle tokens i satser (fundet)');
check(!foer['UPDATE satser (ændre sats)'].fejl, 'FØR: anon kan ændre satser (fundet)');
check(!foer['INSERT falsk slutrapport'].fejl, 'FØR: anon kan indsætte en slutrapport (fundet)');
check(!foer['SELECT fra v_lonseddel (alles løn)'].fejl, 'FØR: anon kan læse alle lønsedler (fundet)');
// Ryd op efter FØR-forsøgene, så EFTER starter fra samme data
await db.exec(`update satser set sats1 = 0.5 where chauffor = 'Fuad'; delete from slutrapporter where slutrapport_nr = '9999';
               update slutrapporter set indkort = 2000 where chauffor = 'Adan';`);
const lonFoer = (await db.query(`select chauffor, til_udbetaling from v_lonseddel order by 1`)).rows;

// ---------- Forslaget ----------
let kfejl = null; try { await db.exec(FORSLAG); } catch (e) { kfejl = e.message; }
check(!kfejl, 'Forslaget kører uden fejl' + (kfejl ? ': ' + kfejl : ''));

// ---------- EFTER ----------
for (const [navn, sql] of Object.entries(direkte)) {
  const r = await somAnon(sql);
  check(naegtet(r), `EFTER: anon afvises: ${navn}` + (r.fejl && !naegtet(r) ? ` (${r.fejl})` : ''));
}
check((await db.query(`select sats1 from satser where chauffor='Fuad'`)).rows[0].sats1 == 0.5
  && (await db.query(`select count(*)::int n from slutrapporter`)).rows[0].n === 2, 'EFTER: data er urørt');

// RPC'erne virker stadig som anon
let r = await somAnon(`select chauffor, til_udbetaling from hent_alle('ejer') order by 1`);
check(!r.fejl && JSON.stringify(r.rows) === JSON.stringify(lonFoer), 'hent_alle (ejer) virker og giver samme lønsedler som før' + (r.fejl ? ': ' + r.fejl : ''));
r = await somAnon(`select chauffor from hent_alle('forkert')`);
check(!r.fejl && r.rows.length === 0, 'hent_alle med forkert token: intet');
r = await somAnon(`select chauffor from hent_kvittering('tok-fuad')`);
check(!r.fejl && r.rows.length === 1 && r.rows[0].chauffor === 'Fuad', 'hent_kvittering: chaufføren ser kun sin egen' + (r.fejl ? ': ' + r.fejl : ''));
r = await somAnon(`select slutrapport_nr from hent_ture('tok-adan', '2026-09')`);
check(!r.fejl && r.rows.length === 1 && r.rows[0].slutrapport_nr === '1101', 'hent_ture: chaufføren ser kun sine ture' + (r.fejl ? ': ' + r.fejl : ''));
r = await somAnon(`select id from hent_fejlede('ejer')`);
check(!r.fejl && r.rows.length === 1, 'hent_fejlede (ejer) virker' + (r.fejl ? ': ' + r.fejl : ''));
const fid = (await db.query(`select id from fejlede_uploads`)).rows[0].id;
r = await somAnon(`select marker_fejl('ejer', $1, 'rettet')`, [fid]);
check(!r.fejl && (await db.query(`select status from fejlede_uploads`)).rows[0].status === 'rettet', 'marker_fejl (ejer) virker' + (r.fejl ? ': ' + r.fejl : ''));

// service_role (Make med service-nøglen) og nye tabeller
await db.exec('begin; set local role service_role;');
let sr = null; try { sr = (await db.query(`select count(*)::int n from slutrapporter`)).rows[0].n; await db.exec(`insert into slutrapporter (dato, slutrapport_nr, chauffor) values ('2026-09-13','1002','Fuad')`); } catch (e) { sr = e.message; }
await db.exec('rollback');
check(sr === 2, 'service_role kan stadig læse og indsætte i slutrapporter' + (typeof sr === 'string' ? ': ' + sr : ''));
await db.exec(`create table ny_tabel (x int)`);
check(!(await db.query(`select has_table_privilege('anon', 'ny_tabel', 'select') s`)).rows[0].s, 'En ny tabel giver ikke anon adgang automatisk');

let igen = null; try { await db.exec(FORSLAG); } catch (e) { igen = e.message; }
check(!igen, 'Kan køres igen');
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
