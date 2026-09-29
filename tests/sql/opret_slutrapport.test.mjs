import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'fs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const TOK = 'tok123';
const db = new PGlite();
await db.exec(`
  create role anon;
  create table config(n text primary key, v text); insert into config values ('owner_token','${TOK}');
  create table satser(chauffor text primary key, sats1 numeric, graense numeric, sats2 numeric, del_med_kone boolean default false, token text);
  insert into satser values ('Faysal',0.5,10000000,0.5,false,'t1'),('Qaalid',0.48,10000000,0.48,true,'t2');
  create table slutrapporter(id uuid primary key default gen_random_uuid(), dato date, slutrapport_nr text, chauffor text,
    indkort numeric default 0, overfort numeric default 0, kontant numeric default 0, bro_faerge numeric default 0,
    vagt_start text, vagt_slut text, oprettet timestamptz default now(), billede_url text, bekraeftet boolean default false);
  create unique index ux_slutrapport on slutrapporter(chauffor, slutrapport_nr);
  create function fix_nattevagt_dato() returns trigger language plpgsql as $$ begin return new; end $$;
  create trigger trg_nattevagt before insert on slutrapporter for each row execute function fix_nattevagt_dato();
  create table fejlede_uploads(id uuid primary key default gen_random_uuid(), chauffor text, driver_id text, filename text,
    fejl_besked text, billede_url text, modtaget timestamptz default now(), status text default 'ny');
  create view v_data as select id, dato, slutrapport_nr, chauffor, indkort, overfort, kontant, bro_faerge, vagt_start, vagt_slut, oprettet,
    to_char(case when extract(day from dato) >= 28 then (date_trunc('month', dato) + interval '1 mon')::date else dato end, 'YYYY-MM') as regnskabsmaaned
    from slutrapporter s;
  insert into slutrapporter(dato, slutrapport_nr, chauffor, indkort, overfort) values ('2026-09-20','1672','Faysal',1013,961);
  insert into fejlede_uploads(id, chauffor, driver_id, fejl_besked) values
    ('00000000-0000-0000-0000-000000000001','Faysal','faysal','Ikke læsbar: nr 1682, dato 2026-09-27'),
    ('00000000-0000-0000-0000-000000000002','Faysal','faysal','dublet'),
    ('00000000-0000-0000-0000-000000000003','Qaalid','qaalid','x'),
    ('00000000-0000-0000-0000-000000000004','Qaalid','qaalid','allerede'),
    ('00000000-0000-0000-0000-000000000005','Qaalid','qaalid','fejl i data');
  update fejlede_uploads set status='rettet' where id='00000000-0000-0000-0000-000000000004';
`);
await db.exec(readFileSync(new URL('../../supabase/migrations/20260928120000_opret_slutrapport.sql', import.meta.url), 'utf8'));
const q = async (sql, p = []) => (await db.query(sql, p)).rows;
const opret = async (a) => {
  try {
    const r = await q(`select opret_slutrapport($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) id`,
      [a.tok ?? TOK, a.fejl, a.ch, a.nr, a.dato, a.vs ?? '21:32', a.ve ?? '01:54', a.ind, a.ovf, a.bro ?? 0, a.url ?? null]);
    return { id: r[0].id };
  } catch (e) { return { fejl: e.message }; }
};
const status = async id => (await q(`select status from fejlede_uploads where id=$1`, [id]))[0].status;
const F = n => `00000000-0000-0000-0000-00000000000${n}`;

let r = await opret({ fejl: F(1), ch: 'faysal ', nr: ' 1682 ', dato: '2026-09-27', ind: 1638, ovf: 1484, url: 'https://x/_faysal_1.jpg' });
const row = (await q(`select * from slutrapporter where id=$1`, [r.id]))[0];
check(r.id && row, 'Opretter rækken og returnerer id');
check(row.chauffor === 'Faysal' && row.slutrapport_nr === '1682' && String(row.dato).includes('2026') , 'Chauffør-navn som i satser ("faysal " -> "Faysal"), nummer trimmet');
check(Number(row.kontant) === 0 && Number(row.indkort) === 1638 && Number(row.overfort) === 1484 && Number(row.bro_faerge) === 0, 'kontant = 0, beløb gemt, bro default 0');
check(row.vagt_start === '21:32' && row.vagt_slut === '01:54' && row.billede_url === 'https://x/_faysal_1.jpg', 'Vagttider og billede_url gemt');
check(await status(F(1)) === 'rettet', 'Fejl-rækken er sat til rettet');
check((await q(`select regnskabsmaaned from v_data where id=$1`, [r.id]))[0].regnskabsmaaned === '2026-09', 'Rækken indgår i v_data (27/9 -> september)');

