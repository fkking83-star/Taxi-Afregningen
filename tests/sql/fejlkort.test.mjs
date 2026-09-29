// Migrationen supabase/migrations/20260929120000_fejlkort_raa_data_dublet.sql (kørt live 29/9-2026). Kæden bygges op til
// migrationen før, og den køres derefter oven på testdata:
// raa_data på fejl-rækker, find_slutrapport og dublet-svar fra opret_slutrapport. Lønberegningen urørt.
import { readFileSync } from 'fs';
import { bygFraMigrationer } from '../hjaelpere/skema.mjs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const FORSLAG = readFileSync(new URL('../../supabase/migrations/20260929120000_fejlkort_raa_data_dublet.sql', import.meta.url), 'utf8');
const SIKKERHED = readFileSync(new URL('../../supabase/pending/20260929100000_luk_direkte_adgang.sql', import.meta.url), 'utf8');

const { db, fejl } = await bygFraMigrationer({ til: '20260928120000_opret_slutrapport.sql' });
check(!fejl, 'Kæden bygger' + (fejl ? ': ' + fejl.besked : ''));
const q = async (s, p = []) => (await db.query(s, p)).rows;
const sorteret = o => o && JSON.stringify(Object.fromEntries(Object.entries(o).sort()));   // jsonb gemmer nøglerne i sin egen rækkefølge
await db.exec(`
  insert into config values ('owner_token', 'ejer');
  insert into satser values ('Qaalid', 0.48, 10000000, 0.48, true, 'tok-q'), ('Adan', 0.48, 50000, 0.4, false, 'tok-a');
  insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort, bro_faerge, vagt_start, vagt_slut) values
    ('2026-09-22', '1860', 'Qaalid', 3440, 3376, 0, '16:02', '06:41'),
    ('2026-09-23', '1114', 'Adan', 2000, 2000, 0, '06:00', '14:00');
  insert into fejlede_uploads (id, chauffor, driver_id, fejl_besked) values
    ('00000000-0000-0000-0000-000000000001', 'Qaalid', 'qaalid', 'Dublet'),
    ('00000000-0000-0000-0000-000000000002', 'Qaalid', 'qaalid', 'Ikke læsbar');
`);
const lonFoer = await q(`select * from v_lonseddel order by chauffor`);
const vdataFoer = (await q(`select column_name from information_schema.columns where table_name = 'v_data' order by ordinal_position`)).map(r => r.column_name).join();

let kfejl = null; try { await db.exec(FORSLAG); } catch (e) { kfejl = e.message; }
check(!kfejl, 'Forslaget kører uden fejl' + (kfejl ? ': ' + kfejl : ''));

// 1) raa_data
const raa = { slutrapport_nr: '1860', dato: '2026-09-22', vagt_start: '16:02', vagt_slut: '06:41', indkort: 3440.00, overfort: 3376.00, kontant: 0, bro_faerge: 0 };
await q(`update fejlede_uploads set raa_data = $1 where id = '00000000-0000-0000-0000-000000000001'`, [JSON.stringify(raa)]);
const hf = await q(`select id, raa_data from hent_fejlede('ejer') order by id`);
check(hf.length === 2 && sorteret(hf[0].raa_data) === sorteret(raa), 'hent_fejlede returnerer raa_data (som JSON-objekt)');
check(hf[1].raa_data === null, 'Fejl-række uden OCR-data: raa_data er tom');
check((await q(`select * from hent_fejlede('forkert')`)).length === 0, 'hent_fejlede med forkert token: intet');

// 2) find_slutrapport
let r = await q(`select *, dato::text dato_tekst from find_slutrapport('ejer', ' qaalid ', '1860')`);
check(r.length === 1 && r[0].dato_tekst === '2026-09-22', 'find_slutrapport finder rækken (chauffør uden hensyn til store/små bogstaver og mellemrum)');
check(r.length === 1 && Number(r[0].indkort) === 3440 && Number(r[0].overfort) === 3376 && r[0].vagt_start === '16:02', 'find_slutrapport returnerer dato, beløb og vagttider');
check((await q(`select * from find_slutrapport('ejer', 'Adan', '1860')`)).length === 0, 'Samme nr hos en anden chauffør: ingen træf');
check((await q(`select * from find_slutrapport('ejer', 'Qaalid', '1999')`)).length === 0, 'Ukendt nr: ingen træf');
check((await q(`select * from find_slutrapport('forkert', 'Qaalid', '1860')`)).length === 0, 'Forkert token: ingen træf');

