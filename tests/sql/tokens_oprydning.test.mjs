// Punkt 0.2, trin 6 (oprydning) og kopiens beskyttelse: de gamle tokens i sikkerhed_backup kan ikke nås af anon/authenticated,
// og de kan slettes i dele (ejer lige efter trin 3, hver chauffør efter trin 5, til sidst 'alle') — men aldrig mens en gammel kode stadig virker.
import { readFileSync } from 'fs';
import { bygFraMigrationer } from '../hjaelpere/skema.mjs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const fil = p => readFileSync(new URL('../../supabase/' + p, import.meta.url), 'utf8');
const S = n => fil('tokens/' + n + '.sql');
const MIG = fil('pending/20260930120000_chauffor_tokens.sql');
const T_EJER_TILBAGE = fil('tilbagefoering/20260930_tilbage_ejer_kode.sql'), T_CH_TILBAGE = fil('tilbagefoering/20260930_tilbage_chauffoer_koder.sql');
const hvem = n => S('6_ryd_op_sikkerhedskopi').replace("v_hvem text := 'ejer';", `v_hvem text := '${n}';`);
const navn = (s, n) => s.replace("v_navn text := 'Fuad';", `v_navn text := '${n}';`).replace("select 'Fuad'::text as navn", `select '${n}'::text as navn`);

const { db, fejl } = await bygFraMigrationer();
check(!fejl, 'Kæden bygger' + (fejl ? ': ' + fejl.besked : ''));
const q = async (s, p = []) => (await db.query(s, p)).rows;
const fejlVed = async sql => { try { await db.exec(sql); return null; } catch (e) { try { await db.exec('rollback'); } catch (_) {} return e.message; } };
const rolle = async (r, sql) => { await db.exec(`begin; set local role ${r};`); try { const x = await q(sql); await db.exec('commit'); return x; } catch (e) { await db.exec('rollback'); return e.message; } };
await db.exec(`
  insert into config values ('owner_token', 'gammel-ejer');
  insert into satser values ('Fuad', 0.5, 10000000, 0.5, false, 'gammel-fuad'), ('Adan', 0.48, 50000, 0.4, false, 'gammel-adan'), ('Abdikarin', 0.5, 10000000, 0.5, false, null)`);
await db.exec(MIG);
await db.exec(S('0_sikkerhedskopi_gamle_tokens'));
const antal = async () => (await q(`select count(*)::int n from sikkerhed_backup.tokens_gamle_20260930`))[0].n;

// ---- Kopien kan ikke nås af anon/authenticated ----
for (const r of ['anon', 'authenticated']) {
  const x = await rolle(r, `select * from sikkerhed_backup.tokens_gamle_20260930`);
  check(typeof x === 'string' && /permission denied/.test(x), `${r} kan ikke læse kopien af de gamle tokens`);
  const y = await rolle(r, `select count(*) from sikkerhed_backup.rettigheder_20260929`);
  check(typeof y === 'string' && /permission denied/.test(y), `${r} kan ikke læse rettigheds-kopien`);
  const z = await rolle(r, `delete from sikkerhed_backup.tokens_gamle_20260930`);
  check(typeof z === 'string' && /permission denied/.test(z), `${r} kan ikke slette i kopien`);
}
const tjek = (await db.exec(S('00c_tjek_sikkerhedskopi_lukket'))).at(-1).rows;
const v = n => (tjek.find(x => x.hvad === 'rolle ' + n) || {}).vaerdi;
check(v('anon') === 'bruge skemaet: false · læse kopien: false' && v('authenticated') === 'bruge skemaet: false · læse kopien: false', 'Tjek 00c: anon og authenticated kan hverken bruge skemaet eller læse kopien');
check(!JSON.stringify(tjek).includes('gammel-'), 'Tjek 00c viser ingen token-værdier');

