// Er databasen, der bygges fra supabase/migrations/, den samme som live? Sammenligner med et øjebliksbillede
// af live (tests/data/live_skema_2026-09-29.csv, resultatet af snapshot-forespørgslen i SQL Editor, indsat uændret):
// view-definitioner, funktioners kode (md5 af kroppen), security definer og RLS.
import { readFileSync } from 'fs';
import { bygFraMigrationer } from '../hjaelpere/skema.mjs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };

// CSV med felter i "..." (kommaer inde i felter)
function csv(tekst) {
  const rk = []; let r = [], felt = '', i = 0, iq = false;
  for (; i < tekst.length; i++) {
    const c = tekst[i];
    if (iq) { if (c === '"' && tekst[i + 1] === '"') { felt += '"'; i++; } else if (c === '"') iq = false; else felt += c; }
    else if (c === '"') iq = true;
    else if (c === ',') { r.push(felt); felt = ''; }
    else if (c === '\n') { r.push(felt); rk.push(r); r = []; felt = ''; }
    else if (c !== '\r') felt += c;
  }
  if (felt || r.length) { r.push(felt); rk.push(r); }
  return rk;
}
const LIVE = { views: {}, funktioner: {}, rls: {} };
for (const [type, navn, detalje] of csv(readFileSync(new URL('../data/live_skema_2026-09-29.csv', import.meta.url), 'utf8')).slice(1)) {
  if (type === 'view') LIVE.views[navn] = detalje;
  if (type === 'rls') LIVE.rls[navn] = detalje.startsWith('rls=true');
  if (type === 'funktion') LIVE.funktioner[navn.split('(')[0]] = { security_definer: detalje.startsWith('definer'), md5: detalje.match(/md5=(\w+)/)[1] };
}

// Øjebliksbilledet er taget, før 20260929120000 blev kørt live; kæden bygges derfor til og med den sidste
// migration, der var kørt dengang. Tag et nyt øjebliksbillede og flyt grænsen, når nye migrationer er kørt.
const SNAPSHOT_TIL = '20260928120000_opret_slutrapport.sql';
const { db, fejl } = await bygFraMigrationer({ til: SNAPSHOT_TIL });
check(!fejl, 'Hele kæden bygger' + (fejl ? `: ${fejl.fil} -> ${fejl.besked}` : ''));
if (fejl) { console.log(`\n${f} FEJL`); process.exit(1); }
const q = async s => (await db.query(s)).rows;

const views = Object.fromEntries((await q(`
  select c.relname navn, regexp_replace(pg_get_viewdef(c.oid, true), '\\s+', ' ', 'g') def
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind in ('v','m')`)).map(r => [r.navn, r.def]));
check(JSON.stringify(Object.keys(views).sort()) === JSON.stringify(Object.keys(LIVE.views).sort()),
  `Samme views som live (bygget: ${Object.keys(views).sort().join(', ')})`);
for (const [navn, def] of Object.entries(LIVE.views)) check(views[navn] === def, `View ${navn}: definition som live`);

// Live-funktionernes kode har CRLF-linjeskift (Windows-typen); md5 er taget af den rå kode. Migrationsfilerne har LF.
const fn = Object.fromEntries((await q(`
  select p.proname navn, p.prosecdef secdef, md5(replace(p.prosrc, E'\\n', E'\\r\\n')) md5
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).map(r => [r.navn, r]));
check(JSON.stringify(Object.keys(fn).sort()) === JSON.stringify(Object.keys(LIVE.funktioner).sort()),
  `Samme funktioner som live (bygget: ${Object.keys(fn).sort().join(', ')})`);
for (const [navn, l] of Object.entries(LIVE.funktioner))
  check(fn[navn] && fn[navn].md5 === l.md5 && fn[navn].secdef === l.security_definer, `Funktion ${navn}: samme kode og security definer som live`);

const rls = Object.fromEntries((await q(`
  select c.relname navn, c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r'`)).map(r => [r.navn, r.rls]));
for (const [navn, l] of Object.entries(LIVE.rls)) check(rls[navn] === l, `Tabel ${navn}: RLS ${l ? 'til' : 'fra'} som live`);

const kol = (await q(`select column_name from information_schema.columns where table_schema = 'public' and table_name = 'v_data' order by ordinal_position`)).map(r => r.column_name);
check(kol.join() === 'id,dato,slutrapport_nr,chauffor,indkort,overfort,kontant,bro_faerge,vagt_start,vagt_slut,oprettet,billede_url,bekraeftet,regnskabsmaaned',
  'v_data: kolonnerækkefølge som live');
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
