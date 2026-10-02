// supabase/pending/20261003110000_billedliste.sql: hent_billedliste (kun læsning) til engangsjobbet scripts/omsaetning-bagud.
import { readFileSync } from 'fs';
import { bygFraMigrationer } from '../hjaelpere/skema.mjs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const fil = p => readFileSync(new URL('../../supabase/' + p, import.meta.url), 'utf8');
const MIG = fil('pending/20261003110000_billedliste.sql'), TILBAGE = fil('tilbagefoering/20261003110000_billedliste.sql');
const { db, fejl } = await bygFraMigrationer();
check(!fejl, 'Kæden bygger' + (fejl ? ': ' + fejl.besked : ''));
const q = async (s, p = []) => (await db.query(s, p)).rows;
await db.exec(`
  insert into config values ('owner_token', 'ejer');
  insert into storage.objects (bucket_id, name, created_at) values
    ('slutrapport-billeder', 'dantaxi/001-8208/2026-09/a.jpg', '2026-09-02 10:00:00+00'), ('slutrapport-billeder', '1801_qaalid_20260902.jpg', '2026-09-01 10:00:00+00'),
    ('fejlede-billeder', '_adan_20260903.jpg', '2026-09-03 10:00:00+00'), ('andet-bucket', 'x.jpg', '2026-09-04 10:00:00+00')`);
const dataFoer = JSON.stringify([await q(`select * from storage.objects order by name`), await q(`select * from config`)]);
await db.exec(MIG);
const somAnon = async (sql) => { await db.exec('begin; set local role anon;'); try { const x = await q(sql); await db.exec('commit'); return x; } catch (x) { await db.exec('rollback'); return x.message; } };
let r = await somAnon(`select * from hent_billedliste('ejer')`);
check(Array.isArray(r) && r.length === 3 && r.map(x => x.navn).join() === '1801_qaalid_20260902.jpg,dantaxi/001-8208/2026-09/a.jpg,_adan_20260903.jpg', 'Som anon med ejer-koden: alle filer i de to billed-buckets, ældste først (mapper med)');
check(!r.some(x => x.bucket === 'andet-bucket') && r.every(x => x.bucket && x.navn && x.oprettet), 'Andre buckets er ikke med; bucket, navn og oprettet er udfyldt');
check((await somAnon(`select * from hent_billedliste('forkert')`)).length === 0 && (await somAnon(`select * from hent_billedliste('')`)).length === 0, 'Forkert og tom ejer-kode giver ingenting');
check(JSON.stringify([await q(`select * from storage.objects order by name`), await q(`select * from config`)]) === dataFoer, 'Funktionen ændrer intet (kun læsning)');
await db.exec(MIG);
await db.exec(TILBAGE);
check((await q(`select count(*)::int n from pg_proc where proname = 'hent_billedliste'`))[0].n === 0, 'Tilbageføringen fjerner funktionen');
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
