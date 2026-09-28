import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const TOK = 'tok123';
const MIG = readFileSync(new URL('../../supabase/migrations/20260927120000_slutrapport_billeder_bucket.sql', import.meta.url), 'utf8');
const db = new PGlite();
await db.exec(`
  create role anon; create schema storage;
  create table storage.buckets(id text primary key, name text, public boolean default false, allowed_mime_types text[]);
  insert into storage.buckets(id,name,public) values ('fejlede-billeder','fejlede-billeder',true);
  create table storage.objects(bucket_id text, name text, created_at timestamptz);
  create table config(n text primary key, v text); insert into config values ('owner_token','${TOK}');
  create table fejlede_uploads(id uuid primary key default gen_random_uuid(), chauffor text, driver_id text, filename text,
    fejl_besked text, billede_url text, modtaget timestamptz default now(), status text default 'ny');
  create table slutrapporter(id uuid primary key default gen_random_uuid(), dato date, slutrapport_nr text, chauffor text, indkort numeric);
  create view v_data as select id, dato, slutrapport_nr, chauffor, indkort from slutrapporter;
`);
await db.exec(readFileSync(new URL('../../supabase/migrations/20260925100000_hent_billeder_driver_id_nyeste.sql', import.meta.url), 'utf8')); // som live i dag
await db.exec(`
  insert into storage.objects values
    ('fejlede-billeder',     '1114__1790281237.jpg',        '2026-09-24 20:20:37+00'),
    ('fejlede-billeder',     '1114_adan_1790400000.jpg',    '2026-09-26 10:00:00+00'),
    ('slutrapport-billeder', '1114_adan_1790500000.jpg',    '2026-09-27 10:00:00+00'),  -- nyeste, ny bucket
    ('fejlede-billeder',     '1114_qaalid_1790600000.jpg',  '2026-09-28 10:00:00+00'),
    ('slutrapport-billeder', '2001__1790100000.jpg',        '2026-09-23 10:00:00+00'),
    ('fejlede-billeder',     '2001__1790050000.jpg',        '2026-09-22 10:00:00+00'),
    ('fejlede-billeder',     '1863_qaalid_1790432380.jpg',  '2026-09-26 14:19:40+00'),
    ('fejlede-billeder',     '_qaalid_1790439628.jpg',      '2026-09-26 16:20:28+00'),  -- afvist, uden nummer
    ('fejlede-billeder',     '_qaalid_1790433574.jpg',      '2026-09-26 14:39:34+00'),
    ('slutrapport-billeder', '_faysal_1790383074.jpg',      '2026-09-26 00:37:54+00'),
    ('andet-bucket',         '_qaalid_1790439630.jpg',      '2026-09-26 16:20:30+00');
  insert into fejlede_uploads(id, chauffor, driver_id, modtaget) values
    ('00000000-0000-0000-0000-000000000001','Qaalid','qaalid','2026-09-26 16:20:31+00'),  -- 3 s efter _qaalid_1790439628
    ('00000000-0000-0000-0000-000000000002','Qaalid','qaalid','2026-09-26 14:39:40+00'),  -- tæt på _qaalid_1790433574 (14:19 er 20 min væk)
    ('00000000-0000-0000-0000-000000000003','Faysal',null,    '2026-09-26 00:38:10+00'),  -- intet driver_id: bruger chauffor
    ('00000000-0000-0000-0000-000000000004','Adan','adan',    '2026-09-26 12:00:00+00'),  -- ingen Adan-fil inden for 5 min
    ('00000000-0000-0000-0000-000000000005','Fuad','fuad',    '2026-09-26 16:20:31+00');  -- Qaalids fil samme tid: må ikke matche
`);
const vFoer = (await db.query(`select column_name from information_schema.columns where table_name='v_data' order by ordinal_position`)).rows;
await db.exec(MIG);
const q = async (sql, p = []) => (await db.query(sql, p)).rows;

const b = (await q(`select public, allowed_mime_types from storage.buckets where id='slutrapport-billeder'`))[0];
check(b && b.public === true && JSON.stringify(b.allowed_mime_types) === '["image/*"]', 'Bucket slutrapport-billeder oprettet: offentlig, image/*');
check((await q(`select public from storage.buckets where id='fejlede-billeder'`))[0].public === true, 'fejlede-billeder uændret');