r = await opret({ fejl: F(2), ch: 'Faysal', nr: '1672', dato: '2026-09-22', ind: 1013, ovf: 961 });
check(r.fejl === 'Rapport nr 1672 findes allerede for Faysal', `Dublet giver tydelig besked (fik: ${r.fejl})`);
check(await status(F(2)) === 'ny', 'Ved dublet røres fejl-rækken ikke');
r = await opret({ fejl: F(2), ch: 'FAYSAL', nr: '1682', dato: '2026-09-27', ind: 1, ovf: 1 });
check(r.fejl === 'Rapport nr 1682 findes allerede for Faysal', 'Dublet fanges også ved anden stavemåde af navnet');

r = await opret({ tok: 'forkert', fejl: F(3), ch: 'Qaalid', nr: '1865', dato: '2026-09-27', ind: 3603, ovf: 3603 });
check(r.fejl === 'Ugyldig ejer-kode' && await status(F(3)) === 'ny', 'Forkert ejer-kode: afvist, intet ændret');
r = await opret({ fejl: F(4), ch: 'Qaalid', nr: '1865', dato: '2026-09-27', ind: 3603, ovf: 3603 });
check(r.fejl === 'Fejl-rækken er allerede godkendt', 'Allerede godkendt fejl-række: afvist (ingen dobbelt-oprettelse)');
r = await opret({ fejl: '00000000-0000-0000-0000-000000000009', ch: 'Qaalid', nr: '1865', dato: '2026-09-27', ind: 1, ovf: 1 });
check(r.fejl === 'Fejl-rækken findes ikke (er den slettet?)', 'Ukendt fejl-id: afvist');
for (const [a, msg] of [[{ nr: '' }, 'Slutrapport-nr mangler'], [{ dato: null }, 'Dato mangler'], [{ ch: ' ' }, 'Chauffør mangler'], [{ ind: null }, 'Indkørt og overført skal udfyldes']]) {
  r = await opret({ fejl: F(3), ch: 'Qaalid', nr: '1865', dato: '2026-09-27', ind: 3603, ovf: 3603, ...a });
  check(r.fejl === msg, `Validering: ${msg}`);
}
check(await status(F(3)) === 'ny' && (await q(`select count(*)::int n from slutrapporter`))[0].n === 2, 'Efter afviste forsøg: ingen ekstra rækker, fejl-rækken stadig ny');

// Samme transaktion: fejler opdateringen af fejl-rækken, må rækken heller ikke oprettes
await db.exec(`create function blok() returns trigger language plpgsql as $$ begin raise exception 'blokeret'; end $$;
  create trigger t_blok before update on fejlede_uploads for each row execute function blok();`);
r = await opret({ fejl: F(5), ch: 'Qaalid', nr: '1866', dato: '2026-09-27', ind: 10, ovf: 10 });
check(r.fejl === 'blokeret' && (await q(`select count(*)::int n from slutrapporter where slutrapport_nr='1866'`))[0].n === 0, 'Fejler status-opdateringen, rulles indsættelsen tilbage (samme transaktion)');
await db.exec(`drop trigger t_blok on fejlede_uploads`);
r = await opret({ fejl: F(5), ch: 'Qaalid', nr: '1866', dato: '2026-09-27', ind: 10, ovf: 10 });
check(r.id && await status(F(5)) === 'rettet', 'Uden blokering går det igennem');
const sig = await q(`select pg_get_function_identity_arguments(p.oid) a, prosecdef from pg_proc p where proname='opret_slutrapport'`);
check(sig.length === 1 && sig[0].prosecdef === true, 'security definer, én version');
let fejl = null; try { await db.exec(readFileSync(new URL('../../supabase/migrations/20260928120000_opret_slutrapport.sql', import.meta.url), 'utf8')); } catch (e) { fejl = e.message; }
check(!fejl, 'Kan køres igen');
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
