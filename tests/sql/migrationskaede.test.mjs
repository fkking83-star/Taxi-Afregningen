// Kan hele databasen bygges fra bunden ud fra supabase/migrations/? Det kræves for at kunne oprette et
// test-projekt (supabase db push) og for at repoet er sandheden om databasen.
import { readdirSync } from 'fs';
import { bygFraMigrationer, MIGRATIONER } from '../hjaelpere/skema.mjs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };

const alle = readdirSync(MIGRATIONER).filter(x => x.endsWith('.sql')).sort();
const { db, koerte, fejl } = await bygFraMigrationer();
for (const fil of alle) check(koerte.includes(fil), `Migration kører fra bunden: ${fil}` + (fejl && fejl.fil === fil ? ` -> ${fejl.besked}` : ''));

if (!fejl) {
  const q = async s => (await db.query(s)).rows;
  const fn = (await q(`select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`)).map(r => r.proname);
  for (const navn of ['hent_alle', 'hent_ture', 'hent_kvittering', 'hent_fejlede', 'marker_fejl', 'saet_bekraeftet', 'ret_slutrapport',
                      'hent_billeder', 'hent_fejl_billeder', 'opret_slutrapport'])
    check(fn.includes(navn), `Funktion findes efter kæden: ${navn}`);
  const views = (await q(`select table_name from information_schema.views where table_schema = 'public'`)).map(r => r.table_name);
  for (const v of ['v_data', 'v_lonseddel', 'v_afregning']) check(views.includes(v), `View findes: ${v}`);
  // Lønberegningen kan køres på det byggede skema
  await db.exec(`insert into satser values ('Test', 0.5, 10000000, 0.5, false, 'tok');
                 insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort) values ('2026-09-10', '1001', 'Test', 1000, 900)`);
  const l = (await q(`select antal_ture, andel_brutto from v_lonseddel where chauffor = 'Test'`))[0];
  check(l && Number(l.antal_ture) === 1 && Number(l.andel_brutto) === 500, 'v_lonseddel regner på det byggede skema');
}
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
