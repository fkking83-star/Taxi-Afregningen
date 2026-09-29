// Migrationen supabase/migrations/20260929130000_aendringslog.sql (kørt live 29/9-2026). Kæden bygges op til
// migrationen før, og den køres derefter oven på testdata:
// "Ret" og "Udfyld og godkend" logges (før/efter, hvem, hvornår), og ændringer kan fortrydes sikkert.
import { readFileSync } from 'fs';
import { bygFraMigrationer } from '../hjaelpere/skema.mjs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const FORSLAG = readFileSync(new URL('../../supabase/migrations/20260929130000_aendringslog.sql', import.meta.url), 'utf8');
const SIKKERHED = readFileSync(new URL('../../supabase/pending/20260929100000_luk_direkte_adgang.sql', import.meta.url), 'utf8');

const { db, fejl } = await bygFraMigrationer({ til: '20260929120000_fejlkort_raa_data_dublet.sql' });
check(!fejl, 'Kæden bygger' + (fejl ? ': ' + fejl.besked : ''));
const q = async (s, p = []) => (await db.query(s, p)).rows;
const fejlTekst = async (s, p = []) => { try { await q(s, p); return null; } catch (e) { return e.message; } };
await db.exec(`
  alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;   -- som i Supabase
  insert into config values ('owner_token', 'ejer');
  insert into satser values ('Qaalid', 0.48, 10000000, 0.48, true, 'tok-q'), ('Adan', 0.48, 50000, 0.4, false, 'tok-a');
  insert into slutrapporter (id, dato, slutrapport_nr, chauffor, indkort, overfort, kontant, bro_faerge, vagt_start, vagt_slut) values
    ('00000000-0000-0000-0000-00000000000a', '2026-09-22', '1860', 'Qaalid', 3440, 3376, 0, 0, '16:02', '06:41'),
    ('00000000-0000-0000-0000-00000000000b', '2026-09-23', '1114', 'Adan', 2000, 2000, 0, 0, '06:00', '14:00'),
    ('00000000-0000-0000-0000-00000000000c', '2026-09-24', '1115', 'Adan', 1500, 1500, 0, 0, '06:00', '14:00');
  insert into fejlede_uploads (id, chauffor, driver_id, fejl_besked) values ('00000000-0000-0000-0000-0000000000f1', 'Qaalid', 'qaalid', 'x');
`);
const A = '00000000-0000-0000-0000-00000000000a', B = '00000000-0000-0000-0000-00000000000b', F1 = '00000000-0000-0000-0000-0000000000f1';
const lon = async () => JSON.stringify(await q(`select chauffor, regnskabsmaaned, antal_ture, indkort_i_alt, til_udbetaling from v_lonseddel order by 1, 2`));
const raekke = async id => (await q(`select dato::text, slutrapport_nr, indkort::float, overfort::float, kontant::float, bro_faerge::float from slutrapporter where id = $1`, [id]))[0];
const ret = (id, felter) => q(`select ret_slutrapport('ejer', $1, $2, $3, $4, $5, $6, $7)`,
  [id, felter.dato ?? null, felter.ind ?? null, felter.ovf ?? null, felter.kon ?? null, felter.bro ?? null, felter.nr ?? null]);
const log = () => q(`select * from hent_aendringer('ejer') order by id`);
const fortryd = id => fejlTekst(`select fortryd_aendring('ejer', $1)`, [id]);

const lonFoer = await lon(), raekkeFoer = await raekke(A);
let kfejl = null; try { await db.exec(FORSLAG); } catch (e) { kfejl = e.message; }
check(!kfejl, 'Forslaget kører uden fejl' + (kfejl ? ': ' + kfejl : ''));
check(await lon() === lonFoer, 'Lønsedlerne er uændrede efter migrationen');

// --- Ret logges ---
await ret(A, { ind: 3450, nr: '1861' });
let l = await log();
check(l.length === 1 && l[0].handling === 'ret' && l[0].hvem === 'ejer (dashboard)' && l[0].tidspunkt, 'Ret: én log-række med handling, hvem og tidspunkt');
check(Number(l[0].foer.indkort) === 3440 && l[0].foer.slutrapport_nr === '1860' && Number(l[0].efter.indkort) === 3450 && l[0].efter.slutrapport_nr === '1861',
  'Ret: før (3440, nr 1860) og efter (3450, nr 1861) er gemt');
