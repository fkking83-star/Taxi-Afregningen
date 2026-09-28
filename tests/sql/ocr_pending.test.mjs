import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const TOK = 'tok123';
const MIG = readFileSync(new URL('../../supabase/pending/20260927130000_ocr_slutrapport_nr.sql', import.meta.url), 'utf8');
const PREV = readFileSync(new URL('../../supabase/migrations/20260925100000_hent_billeder_driver_id_nyeste.sql', import.meta.url), 'utf8');
const BUCKET = readFileSync(new URL('../../supabase/migrations/20260927120000_slutrapport_billeder_bucket.sql', import.meta.url), 'utf8');
const RET = readFileSync(new URL('../../supabase/migrations/20260924120000_ret_slutrapport_nr_og_hent_billeder.sql', import.meta.url), 'utf8');

async function nyDb({ medQaalid = true } = {}) {
  const db = new PGlite();
  await db.exec(`
    create role anon; create schema storage;
    create table storage.objects(bucket_id text, name text, created_at timestamptz);
    create table storage.buckets(id text primary key, name text, public boolean, allowed_mime_types text[]);
    create table fejlede_uploads(id uuid primary key default gen_random_uuid(), chauffor text, driver_id text, modtaget timestamptz);
    create table config(n text primary key, v text); insert into config values ('owner_token','${TOK}');
    create table slutrapporter(id uuid primary key default gen_random_uuid(), dato date, slutrapport_nr text, chauffor text,
      indkort numeric default 0, overfort numeric default 0, kontant numeric default 0, bro_faerge numeric default 0,
      vagt_start text, vagt_slut text, oprettet timestamptz default now(), billede_url text, bekraeftet boolean default false);
    create unique index ux_slutrapport on slutrapporter(chauffor, slutrapport_nr);
    create function fix_nattevagt_dato() returns trigger language plpgsql as $$ begin return new; end $$;
    create trigger trg_nattevagt before insert on slutrapporter for each row execute function fix_nattevagt_dato();
    create view v_data as select id, dato, slutrapport_nr, chauffor, indkort, overfort, kontant, bro_faerge, vagt_start, vagt_slut, oprettet,
      to_char(case when extract(day from dato) >= 28 then (date_trunc('month', dato) + interval '1 mon')::date else dato end, 'YYYY-MM') as regnskabsmaaned
      from slutrapporter s;
  `);
  await db.exec(RET);   // rigtig ret_slutrapport
  await db.exec(PREV);  // hent_billeder som live i dag
  await db.exec(BUCKET); // bucket-migrationen køres før
  await db.exec(`
    insert into slutrapporter(dato, slutrapport_nr, chauffor, indkort) values
      ('2026-09-24','1862','Qaalid',1000),
      ${medQaalid ? `('2026-09-25','1863','Qaalid',1200),  -- rettet via Ret fra OCR 0001` : ''}
      ('2026-09-25','1114','Adan',900),
      ('2026-09-20','2001','Fuad',800);
    insert into storage.objects values
      ('fejlede-billeder','0001_qaalid_1790400128.jpg','2026-09-25 22:00+00'),
      ('fejlede-billeder','0001_adan_1790500000.jpg',  '2026-09-26 22:00+00'),  -- anden chauffør, samme OCR-nr
      ('fejlede-billeder','1862_qaalid_1790300000.jpg','2026-09-24 22:00+00'),
      ('fejlede-billeder','1114_adan_1790200000.jpg',  '2026-09-25 08:00+00'),
      ('fejlede-billeder','1114_adan_1790400000.jpg',  '2026-09-26 10:00+00'),
      ('fejlede-billeder','1114_qaalid_1790600000.jpg','2026-09-27 10:00+00'),
      ('fejlede-billeder','2001__1790100000.jpg',      '2026-09-23 10:00+00'),
      ('fejlede-billeder','2001__1790150000.jpg',      '2026-09-23 12:00+00'),
      ('fejlede-billeder','5555_fuad_1790700000.jpg',  '2026-09-28 10:00+00'),
      ('andet-bucket',    '1863_qaalid_1799999999.jpg','2026-09-29 10:00+00');
  `);
  return db;
}
const q = async (db, sql, p = []) => (await db.query(sql, p)).rows;
const hb = async (db, numre, ch, tok = TOK) => q(db, `select navn, slutrapport_nr from hent_billeder($1,$2,$3) order by 2`, [tok, numre, ch]);

const db = await nyDb();
const vFoer = await q(db, `select column_name from information_schema.columns where table_name='v_data' order by ordinal_position`);
await db.exec(MIG);

// 1) kolonne + backfill + Qaalid
const rows = await q(db, `select chauffor, slutrapport_nr, ocr_slutrapport_nr from slutrapporter order by chauffor, slutrapport_nr`);
const r = Object.fromEntries(rows.map(x => [x.chauffor + x.slutrapport_nr, x]));
check(r.Qaalid1863.ocr_slutrapport_nr === '1863', 'Migrationen rører ikke Qaalid-rækker specielt (backfill = nuværende nummer)');
// Simulér: ny række indsat af Make som 0001, derefter rettet til 1864 via Ret
await db.exec(`insert into slutrapporter(dato, slutrapport_nr, chauffor) values ('2026-09-26','0001','Qaalid')`);
const qid = (await q(db, `select id from slutrapporter where slutrapport_nr='0001'`))[0].id;
await q(db, `select ret_slutrapport($1,$2,null,null,null,null,null,'1864')`, [TOK, qid]);
check((await q(db, `select ocr_slutrapport_nr o from slutrapporter where id=$1`, [qid]))[0].o === '0001', 'Ny række 0001 rettet til 1864 via Ret: ocr = 0001');
check(r.Qaalid1862.ocr_slutrapport_nr === '1862' && r.Adan1114.ocr_slutrapport_nr === '1114' && r.Fuad2001.ocr_slutrapport_nr === '2001', 'Øvrige rækker backfilled med nuværende nummer');

