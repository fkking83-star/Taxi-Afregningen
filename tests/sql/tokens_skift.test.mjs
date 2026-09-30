// Punkt 0.2: skift af tokens med overlap. Migrationen supabase/pending/20260930120000_chauffor_tokens.sql og scripts i supabase/tokens/.
// Hele forløbet spilles igennem på en testdatabase med falske tokens: opret ny ved siden af gammel -> slet gammel -> tilbageføring.
import { readFileSync } from 'fs';
import { bygFraMigrationer } from '../hjaelpere/skema.mjs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const fil = p => readFileSync(new URL('../../supabase/' + p, import.meta.url), 'utf8');
const MIG = fil('pending/20260930120000_chauffor_tokens.sql'), MIG_TILBAGE = fil('tilbagefoering/20260930120000_chauffor_tokens.sql');
const S = n => fil('tokens/' + n + '.sql');
const T_EJER_TILBAGE = fil('tilbagefoering/20260930_tilbage_ejer_kode.sql'), T_CH_TILBAGE = fil('tilbagefoering/20260930_tilbage_chauffoer_koder.sql');
const BASE = 'https://test.example';
const medBase = s => s.replace('https://DIN-ADRESSE', BASE);
const medNavn = (s, navn) => s.replace("v_navn text := 'Fuad';", `v_navn text := '${navn}';`).replace("select 'Fuad'::text as navn", `select '${navn}'::text as navn`);

const { db, fejl } = await bygFraMigrationer();
check(!fejl, 'Kæden bygger' + (fejl ? ': ' + fejl.besked : ''));
const q = async (s, p = []) => (await db.query(s, p)).rows;
const kor = async sql => { const r = await db.exec(sql); return r.at(-1).rows; };
const fejlVed = async sql => { try { await db.exec(sql); return null; } catch (e) { try { await db.exec('rollback'); } catch (_) {} return e.message; } };   // som SQL Editor: et afbrudt script ruller tilbage
await db.exec(`
  insert into config values ('owner_token', 'gammel-ejer');
  insert into satser values ('Fuad', 0.5, 10000000, 0.5, false, 'gammel-fuad'), ('Adan', 0.48, 50000, 0.4, false, 'gammel-adan'), ('Abdikarin', 0.5, 10000000, 0.5, false, null);
  insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort, bro_faerge, kontant) values
    ('2026-09-10', '1601', 'Fuad', 1000, 900, 0, 0), ('2026-09-11', '1101', 'Adan', 2000, 2000, 0, 0)`);
const somAnon = async (sql, p = []) => { await db.exec('begin; set local role anon;'); try { const x = await q(sql, p); await db.exec('commit'); return x; } catch (e) { await db.exec('rollback'); return e.message; } };
const alle = t => somAnon(`select chauffor from hent_alle($1, '2026-09') order by 1`, [t]);
const kvit = t => somAnon(`select chauffor from hent_kvittering($1, '2026-09')`, [t]);
const ture = t => somAnon(`select chauffor, slutrapport_nr from hent_ture($1, '2026-09') order by 2`, [t]);
const lonFoer = JSON.stringify(await q(`select * from v_lonseddel order by 1, 2`)), afrFoer = JSON.stringify(await q(`select * from v_afregning order by 1, 2`));
const satserUdenToken = JSON.stringify(await q(`select chauffor, sats1, graense, sats2, del_med_kone from satser order by 1`));

// ---- Første tjek: viser aldrig selve tokens ----
const tjek = await kor(S('00_foerstetjek'));
check(tjek.some(x => x.hvad === 'ejer_koder' && x.vaerdi === '1') && tjek.some(x => x.hvad === 'chauffør Abdikarin' && x.vaerdi === 'INGEN token') && tjek.some(x => x.hvad === 'chauffør Fuad' && x.vaerdi === 'har token (11 tegn)') && tjek.some(x => x.hvad === 'token brugt af flere chauffører' && x.vaerdi === '0'),
  'Første tjek: antal ejer-koder, hvem der har token, og dubletter');
check(!JSON.stringify(tjek).includes('gammel-'), 'Første tjek indeholder ingen token-værdier');

