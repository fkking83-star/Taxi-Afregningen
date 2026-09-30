// Migrationen supabase/migrations/20260930100000_luk_direkte_adgang.sql (kørt live 30/9-2026). Kæden bygges til og med migrationen før:
// FØR: anon kan læse tokens/løn og ændre satser direkte. EFTER: kun RPC'erne virker for anon.
// Bygger hele kæden fra supabase/migrations/ og lægger live's grants oveni (tjekket 29/9-2026).
import { readFileSync } from 'fs';
import { bygFraMigrationer } from '../hjaelpere/skema.mjs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const FORSLAG = readFileSync(new URL('../../supabase/migrations/20260930100000_luk_direkte_adgang.sql', import.meta.url), 'utf8');
const TILBAGE = readFileSync(new URL('../../supabase/tilbagefoering/20260929100000_luk_direkte_adgang.sql', import.meta.url), 'utf8');

const { db, fejl } = await bygFraMigrationer({ til: '20260929130000_aendringslog.sql' });
check(!fejl, 'Kæden bygger' + (fejl ? ': ' + fejl.besked : ''));
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

// Alle anon/authenticated-rettigheder på tabeller, views og sekvenser i public, som sammenlignelig tekst
const rettigheder = async () => (await db.query(`
  select c.relname || ':' || r.rolname || ':' || a.privilege_type k
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  cross join lateral aclexplode(c.relacl) a join pg_roles r on r.oid = a.grantee
  where n.nspname = 'public' and c.relkind in ('r','v','m','S','p','f') and r.rolname in ('anon','authenticated')
  order by 1`)).rows.map(x => x.k);
const rls = async () => (await db.query(`select relname, relrowsecurity from pg_class where relname in ('satser','slutrapporter') order by 1`)).rows.map(x => x.relname + '=' + x.relrowsecurity).join();
const rettighederFoer = await rettigheder(), rlsFoer = await rls();

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
r = await somAnon(`select navn from hent_billeder('ejer', array['1001'], 'Fuad')`);
check(!r.fejl, 'hent_billeder (ejer) virker' + (r.fejl ? ': ' + r.fejl : ''));
r = await somAnon(`select id from hent_fejlede('ejer')`);
check(!r.fejl && r.rows.length === 1, 'hent_fejlede (ejer) virker' + (r.fejl ? ': ' + r.fejl : ''));
const fid = (await db.query(`select id from fejlede_uploads`)).rows[0].id;
r = await somAnon(`select marker_fejl('ejer', $1, 'rettet')`, [fid]);
check(!r.fejl && (await db.query(`select status from fejlede_uploads`)).rows[0].status === 'rettet', 'marker_fejl (ejer) virker' + (r.fejl ? ': ' + r.fejl : ''));
const fid2 = (await db.query(`insert into fejlede_uploads (chauffor, fejl_besked) values ('Fuad', 'y') returning id`)).rows[0].id;
r = await somAnon(`select opret_slutrapport('ejer', $1, 'Fuad', '1003', '2026-09-14', '06:00', '14:00', 100, 90) id`, [fid2]);
check(!r.fejl && (await db.query(`select count(*)::int n from slutrapporter where slutrapport_nr = '1003'`)).rows[0].n === 1, '"Udfyld og godkend" (opret_slutrapport) virker' + (r.fejl ? ': ' + r.fejl : ''));
const rid = (await db.query(`select id from slutrapporter where slutrapport_nr = '1003'`)).rows[0].id;
r = await somAnon(`select ret_slutrapport('ejer', $1, null, 110, null, null, null, null)`, [rid]);
check(!r.fejl && Number((await db.query(`select indkort from slutrapporter where id = $1`, [rid])).rows[0].indkort) === 110, 'Ret (ret_slutrapport) virker' + (r.fejl ? ': ' + r.fejl : ''));
await db.exec(`delete from slutrapporter where slutrapport_nr = '1003'`);

// service_role (Make med service-nøglen) og nye tabeller
await db.exec('begin; set local role service_role;');
let sr = null; try { sr = (await db.query(`select count(*)::int n from slutrapporter`)).rows[0].n; await db.exec(`insert into slutrapporter (dato, slutrapport_nr, chauffor) values ('2026-09-13','1002','Fuad')`); } catch (e) { sr = e.message; }
await db.exec('rollback');
check(sr === 2, 'service_role kan stadig læse og indsætte i slutrapporter' + (typeof sr === 'string' ? ': ' + sr : ''));
await db.exec(`create table ny_tabel (x int)`);
check(!(await db.query(`select has_table_privilege('anon', 'ny_tabel', 'select') s`)).rows[0].s, 'En ny tabel giver ikke anon adgang automatisk');

// ---------- Sikkerhedskopi og tilbageføring ----------
const kopi = (await db.query(`select objekt || ':' || grantee || ':' || privilegie k from sikkerhed_backup.rettigheder_20260929 order by 1`)).rows.map(x => x.k);
check(kopi.length === rettighederFoer.length && kopi.join() === rettighederFoer.join() && kopi.includes('satser:anon:SELECT'),
  `Sikkerhedskopien indeholder præcis rettighederne fra før lukningen (${kopi.length} stk.)`);
check((await rettigheder()).length === 0, 'Efter lukningen har anon/authenticated ingen rettigheder på tabeller, views eller sekvenser');
let rr = await somAnon(`select * from sikkerhed_backup.rettigheder_20260929`);
check(naegtet(rr), 'Anon kan ikke læse sikkerhedskopien');
let tfejl = null; try { await db.exec(TILBAGE); } catch (e) { tfejl = e.message; }
check(!tfejl, 'Tilbageføringen kører uden fejl' + (tfejl ? ': ' + tfejl : ''));
check((await rettigheder()).join() === rettighederFoer.join(), 'Tilbageføring: præcis de samme rettigheder som før lukningen');
check(await rls() === rlsFoer, `Tilbageføring: RLS som før (${rlsFoer})`);
rr = await somAnon(`select token from satser`);
check(!rr.fejl && rr.rows.length === 2, 'Tilbageføring: anon kan igen læse satser (alt er åbent som før)');
rr = await somAnon(`select * from lonseddel('Adan', '2026-09')`);
check(!rr.fejl, 'Tilbageføring: lonseddel() kan kaldes igen');
rr = await somAnon(`select chauffor from hent_alle('ejer')`);
check(!rr.fejl && rr.rows.length === 2, 'Tilbageføring: dashboardets funktioner virker stadig');

// ---------- Luk igen efter en tilbageføring ----------
let igen = null; try { await db.exec(FORSLAG); } catch (e) { igen = e.message; }
check(!igen, 'Kan køres igen');
check((await rettigheder()).length === 0 && await rls() === 'satser=true,slutrapporter=true', 'Lukket igen: ingen rettigheder, RLS til');
const kopi2 = (await db.query(`select objekt || ':' || grantee || ':' || privilegie k from sikkerhed_backup.rettigheder_20260929 order by 1`)).rows.map(x => x.k);
check(kopi2.join() === kopi.join(), 'Sikkerhedskopien er ikke overskrevet af den nye kørsel');
rr = await somAnon(`select token from satser`);
check(naegtet(rr), 'Lukket igen: anon afvises på satser');
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
