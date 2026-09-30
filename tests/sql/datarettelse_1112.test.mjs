// Datarettelsen supabase/datarettelser/20260930_fjern_fuads_dublet_1112.sql: Fuads dublet af Adans nr 1112 slettes sikkert.
import { readFileSync } from 'fs';
import { bygFraMigrationer } from '../hjaelpere/skema.mjs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const SQL = readFileSync(new URL('../../supabase/datarettelser/20260930_fjern_fuads_dublet_1112.sql', import.meta.url), 'utf8');
const FUAD = '332b32a9-2ad2-4bfb-be5c-c7bb5fcfe3d6', ADAN = '24cf8513-0478-477c-bce0-ded69d9864ec';

async function ny() {
  const { db, fejl } = await bygFraMigrationer();
  if (fejl) throw new Error(fejl.besked);
  await db.exec(`
    alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;
    insert into satser values ('Fuad', 0.5, 10000000, 0.5, false, 'tok-f'), ('Adan', 0.48, 50000, 0.4, false, 'tok-a');
    insert into slutrapporter (id, dato, slutrapport_nr, chauffor, indkort, overfort, bro_faerge, kontant, bekraeftet) values
      ('${FUAD}', '2026-09-11', '1112', 'Fuad', 4904, 4929, 0, 0, false),
      ('${ADAN}', '2026-09-11', '1112', 'Adan', 4904, 4929, 0, 0, false),
      (gen_random_uuid(), '2026-09-12', '1650', 'Fuad', 5361, 5086, 0, 0, false),
      (gen_random_uuid(), '2026-09-10', '1110', 'Adan', 5192, 5063, 0, 0, true)`);
  return db;
}
const q = async (db, s) => (await db.query(s)).rows;
const lon = async db => JSON.stringify(await q(db, `select chauffor, antal_ture, indkort_i_alt, andel_brutto from v_lonseddel where chauffor = 'Adan' order by 1`));

let db = await ny();
const adanFoer = await lon(db);
const fuadFoer = (await q(db, `select antal_ture, indkort_i_alt, andel_brutto from v_lonseddel where chauffor = 'Fuad'`))[0];
const adanRaekkeFoer = JSON.stringify((await q(db, `select * from slutrapporter where id = '${ADAN}'`))[0]);
let e = null; try { await db.exec(SQL); } catch (x) { e = x.message; }
check(!e, 'Scriptet kører uden fejl' + (e ? ': ' + e : ''));
check((await q(db, `select count(*)::int n from slutrapporter where id = '${FUAD}'`))[0].n === 0, 'Fuads 1112 er slettet');
check(JSON.stringify((await q(db, `select * from slutrapporter where id = '${ADAN}'`))[0]) === adanRaekkeFoer, 'Adans 1112 er uændret');
check(await lon(db) === adanFoer, 'Adans lønseddel er uændret');
const fuadEfter = (await q(db, `select antal_ture, indkort_i_alt, andel_brutto from v_lonseddel where chauffor = 'Fuad'`))[0];
check(Number(fuadFoer.antal_ture) - Number(fuadEfter.antal_ture) === 1 && Number(fuadFoer.indkort_i_alt) - Number(fuadEfter.indkort_i_alt) === 4904 && Number(fuadFoer.andel_brutto) - Number(fuadEfter.andel_brutto) === 2452,
  'Fuad: én tur og 4.904 indkørt færre; andel 2.452 lavere');
const kopi = await q(db, `select to_jsonb(k) - 'slettet' - 'aarsag' j, aarsag from sikkerhed_backup.slettede_slutrapporter k`);
check(kopi.length === 1 && kopi[0].j.id === FUAD && kopi[0].j.chauffor === 'Fuad' && Number(kopi[0].j.indkort) === 4904 && Number(kopi[0].j.overfort) === 4929 && /Dublet af Adans nr 1112/.test(kopi[0].aarsag), 'Kopien af Fuads række er gemt (id, beløb og årsag)');
await db.exec('begin; set local role anon;');
let adgang = null; try { await db.query(`select * from sikkerhed_backup.slettede_slutrapporter`); } catch (x) { adgang = x.message; }
await db.exec('rollback');
check(adgang && /permission denied/.test(adgang), 'Anon kan ikke læse kopien');

// Gentagelse: intet sker
let e2 = null; try { await db.exec(SQL); } catch (x) { e2 = x.message; }
check(!e2 && (await q(db, `select count(*)::int n from sikkerhed_backup.slettede_slutrapporter`))[0].n === 1 && (await q(db, `select count(*)::int n from slutrapporter`))[0].n === 3, 'Anden kørsel: ingen ny sletning, ingen dobbelt kopi');

// Sikring: uden Adans række slettes intet
db = await ny();
await db.exec(`delete from slutrapporter where id = '${ADAN}'`);
await db.exec(SQL);
check((await q(db, `select count(*)::int n from slutrapporter where id = '${FUAD}'`))[0].n === 1, 'Uden Adans 1112: Fuads række slettes IKKE');
// Sikring: forskelligt beløb slettes ikke
db = await ny();
await db.exec(`update slutrapporter set indkort = 4000 where id = '${ADAN}'`);
await db.exec(SQL);
check((await q(db, `select count(*)::int n from slutrapporter where id = '${FUAD}'`))[0].n === 1, 'Hvis Adans række har andre tal: Fuads række slettes IKKE');
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