// ---- Migrationen ----
check((await kvit('gammel-fuad')).length === 1 && (await ture('gammel-adan')).length === 1, 'FØR migrationen: gamle chauffør-links virker');
let e = await fejlVed(MIG);
check(!e, 'Migrationen kører uden fejl' + (e ? ': ' + e : ''));
check((await kvit('gammel-fuad')).map(r => r.chauffor).join() === 'Fuad' && (await ture('gammel-adan')).map(r => r.slutrapport_nr).join() === '1101', 'EFTER migrationen: gamle chauffør-links virker uændret');
check((await ture('gammel-ejer')).length === 2 && (await alle('gammel-ejer')).length === 2, 'Ejer-koden virker uændret (hent_ture giver alle, hent_alle giver alle)');
check((await kvit('forkert')).length === 0 && (await ture('forkert')).length === 0 && (await kvit('')).length === 0, 'Forkert og tom kode giver intet');
let r = await somAnon(`select * from chauffor_tokens`);
check(typeof r === 'string' && /permission denied/.test(r), 'Anon kan ikke læse chauffor_tokens');
check(await fejlVed(MIG) === null, 'Migrationen kan køres igen');
const nogler = (await q(`select conname from pg_constraint where conrelid = 'public.config'::regclass and contype in ('p','u') order by 1`)).map(x => x.conname).join();
check(nogler === 'config_n_v_key', 'config: primærnøglen på n er erstattet af unik nøgle på (n, v)');
check(await fejlVed(`insert into config values ('owner_token', 'gammel-ejer')`) !== null, 'Samme kode kan stadig ikke stå to gange');

// ---- Trin 0: kopi ----
await db.exec(S('0_sikkerhedskopi_gamle_tokens'));
let k = await q(`select art, count(*)::int antal, count(token)::int med from sikkerhed_backup.tokens_gamle_20260930 group by art order by art`);
check(JSON.stringify(k) === JSON.stringify([{ art: 'chauffør', antal: 3, med: 2 }, { art: 'ejer', antal: 1, med: 1 }]), 'Trin 0: kopi af 1 ejer-kode og 3 chauffører (2 med token)');
r = await somAnon(`select * from sikkerhed_backup.tokens_gamle_20260930`);
check(typeof r === 'string' && /permission denied/.test(r), 'Anon kan ikke læse kopien');
await db.exec(S('0_sikkerhedskopi_gamle_tokens'));
check((await q(`select count(*)::int n from sikkerhed_backup.tokens_gamle_20260930`))[0].n === 4, 'Trin 0 kan køres igen uden dubletter');

// ---- Sikring: sluk kan ikke køres, før der findes en ny ejer-kode ----
e = await fejlVed(S('3_ejer_sluk_gammel_kode'));
check(e !== null && /ingen ny ejer-kode/.test(e) && (await alle('gammel-ejer')).length === 2, 'Trin 3 FØR trin 1: stopper ("ingen ny ejer-kode"), den gamle ejer-kode virker stadig');

// ---- Ejer: opret ny (overlap) ----
check(await fejlVed(S('4_chauffoer_opret_ny_kode').replace("'Fuad'", "'Ukendt'")) !== null, 'Ukendt chauffør afvises');
let ud = await kor(S('1_ejer_opret_ny_kode'));
check(Number(ud[0].ejer_koder_nu) === 2, 'Trin 1: nu to ejer-koder');
const nyEjer = (await q(`select v from config where n = 'owner_token' and v <> 'gammel-ejer'`))[0].v;
check(/^[0-9a-f]{64}$/.test(nyEjer), 'Den nye ejer-kode er 64 hex-tegn (to tilfældige uuid\'er)');
check((await alle(nyEjer)).length === 2 && (await alle('gammel-ejer')).length === 2 && (await ture(nyEjer)).length === 2, 'Overlap: gammel og ny ejer-kode virker side om side');
check(await fejlVed(S('1_ejer_opret_ny_kode')) !== null && (await q(`select count(*)::int n from config where n = 'owner_token'`))[0].n === 2, 'Trin 1 kan ikke køres to gange (ingen tredje kode)');
// Link
check((await kor(S('2a_hent_ejer_link'))).length === 0, 'Trin 2a: uden rettet adresse vises intet');
ud = await kor(medBase(S('2a_hent_ejer_link')));
check(ud.length === 1 && ud[0].dashboard_link === `${BASE}/dashboard.html?k=${nyEjer}` && !ud[0].dashboard_link.includes('gammel-ejer'), 'Trin 2a: linket er adresse + /dashboard.html?k= + NY kode (ikke den gamle)');