check(l[0].kan_fortrydes === true, 'Ret: kan fortrydes');
const lonEfterRet = await lon();
check(lonEfterRet !== lonFoer, `Ret ændrer lønsedlen som før (FØR ${JSON.parse(lonFoer).find(r => r.chauffor === 'Qaalid').til_udbetaling}, EFTER ${JSON.parse(lonEfterRet).find(r => r.chauffor === 'Qaalid').til_udbetaling})`);
await ret(A, {});
check((await log()).length === 1, 'Ret uden ændring (alle felter tomme): ingen log-række');
await q(`select ret_slutrapport('forkert', $1, null, 1, null, null, null, null)`, [A]);
check((await log()).length === 1 && (await raekke(A)).indkort === 3450, 'Forkert ejer-kode: intet ændret, intet logget (som før)');
await q(`select saet_bekraeftet('ejer', $1, true)`, [A]);
check((await log())[0].kan_fortrydes === true, 'Bekræftet-fluebenet blokerer ikke for fortryd');

// --- Fortryd Ret ---
check(await fortryd(l[0].id) === null, 'Fortryd Ret: lykkes');
check(JSON.stringify(await raekke(A)) === JSON.stringify(raekkeFoer), 'Fortryd Ret: rækken er som før (3440, nr 1860)');
check(await lon() === lonFoer, 'Fortryd Ret: lønsedlerne er tilbage på FØR-tallene');
l = await log();
check(l.length === 2 && l[1].handling === 'fortryd' && l[0].fortrudt_tid && !l[0].kan_fortrydes && !l[1].kan_fortrydes, 'Fortrydelsen logges; den oprindelige ændring er markeret som fortrudt');
check(await fortryd(l[0].id) === 'Ændringen er allerede fortrudt', 'Samme ændring kan ikke fortrydes to gange');
check(await fortryd(l[1].id) === 'Kun "Ret" og "Udfyld og godkend" kan fortrydes', 'En fortrydelse kan ikke selv fortrydes');

// --- To ændringer i træk: nyeste først ---
await ret(B, { ind: 2100 }); await ret(B, { ovf: 1900 });
l = (await log()).filter(x => x.slutrapport_id === B);
check(!l[0].kan_fortrydes && l[1].kan_fortrydes, 'To Ret i træk: kun den nyeste kan fortrydes');
check(await fortryd(l[0].id) === 'Rækken er ændret siden — fortryd den nyeste ændring først', 'Den ældste afvises med tydelig besked');
check(await fortryd(l[1].id) === null && await fortryd(l[0].id) === null, 'Nyeste og derefter ældste fortrydes');
const b = await raekke(B);
check(b.indkort === 2000 && b.overfort === 2000, 'Rækken er tilbage til udgangspunktet');

// --- Fortryd kan ikke genbruge et nummer, der er taget ---
await ret(B, { nr: '1116' });
const idNr = (await log()).at(-1).id;
await q(`insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort) values ('2026-09-25', '1114', 'Adan', 10, 10)`);
check(await fortryd(idNr) === 'Kan ikke fortryde: rapport nr 1114 bruges nu af en anden række for Adan', 'Fortryd, hvor det gamle nr nu er taget: afvises med forklaring, intet ændret');
check((await raekke(B)).slutrapport_nr === '1116', 'Rækken står urørt tilbage');
await db.exec(`delete from slutrapporter where slutrapport_nr = '1114' and indkort = 10`);