const hb = async (numre, ch, tok = TOK) => q(`select navn, slutrapport_nr, bucket from hent_billeder($1,$2,$3) order by 2`, [tok, numre, ch]);
check(JSON.stringify(await hb(['1114'], 'Adan')) === JSON.stringify([{ navn: '1114_adan_1790500000.jpg', slutrapport_nr: '1114', bucket: 'slutrapport-billeder' }]), 'Adan 1114: nyeste på tværs af buckets (slutrapport-billeder), med bucket');
check((await hb(['1114'], 'Qaalid'))[0].navn === '1114_qaalid_1790600000.jpg', 'Qaalid 1114: egen fil, ikke Adans');
check(JSON.stringify(await hb(['1114'], 'Faysal')) === JSON.stringify([{ navn: '1114__1790281237.jpg', slutrapport_nr: '1114', bucket: 'fejlede-billeder' }]), 'Uden egen fil: gammel fil uden fører (som i dag)');
check((await hb(['2001'], 'Fuad'))[0].bucket === 'slutrapport-billeder', 'To filer uden fører i hver sin bucket: nyeste vælges');
check((await hb([''], 'Qaalid')).length === 0 && (await hb(['1863'], 'Qaalid'))[0].navn === '1863_qaalid_1790432380.jpg', 'Filer uden nummer ("_qaalid_...") dukker ikke op som slutrapport-billede');
check((await hb(['1114'], 'Adan', 'forkert')).length === 0, 'hent_billeder: forkert token -> intet');
const gl = await q(`select * from hent_billeder($1,$2)`, [TOK, ['1114']]);
check(gl.length === 1 && gl[0].navn === '1114__1790281237.jpg', 'Gammelt kald uden p_chauffor virker stadig');
const sig = await q(`select pg_get_function_identity_arguments(p.oid) a, pg_get_function_result(p.oid) r from pg_proc p where proname='hent_billeder'`);
check(sig.length === 1 && sig[0].r === 'TABLE(navn text, slutrapport_nr text, bucket text)', 'Kun én hent_billeder, med bucket-kolonne');

const fb = Object.fromEntries((await q(`select fejl_id::text id, bucket, navn from hent_fejl_billeder($1)`, [TOK])).map(r => [r.id.slice(-1), r]));
check(fb['1']?.navn === '_qaalid_1790439628.jpg' && fb['1'].bucket === 'fejlede-billeder', 'Fejl-række matches til afvist fil "_qaalid_..." via driver + nærmeste tid (ikke andet-bucket)');
check(fb['2']?.navn === '_qaalid_1790433574.jpg', 'Nærmeste fil vælges (6 s), ikke én 20 min før');
check(fb['3']?.navn === '_faysal_1790383074.jpg' && fb['3'].bucket === 'slutrapport-billeder', 'Uden driver_id: bruger chauffor; finder også i slutrapport-billeder');
check(!fb['4'], 'Ingen fil fra chaufføren inden for 5 min -> intet billede');
check(!fb['5'], 'Anden chaufførs fil på samme tidspunkt matches ikke');
check((await q(`select * from hent_fejl_billeder($1, 30)`, [TOK])).find(r => r.fejl_id.endsWith('4')) === undefined, 'Vinduet kan gøres større (p_minutter)');
check((await q(`select * from hent_fejl_billeder('forkert')`)).length === 0, 'hent_fejl_billeder: forkert token -> intet');

const vEfter = (await q(`select column_name from information_schema.columns where table_name='v_data' order by ordinal_position`));
check(JSON.stringify(vFoer) === JSON.stringify(vEfter), 'v_data (lønberegningens grundlag) uændret');
let fejl = null; try { await db.exec(MIG); } catch (e) { fejl = e.message; }
check(!fejl, 'Kan køres igen uden fejl' + (fejl ? ': ' + fejl : ''));

// Den ventende ocr-migration kan køres bagefter og beholder bucket-kolonnen
await db.exec(`alter table slutrapporter add column if not exists vagt_start text`);
fejl = null; try { await db.exec(readFileSync(new URL('../../supabase/pending/20260927130000_ocr_slutrapport_nr.sql', import.meta.url), 'utf8').replace(/do \$\$[\s\S]*?end \$\$;/, '')); } catch (e) { fejl = e.message; }
const sig2 = await q(`select pg_get_function_result(p.oid) r from pg_proc p where proname='hent_billeder'`);
check(!fejl && sig2[0].r === 'TABLE(navn text, slutrapport_nr text, bucket text)', 'ocr-migrationen (20260927130000) kan køres oven på' + (fejl ? ': ' + fejl : ''));
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