// ---- Trin 6 kan ikke slette en kode, der stadig virker ----
let e = await fejlVed(hvem('ejer'));
check(e !== null && /ikke slukket/.test(e) && await antal() === 4, 'Trin 6 (ejer): stopper, mens den gamle ejer-kode stadig er gyldig — intet slettet');
await db.exec(S('1_ejer_opret_ny_kode'));
e = await fejlVed(hvem('ejer'));
check(e !== null && /ikke slukket/.test(e) && await antal() === 4, 'Trin 6 (ejer): stopper også med en ny kode ved siden af, så længe den gamle ikke er slukket');
await db.exec(S('3_ejer_sluk_gammel_kode'));
e = await fejlVed(hvem('Fuad'));
check(e !== null && /virker stadig for: Fuad/.test(e) && !e.includes('gammel-') && await antal() === 4, 'Trin 6 (Fuad): stopper, mens Fuads gamle kode virker; fejlen nævner kun navnet');

// ---- Ejer: slet kopien lige efter trin 3 ----
e = await fejlVed(hvem('ejer'));
check(!e && await antal() === 3 && (await q(`select count(*)::int n from sikkerhed_backup.tokens_gamle_20260930 where art = 'ejer'`))[0].n === 0, "Trin 6 ('ejer'): kopien af den gamle ejer-kode er slettet, chaufførernes kopi er urørt");
e = await fejlVed(T_EJER_TILBAGE);
check(e !== null && /mangler/.test(e) && (await q(`select count(*)::int n from config where n = 'owner_token'`))[0].n === 1, 'Tilbageføring af ejer-koden stopper nu med tydelig besked, og intet ændres');
check(await fejlVed(hvem('ejer')) === null && await antal() === 3, "Trin 6 ('ejer') igen: ufarligt, intet at slette");

// ---- Chauffør: slet efter trin 5 ----
await db.exec(navn(S('4_chauffoer_opret_ny_kode'), 'Fuad'));
e = await fejlVed(hvem('Fuad'));
check(e !== null && /virker stadig/.test(e) && await antal() === 3, 'Trin 6 (Fuad): stopper, når der kun findes et nyt link ved siden af (trin 5 ikke kørt)');
await db.exec(navn(S('5_chauffoer_sluk_gammel_kode'), 'Fuad'));
e = await fejlVed(hvem('Fuad'));
check(!e && await antal() === 2 && (await q(`select count(*)::int n from sikkerhed_backup.tokens_gamle_20260930 where navn = 'Fuad'`))[0].n === 0, 'Trin 6 (Fuad): kopien af Fuads gamle kode er slettet, de andres er urørt');
e = await fejlVed(navn(T_CH_TILBAGE, 'Fuad'));
check(e !== null && /Ingen kopi/.test(e), 'Tilbageføring for Fuad stopper nu med tydelig besked');
check(await fejlVed(hvem('Findes ikke')) !== null && await antal() === 2, 'Trin 6 for ukendt navn stopper uden at slette');
e = await fejlVed(hvem('alle'));
check(e !== null && /virker stadig for: Adan/.test(e) && await antal() === 2, "Trin 6 ('alle'): stopper og nævner Adan, så længe hans gamle kode virker — intet slettet (alt eller intet)");

// ---- 'alle' til sidst fjerner tabellen ----
await db.exec(navn(S('4_chauffoer_opret_ny_kode'), 'Adan'));
await db.exec(navn(S('5_chauffoer_sluk_gammel_kode'), 'Adan'));
e = await fejlVed(hvem('alle'));
check(!e && (await q(`select to_regclass('sikkerhed_backup.tokens_gamle_20260930') t`))[0].t === null, "Trin 6 ('alle'): sidste rest slettet og tabellen fjernet (Abdikarin havde ingen token)");
e = await fejlVed(hvem('alle'));
check(e !== null && /allerede slettet/.test(e), 'Trin 6 igen: stopper med "allerede slettet"');
check((await q(`select count(*)::int n from config where n = 'owner_token'`))[0].n === 1 && (await q(`select count(*)::int n from sikkerhed_backup.rettigheder_20260929`))[0].n >= 0, 'Den aktive ejer-kode og rettigheds-kopien (en anden tabel) er urørt');

console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