// 3) opret_slutrapport ved dublet: samme besked, eksisterende række i DETAIL, HINT = dublet
const opret = async (nr, fejlId = '00000000-0000-0000-0000-000000000001', ch = 'qaalid') => {
  try { return { id: (await q(`select opret_slutrapport('ejer', $1, $2, $3, '2026-09-22', '16:02', '06:41', 3440, 3376) id`, [fejlId, ch, nr]))[0].id }; }
  catch (e) { return { besked: e.message, detail: e.detail, hint: e.hint }; }
};
let o = await opret('1860');
check(o.besked === 'Rapport nr 1860 findes allerede for Qaalid', `Dublet: samme besked som før (fik: ${o.besked})`);
check(o.hint === 'dublet', 'Dublet: HINT = dublet');
let d = null; try { d = JSON.parse(o.detail); } catch (_) {}
const eks = (await q(`select id from slutrapporter where slutrapport_nr = '1860'`))[0].id;
check(d && d.id === eks && d.dato === '2026-09-22' && Number(d.indkort) === 3440 && Number(d.overfort) === 3376 && d.chauffor === 'Qaalid',
  'Dublet: DETAIL indeholder den eksisterende rækkes id, dato og beløb');
check((await q(`select status from fejlede_uploads where id = '00000000-0000-0000-0000-000000000001'`))[0].status === 'ny', 'Dublet: fejl-rækken er urørt');
check((await q(`select count(*)::int n from slutrapporter`))[0].n === 2, 'Dublet: ingen ny række');

// Almindelig oprettelse virker som før
o = await opret('1861', '00000000-0000-0000-0000-000000000002');
check(o.id && (await q(`select status from fejlede_uploads where id = '00000000-0000-0000-0000-000000000002'`))[0].status === 'rettet', 'Ny rapport: oprettes, fejl-rækken sættes til rettet');
const sig = await q(`select pg_get_function_identity_arguments(p.oid) a, pg_get_function_result(p.oid) r from pg_proc p where proname = 'opret_slutrapport'`);
check(sig.length === 1 && sig[0].r === 'uuid' && sig[0].a.startsWith('p_token text, p_fejl_id uuid, p_chauffor text, p_slutrapport_nr text'), 'opret_slutrapport: samme signatur og returtype (uuid)');

// Lønberegningen urørt
const lonEfter = await q(`select * from v_lonseddel order by chauffor`);
await db.exec(`delete from slutrapporter where slutrapport_nr = '1861'`);
check(JSON.stringify(await q(`select * from v_lonseddel order by chauffor`)) === JSON.stringify(lonFoer), 'v_lonseddel: samme tal før og efter (når den nye testrække er fjernet)');
check(lonEfter.length === lonFoer.length, 'v_lonseddel: samme chauffører');
check((await q(`select column_name from information_schema.columns where table_name = 'v_data' order by ordinal_position`)).map(r => r.column_name).join() === vdataFoer, 'v_data: uændrede kolonner');

// Sammen med sikkerhedsforslaget: anon kan kalde de nye/ændrede funktioner, men ikke læse tabellen
let sfejl = null; try { await db.exec(SIKKERHED); } catch (e) { sfejl = e.message; }
check(!sfejl, 'Sikkerhedsforslaget kan køres bagefter' + (sfejl ? ': ' + sfejl : ''));
const somAnon = async (sql) => { await db.exec('begin; set local role anon;'); try { const x = await q(sql); await db.exec('commit'); return x; } catch (e) { await db.exec('rollback'); return e.message; } };
r = await somAnon(`select id from find_slutrapport('ejer', 'Qaalid', '1860')`);
check(Array.isArray(r) && r.length === 1, 'Som anon efter sikkerhedsforslaget: find_slutrapport virker' + (Array.isArray(r) ? '' : ': ' + r));
r = await somAnon(`select raa_data from hent_fejlede('ejer')`);
check(Array.isArray(r) && r.length === 2, 'Som anon efter sikkerhedsforslaget: hent_fejlede med raa_data virker' + (Array.isArray(r) ? '' : ': ' + r));
r = await somAnon(`select raa_data from fejlede_uploads`);
check(typeof r === 'string' && /permission denied/.test(r), 'Som anon: fejlede_uploads kan ikke læses direkte');

let igen = null; try { await db.exec(FORSLAG); } catch (e) { igen = e.message; }
check(!igen && sorteret((await q(`select raa_data from fejlede_uploads where id = '00000000-0000-0000-0000-000000000001'`))[0].raa_data) === sorteret(raa), 'Kan køres igen; raa_data bevares');
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