// ---- Ejer: sluk gammel ----
e = await fejlVed(S('3_ejer_sluk_gammel_kode'));
check(!e, 'Trin 3 kører uden fejl' + (e ? ': ' + e : ''));
check((await alle('gammel-ejer')).length === 0 && (await ture('gammel-ejer')).length === 0, 'EFTER sluk: den gamle ejer-kode giver intet (hent_alle, hent_ture)');
check((await alle(nyEjer)).length === 2, 'EFTER sluk: den nye ejer-kode virker');
let skriv = await somAnon(`select ret_slutrapport('gammel-ejer', (select id from slutrapporter limit 1), null, 1, null, null, null, null)`);
check((await q(`select indkort from slutrapporter where slutrapport_nr = '1601'`))[0].indkort == 1000, 'Den gamle ejer-kode kan ikke ændre data');
check((await q(`select count(*)::int n from config where n = 'owner_token'`))[0].n === 1, 'Kun den nye ejer-kode er tilbage');
// Trin 3 igen er ufarligt
check(await fejlVed(S('3_ejer_sluk_gammel_kode')) === null && (await alle(nyEjer)).length === 2 && (await alle('gammel-ejer')).length === 0, 'Trin 3 igen: ufarligt — den nye ejer-kode virker stadig, den gamle er stadig slukket');
// Tilbageføring
e = await fejlVed(T_EJER_TILBAGE);
check(!e && (await alle('gammel-ejer')).length === 2 && (await alle(nyEjer)).length === 2, 'Tilbageføring: den gamle ejer-kode virker igen, den nye også');
check(await fejlVed(T_EJER_TILBAGE) === null && (await q(`select count(*)::int n from config where n = 'owner_token'`))[0].n === 2, 'Tilbageføring kan køres igen uden dubletter');
await db.exec(S('3_ejer_sluk_gammel_kode'));   // slukket igen til det videre forløb
check((await alle('gammel-ejer')).length === 0, 'Gammel ejer-kode slukket igen');

// ---- Chauffør: opret ny (overlap) ----
await db.exec(medNavn(S('4_chauffoer_opret_ny_kode'), 'Fuad'));
const nyFuad = (await q(`select token from chauffor_tokens where chauffor = 'Fuad'`))[0].token;
check(/^[0-9a-f]{64}$/.test(nyFuad), 'Trin 4: Fuad har fået et nyt link (64 hex-tegn)');
check((await kvit(nyFuad)).map(x => x.chauffor).join() === 'Fuad' && (await kvit('gammel-fuad')).map(x => x.chauffor).join() === 'Fuad', 'Overlap: Fuads gamle og nye link virker side om side (hent_kvittering)');
check((await ture(nyFuad)).map(x => x.slutrapport_nr).join() === '1601' && (await ture('gammel-fuad')).map(x => x.slutrapport_nr).join() === '1601', 'Overlap: begge viser kun Fuads ture (hent_ture)');
check((await ture(nyFuad)).every(x => x.chauffor === 'Fuad') && (await kvit(nyFuad)).length === 1, 'Fuads nye link viser ikke andres data');
check((await kvit('gammel-adan')).map(x => x.chauffor).join() === 'Adan', 'Adans gamle link er urørt, mens Fuad skiftes');
check(await fejlVed(medNavn(S('4_chauffoer_opret_ny_kode'), 'Fuad')) !== null && (await q(`select count(*)::int n from chauffor_tokens`))[0].n === 1, 'Trin 4 igen for Fuad: stopper (intet andet nyt link)');
ud = await kor(medNavn(medBase(S('4a_hent_chauffoer_link')), 'Fuad'));
check(ud.length === 1 && ud[0].link === `${BASE}/kvittering.html?k=${nyFuad}`, 'Trin 4a: linket er adresse + /kvittering.html?k= + Fuads nye kode');
check(ud[0].besked.startsWith('Hej Fuad!') && ud[0].besked.includes(ud[0].link) && ud[0].besked.includes('nyt, personligt link') && ud[0].besked.includes('gamle link bliver lukket om få dage') && !ud[0].besked.includes('gammel-fuad'), 'Trin 4a: færdig besked med navn, det nye link og oplysning om det gamle');
check((await kor(medNavn(S('4a_hent_chauffoer_link'), 'Fuad'))).length === 0, 'Trin 4a: uden rettet adresse vises intet');
check((await kor(medNavn(medBase(S('4a_hent_chauffoer_link')), 'Adan'))).length === 0, 'Trin 4a: ingen link for en chauffør uden nyt link');

// ---- Chauffør: sluk gammel ----
e = await fejlVed(medNavn(S('5_chauffoer_sluk_gammel_kode'), 'Fuad'));
check(!e, 'Trin 5 kører uden fejl' + (e ? ': ' + e : ''));
check((await kvit('gammel-fuad')).length === 0 && (await ture('gammel-fuad')).length === 0, 'EFTER sluk: Fuads gamle link giver intet');
check((await kvit(nyFuad)).map(x => x.chauffor).join() === 'Fuad' && (await ture(nyFuad)).length === 1, 'EFTER sluk: Fuads nye link virker');
check((await q(`select token from satser where chauffor = 'Fuad'`))[0].token === nyFuad && (await q(`select count(*)::int n from chauffor_tokens`))[0].n === 0, 'Den nye kode er nu Fuads faste (satser.token); tabellen med nye links er tom');
check(await fejlVed(medNavn(S('5_chauffoer_sluk_gammel_kode'), 'Fuad')) !== null, 'Trin 5 igen: stopper (intet nyt link at slukke for)');
check((await kvit('gammel-adan')).length === 1, 'Adans gamle link virker stadig (kun Fuad er skiftet)');
// Tilbageføring
e = await fejlVed(medNavn(T_CH_TILBAGE, 'Fuad'));
check(!e && (await kvit('gammel-fuad')).length === 1 && (await kvit(nyFuad)).length === 1, 'Tilbageføring (Fuad): det gamle link virker igen, det nye også');
check((await kvit('gammel-adan')).length === 1, 'Tilbageføring (Fuad) rører ikke Adan');
await db.exec(medNavn(S('5_chauffoer_sluk_gammel_kode'), 'Fuad'));
check((await kvit('gammel-fuad')).length === 0, 'Fuads gamle link slukket igen');