// 2) INSERT udfylder
await db.exec(`insert into slutrapporter(dato, slutrapport_nr, chauffor) values ('2026-09-26','0042','Fuad')`);
check((await q(db, `select ocr_slutrapport_nr o from slutrapporter where slutrapport_nr='0042'`))[0].o === '0042', 'Ny række via INSERT: ocr = slutrapport_nr');

// 3) Ret ændrer ikke ocr
const id = (await q(db, `select id from slutrapporter where slutrapport_nr='0042'`))[0].id;
await q(db, `select ret_slutrapport($1,$2,null,null,null,null,null,'1942')`, [TOK, id]);
const efter = (await q(db, `select slutrapport_nr, ocr_slutrapport_nr from slutrapporter where id=$1`, [id]))[0];
check(efter.slutrapport_nr === '1942' && efter.ocr_slutrapport_nr === '0042', 'Ret (ret_slutrapport) 0042 -> 1942: ocr forbliver 0042');
await db.exec(`update slutrapporter set ocr_slutrapport_nr='9999' where slutrapport_nr='1942'`);
check((await q(db, `select ocr_slutrapport_nr o from slutrapporter where slutrapport_nr='1942'`))[0].o === '0042', 'Direkte UPDATE af ocr_slutrapport_nr ignoreres');
await db.exec(`update slutrapporter set ocr_slutrapport_nr = slutrapport_nr where slutrapport_nr='1942'`);
check((await q(db, `select ocr_slutrapport_nr o from slutrapporter where slutrapport_nr='1942'`))[0].o === '0042', 'Heller ikke overskrevet med det rettede nummer');
await db.exec(`begin; select set_config('app.ret_ocr_nr','ja',true); update slutrapporter set ocr_slutrapport_nr='0043' where slutrapport_nr='1942'; commit;`);
check((await q(db, `select ocr_slutrapport_nr o from slutrapporter where slutrapport_nr='1942'`))[0].o === '0043', 'Bevidst manuel rettelse med app.ret_ocr_nr=ja virker');
await db.exec(`update slutrapporter set ocr_slutrapport_nr='0044' where slutrapport_nr='1942'`);
check((await q(db, `select ocr_slutrapport_nr o from slutrapporter where slutrapport_nr='1942'`))[0].o === '0043', 'Undtagelsen gælder kun i den transaktion');

// 4) hent_billeder
const qa = await hb(db, ['1862', '1864'], 'Qaalid');
check(JSON.stringify(qa) === JSON.stringify([{ navn: '1862_qaalid_1790300000.jpg', slutrapport_nr: '1862' }, { navn: '0001_qaalid_1790400128.jpg', slutrapport_nr: '1864' }]),
  'Rettet række 1864: får 0001_qaalid-filen (returneret under 1864), ikke Adans 0001-fil');
check(JSON.stringify(await hb(db, ['1114'], 'Adan')) === JSON.stringify([{ navn: '1114_adan_1790400000.jpg', slutrapport_nr: '1114' }]), 'Adan 1114: egen fil, nyeste – ikke Qaalids 1114');
check(JSON.stringify(await hb(db, ['2001'], 'Fuad')) === JSON.stringify([{ navn: '2001__1790150000.jpg', slutrapport_nr: '2001' }]), 'Gammel fil uden fører: nyeste bruges stadig');
check((await hb(db, ['1114'], 'Fuad')).length === 0, 'Fuad har ingen 1114-række/-fil: får ikke Adans eller Qaalids');
check((await hb(db, ['5555'], 'Fuad')).map(x => x.navn).join() === '5555_fuad_1790700000.jpg', 'Nummer uden række: matcher som før direkte på nummeret');
await db.exec(`alter table slutrapporter disable trigger trg_ocr_slutrapport_nr; update slutrapporter set ocr_slutrapport_nr=null where slutrapport_nr='1114'; alter table slutrapporter enable trigger trg_ocr_slutrapport_nr;`);
check((await hb(db, ['1114'], 'Adan')).map(x => x.navn).join() === '1114_adan_1790400000.jpg', 'Række uden ocr_slutrapport_nr: fallback til slutrapport_nr');
check((await hb(db, ['1863'], 'Qaalid', 'forkert')).length === 0, 'Forkert token: ingen rækker');
const sig = await q(db, `select pg_get_function_identity_arguments(p.oid) a, pg_get_function_result(p.oid) r from pg_proc p where proname='hent_billeder'`);
check(sig.length === 1 && sig[0].a === 'p_token text, p_numre text[], p_chauffor text' && sig[0].r === 'TABLE(navn text, slutrapport_nr text, bucket text)', 'hent_billeder: uændret signatur og returtype (dashboardet skal ikke ændres)');

// Lønberegning uberørt
const vEfter = await q(db, `select column_name from information_schema.columns where table_name='v_data' order by ordinal_position`);
check(JSON.stringify(vFoer) === JSON.stringify(vEfter), 'v_data: samme kolonner før og efter');

// Idempotent
let fejl = null; try { await db.exec(MIG); } catch (e) { fejl = e.message; }
check(!fejl && (await q(db, `select ocr_slutrapport_nr o from slutrapporter where slutrapport_nr='1864'`))[0].o === '0001', 'Kan køres igen uden fejl; rettet række beholder ocr 0001');

console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