// --- Udfyld og godkend logges og kan fortrydes ---
const lonFoerOpret = await lon();
const nyId = (await q(`select opret_slutrapport('ejer', $1, 'qaalid', '1870', '2026-09-26', '16:00', '06:00', 3000, 2900) id`, [F1]))[0].id;
l = (await log()).filter(x => x.slutrapport_id === nyId);
check(l.length === 1 && l[0].handling === 'opret' && l[0].foer === null && Number(l[0].efter.indkort) === 3000 && l[0].kan_fortrydes, 'Udfyld og godkend: logget (efter = den nye række), kan fortrydes');
check(await fortryd(l[0].id) === null, 'Fortryd Udfyld og godkend: lykkes');
check((await q(`select count(*)::int n from slutrapporter where id = $1`, [nyId]))[0].n === 0, 'Rækken er slettet igen');
check((await q(`select status from fejlede_uploads where id = $1`, [F1]))[0].status === 'ny', 'Fejlkortet er tilbage (status ny)');
check(await lon() === lonFoerOpret, 'Lønsedlerne er som før godkendelsen');
// Fejlkortet kan godkendes igen; en efterfølgende Ret blokerer fortryd af oprettelsen
const nyId2 = (await q(`select opret_slutrapport('ejer', $1, 'Qaalid', '1870', '2026-09-26', null, null, 3000, 2900) id`, [F1]))[0].id;
await ret(nyId2, { ind: 3100 });
l = (await log()).filter(x => x.slutrapport_id === nyId2);
check(await fortryd(l[0].id) === 'Rækken er ændret siden — fortryd den nyeste ændring først', 'Oprettelse, der er rettet bagefter: fortryd Ret først');
check((await q(`select count(*)::int n from slutrapporter where id = $1`, [nyId2]))[0].n === 1, 'Rækken er ikke slettet');

// --- Uændret adfærd i øvrigt ---
const d = await fejlTekst(`select opret_slutrapport('ejer', $1, 'Qaalid', '1860', '2026-09-22', null, null, 1, 1)`, [F1]);
check(d === 'Fejl-rækken er allerede godkendt', 'opret_slutrapport afviser stadig en godkendt fejl-række');
await q(`update fejlede_uploads set status = 'ny' where id = $1`, [F1]);
check(await fejlTekst(`select opret_slutrapport('ejer', $1, 'Qaalid', '1860', '2026-09-22', null, null, 1, 1)`, [F1]) === 'Rapport nr 1860 findes allerede for Qaalid', 'Dublet-beskeden er som før');
const sig = await q(`select proname, pg_get_function_identity_arguments(p.oid) a, pg_get_function_result(p.oid) r from pg_proc p where proname in ('ret_slutrapport', 'opret_slutrapport') order by 1`);
check(sig.length === 2 && sig[0].r === 'uuid' && sig[1].r === 'void' && sig[1].a.endsWith('p_slutrapport_nr text'), 'ret_slutrapport og opret_slutrapport: samme signaturer og returtyper');
check(await fejlTekst(`select fortryd_aendring('forkert', 1)`) === 'Ugyldig ejer-kode' && (await q(`select * from hent_aendringer('forkert')`)).length === 0, 'Forkert ejer-kode: ingen log, ingen fortryd');

// --- Adgang som anon ---
const somAnon = async (sql) => { await db.exec('begin; set local role anon;'); try { const x = await q(sql); await db.exec('commit'); return x; } catch (e) { await db.exec('rollback'); return e.message; } };
let r = await somAnon(`select * from slutrapport_log`);
check(typeof r === 'string' && /permission denied/.test(r), 'Anon kan ikke læse logtabellen direkte (heller ikke før sikkerhedsforslaget)');
r = await somAnon(`select count(*) from hent_aendringer('ejer')`);
check(Array.isArray(r), 'Anon kan kalde hent_aendringer med ejer-kode');
let sfejl = null; try { await db.exec(SIKKERHED); } catch (e) { sfejl = e.message; }
check(!sfejl, 'Sikkerhedsforslaget kan køres bagefter' + (sfejl ? ': ' + sfejl : ''));
await ret(A, { kon: 5 });
r = await somAnon(`select fortryd_aendring('ejer', (select max(id) from hent_aendringer('ejer')))`);
check(Array.isArray(r) && (await raekke(A)).kontant === 0, 'Efter sikkerhedsforslaget: Ret og Fortryd virker stadig via funktionerne');

let igen = null; try { await db.exec(FORSLAG); } catch (e) { igen = e.message; }
check(!igen && (await log()).length > 5, 'Kan køres igen; loggen bevares');
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
