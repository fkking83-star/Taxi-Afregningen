// Punkt 0.2: kører man et token-script i FORKERT rækkefølge (fx 2a/4a før migrationen eller trin 0), skal man få en forklarende besked
// ("Kør først …") og intet må ændres — aldrig en rå databasefejl som 42P01 "relation does not exist".
import { readFileSync } from 'fs';
import { bygFraMigrationer } from '../hjaelpere/skema.mjs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const fil = p => readFileSync(new URL('../../supabase/' + p, import.meta.url), 'utf8');
const S = n => fil('tokens/' + n + '.sql'), MIG = fil('pending/20260930120000_chauffor_tokens.sql');
const { db, fejl } = await bygFraMigrationer();
check(!fejl, 'Kæden bygger' + (fejl ? ': ' + fejl.besked : ''));
const q = async s => (await db.query(s)).rows;
const fejlVed = async sql => { try { await db.exec(sql); return null; } catch (e) { try { await db.exec('rollback'); } catch (_) {} return e.message; } };
await db.exec(`insert into config values ('owner_token', 'gammel-ejer');
  insert into satser values ('Fuad', 0.5, 10000000, 0.5, false, 'gammel-fuad'), ('Adan', 0.48, 50000, 0.4, false, 'gammel-adan')`);
const tilstand = async () => JSON.stringify([await q(`select n, v from config order by 1, 2`), await q(`select chauffor, token from satser order by 1`),
  await q(`select to_regclass('public.chauffor_tokens') a, to_regclass('sikkerhed_backup.tokens_gamle_20260930') b`)]);
const stopper = async (navn, sql, moenster, hvad) => {
  const foer = await tilstand(), m = await fejlVed(sql), efter = await tilstand();
  check(m !== null && moenster.test(m) && !/does not exist|42P01|relation/.test(m), `${navn}: ${hvad} (besked: "${(m || '').slice(0, 70)}…")`);
  check(foer === efter, `${navn}: intet er ændret`);
};
const MIGM = /Kør først migrationen/, BAKM = /Kør først trin 0/;

// ---- Før migrationen og før trin 0 ----
await stopper('2a', S('2a_hent_ejer_link'), BAKM, 'uden trin 0 siger scriptet, at trin 0 skal køres først');
await stopper('4a', S('4a_hent_chauffoer_link'), MIGM, 'uden migrationen siger scriptet, at migrationen skal køres først');
await stopper('1', S('1_ejer_opret_ny_kode'), MIGM, 'uden migrationen siger scriptet, at migrationen skal køres først');
await stopper('3', S('3_ejer_sluk_gammel_kode'), BAKM, 'uden trin 0 siger scriptet, at trin 0 skal køres først');
await stopper('4', S('4_chauffoer_opret_ny_kode'), MIGM, 'uden migrationen siger scriptet, at migrationen skal køres først');
await stopper('5', S('5_chauffoer_sluk_gammel_kode'), MIGM, 'uden migrationen siger scriptet, at migrationen skal køres først');

// ---- Efter migrationen, før trin 0 ----
await db.exec(MIG);
await stopper('1', S('1_ejer_opret_ny_kode'), BAKM, 'efter migrationen, men uden trin 0: trin 0 først');
await stopper('2a', S('2a_hent_ejer_link'), BAKM, 'efter migrationen, men uden trin 0: trin 0 først');
await stopper('4', S('4_chauffoer_opret_ny_kode'), BAKM, 'efter migrationen, men uden trin 0: trin 0 først');
await stopper('5', S('5_chauffoer_sluk_gammel_kode'), BAKM, 'efter migrationen, men uden trin 0: trin 0 først');
await stopper('3', S('3_ejer_sluk_gammel_kode'), BAKM, 'efter migrationen, men uden trin 0: trin 0 først');

// ---- Efter trin 0, før trin 1 / trin 4 ----
await db.exec(S('0_sikkerhedskopi_gamle_tokens'));
await stopper('2a', S('2a_hent_ejer_link'), /ingen NY ejer-kode.*trin 1/, 'uden trin 1 siger scriptet, at trin 1 skal køres først');
await stopper('3', S('3_ejer_sluk_gammel_kode'), /ingen ny ejer-kode/, 'uden en ny ejer-kode at falde tilbage på stopper scriptet (kan ikke låse ejeren ude)');
await stopper('4a', S('4a_hent_chauffoer_link'), /intet nyt link endnu.*trin 4/, 'uden trin 4 siger scriptet, at trin 4 skal køres først');
await stopper('5', S('5_chauffoer_sluk_gammel_kode'), /ikke præcis ét nyt link/, 'uden et nyt link stopper scriptet');
await stopper('4a', S('4a_hent_chauffoer_link').replace("v_navn text := 'Fuad';", "v_navn text := 'Findes ikke';"), /Ukendt chauffør: Findes ikke/, 'ukendt navn nævnes i beskeden');

// ---- Rækkefølgen virker, og beskeden indeholder aldrig et token ----
await db.exec(S('1_ejer_opret_ny_kode')); await db.exec(S('4_chauffoer_opret_ny_kode'));
const l2 = (await db.exec(S('2a_hent_ejer_link'))).at(-1).rows, l4 = (await db.exec(S('4a_hent_chauffoer_link'))).at(-1).rows;
check(l2.length === 1 && /^https:\/\/superb-daffodil-ca45c8\.netlify\.app\/dashboard\.html\?k=[0-9a-f]{64}$/.test(l2[0].dashboard_link), 'I rigtig rækkefølge giver 2a ét dashboard-link med ny kode');
check(l4.length === 1 && l4[0].chauffor === 'Fuad' && /\/kvittering\.html\?k=[0-9a-f]{64}$/.test(l4[0].link) && l4[0].besked.includes(l4[0].link), 'I rigtig rækkefølge giver 4a ét link og en færdig besked til Fuad');
check(!(await stopperTekst()).includes('gammel-'), 'Ingen af forklaringerne indeholder en token-værdi');
async function stopperTekst() { return (await fejlVed(S('1_ejer_opret_ny_kode')) || '') + (await fejlVed(S('4_chauffoer_opret_ny_kode')) || ''); }

console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