// Abdikarin havde ingen token: får et nyt, og 'alle' kan tilbageføre
await db.exec(medNavn(S('4_chauffoer_opret_ny_kode'), 'Abdikarin'));
const nyAbd = (await q(`select token from chauffor_tokens where chauffor = 'Abdikarin'`))[0].token;
await db.exec(medNavn(S('5_chauffoer_sluk_gammel_kode'), 'Abdikarin'));
check((await q(`select token from satser where chauffor = 'Abdikarin'`))[0].token === nyAbd, 'Chauffør uden tidligere token kan få et (Abdikarin)');
await db.exec(medNavn(S('4_chauffoer_opret_ny_kode'), 'Adan'));
await db.exec(medNavn(S('5_chauffoer_sluk_gammel_kode'), 'Adan'));
check((await kvit('gammel-adan')).length === 0, 'Adans gamle link slukket');
e = await fejlVed(medNavn(T_CH_TILBAGE, 'alle'));
check(!e && (await kvit('gammel-adan')).length === 1 && (await kvit('gammel-fuad')).length === 1 && (await kvit(nyFuad)).length === 1, "Tilbageføring 'alle': gamle links virker igen for Adan og Fuad, de nye også");
check(await fejlVed(medNavn(T_CH_TILBAGE, 'Findes ikke')) !== null, 'Tilbageføring for ukendt navn stopper');

// Migrationens tilbageføring: stopper, så længe der er to ejer-koder
check(await fejlVed(MIG_TILBAGE) === null, 'Migrationens tilbageføring kører, når der kun er én ejer-kode');
await db.exec(MIG);
await db.exec(T_EJER_TILBAGE);   // to ejer-koder igen
e = await fejlVed(MIG_TILBAGE);
check(e !== null && /to ejer-koder/.test(e) && (await q(`select count(*)::int n from config where n = 'owner_token'`))[0].n === 2 && (await alle('gammel-ejer')).length === 2, 'Migrationens tilbageføring stopper uden at ændre noget, når der er to ejer-koder');
await db.exec(S('3_ejer_sluk_gammel_kode'));
e = await fejlVed(MIG_TILBAGE);
check(!e && (await kvit('gammel-fuad')).length === 1 && (await ture('gammel-adan')).length === 1 && (await ture(nyEjer)).length === 2, 'Migrationens tilbageføring: gamle funktioner gendannet; gamle links og den nye ejer-kode virker');
check((await q(`select conname from pg_constraint where conrelid = 'public.config'::regclass and contype in ('p','u')`)).map(x => x.conname).join() === 'config_pkey', 'Migrationens tilbageføring: primærnøglen på config(n) er gendannet');
await db.exec(MIG);

// ---- Løn urørt ----
check(JSON.stringify(await q(`select * from v_lonseddel order by 1, 2`)) === lonFoer && JSON.stringify(await q(`select * from v_afregning order by 1, 2`)) === afrFoer, 'Lønsedler og afregning er uændrede gennem hele forløbet');
check(JSON.stringify(await q(`select chauffor, sats1, graense, sats2, del_med_kone from satser order by 1`)) === satserUdenToken, 'Satser (uden tokens) er uændrede');

// ---- Ingen token i scripts/dokumenter ----
const tekster = ['tokens/00_foerstetjek.sql', 'pending/20260930120000_chauffor_tokens.sql', 'tokens/0_sikkerhedskopi_gamle_tokens.sql', 'tokens/1_ejer_opret_ny_kode.sql', 'tokens/2a_hent_ejer_link.sql', 'tokens/3_ejer_sluk_gammel_kode.sql',
  'tokens/4_chauffoer_opret_ny_kode.sql', 'tokens/4a_hent_chauffoer_link.sql', 'tokens/5_chauffoer_sluk_gammel_kode.sql', 'tilbagefoering/20260930_tilbage_ejer_kode.sql', 'tilbagefoering/20260930_tilbage_chauffoer_koder.sql'].map(fil).join('\n');
check(!/[0-9a-f]{32}/.test(tekster), 'Ingen token-lignende tekst (32+ hex-tegn) i nogen af scriptsene');
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
