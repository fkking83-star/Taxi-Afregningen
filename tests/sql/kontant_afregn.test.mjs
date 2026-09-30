// Punkt 0.5: supabase/migrations/20260930110000_kontant_er_afregn.sql (kørt live 30/9-2026) — lønsedlens kontant = afregn, udbetaling = andel − afregn.
// Kæden bygges til og med lukningen; migrationen køres derefter oven på testdata med de rigtige september-totaler.
import { readFileSync } from 'fs';
import { bygFraMigrationer } from '../hjaelpere/skema.mjs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const fil = p => readFileSync(new URL('../../supabase/' + p, import.meta.url), 'utf8');
const FORSLAG = fil('migrations/20260930110000_kontant_er_afregn.sql'), TILBAGE = fil('tilbagefoering/20260930110000_kontant_er_afregn.sql');

const { db, fejl } = await bygFraMigrationer({ til: '20260930100000_luk_direkte_adgang.sql' });
check(!fejl, 'Kæden bygger' + (fejl ? ': ' + fejl.besked : ''));
const q = async (s, p = []) => (await db.query(s, p)).rows;
await db.exec(`
  insert into config values ('owner_token', 'ejer');
  insert into satser values ('Adan', 0.48, 50000, 0.4, false, 'tok-adan'), ('Faysal', 0.5, 10000000, 0.5, false, 'tok-fay'),
    ('Fuad', 0.5, 10000000, 0.5, false, 'tok-fuad'), ('Qaalid', 0.48, 10000000, 0.48, true, 'tok-q'),
    ('Bro', 0.5, 10000000, 0.5, false, 'tok-bro');
  -- September 2026: de rigtige totaler pr. chauffør (Fuad uden den slettede dublet af 1112), som én række hver
  insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort, bro_faerge, kontant) values
    ('2026-09-10', '1101', 'Adan',   132780, 130922, 0, 0),
    ('2026-09-10', '1601', 'Faysal',  71902,  69927, 0, 0),
    ('2026-09-10', '1602', 'Fuad',    98340,  97352, 0, 0),
    ('2026-09-10', '1801', 'Qaalid', 111631, 108177, 0, 202),
    -- Bro > 0 og en række med negativ afregn: bro trækkes ikke fra en ekstra gang
    ('2026-09-11', '1901', 'Bro',      3000,   2800, 50, 30),
    ('2026-09-12', '1902', 'Bro',      1000,   1020,  0,  0)`);

const kol = async v => JSON.stringify(await q(`select column_name, data_type, ordinal_position from information_schema.columns where table_name = '${v}' order by ordinal_position`));
const lonFoer = await q(`select * from v_lonseddel order by 1, 2`), afrFoer = await q(`select * from v_afregning order by 1, 2`);
const kolLonFoer = await kol('v_lonseddel'), kolAfrFoer = await kol('v_afregning');
const dataFoer = JSON.stringify(await q(`select * from slutrapporter order by slutrapport_nr`)), satserFoer = JSON.stringify(await q(`select * from satser order by chauffor`));
const l = (rows, ch) => rows.find(r => r.chauffor === ch);
check(Number(l(lonFoer, 'Fuad').til_udbetaling) === 49170 && Number(l(lonFoer, 'Qaalid').til_udbetaling) === 53380.88, 'FØR: Fuad 49.170,00 og Qaalid 53.380,88 (som i dag)');

let e = null; try { await db.exec(FORSLAG); } catch (x) { e = x.message; }
check(!e, 'Forslaget kører uden fejl' + (e ? ': ' + e : ''));
const lon = await q(`select * from v_lonseddel order by 1, 2`), afr = await q(`select * from v_afregning order by 1, 2`);
check(await kol('v_lonseddel') === kolLonFoer && await kol('v_afregning') === kolAfrFoer, 'Kolonner, rækkefølge og typer er uændrede i v_lonseddel og v_afregning');

// EFTER: de godkendte september-tal
const forv = { Adan: [1858, 55254], Faysal: [1975, 33976], Fuad: [988, 48182], Qaalid: [3454, 50128.88] };
for (const [ch, [k, u]] of Object.entries(forv)) {
  const r = l(lon, ch);
  check(Number(r.kontant_i_alt) === k && Number(r.til_udbetaling) === u, `EFTER ${ch}: kontant ${k}, udbetaling ${u}`);
  const a = l(afr, ch);
  check(Number(a.kontant) === k && Number(a.til_udbetaling) === u, `v_afregning ${ch}: samme kontant og udbetaling`);
}
const q9 = l(lon, 'Qaalid');
check(Number(q9.heraf_chauffor_halvdel) === 26791.44 && Number(q9.heraf_kone_halvdel) === 26791.44 && Number(q9.kontant_pr_person) === 1727, 'Qaalid: halvdele à 26.791,44; kontant pr. person 1.727,00');
check(Math.abs(2 * (Number(q9.heraf_chauffor_halvdel) - Number(q9.kontant_pr_person)) - Number(q9.til_udbetaling)) < 0.005, 'Qaalid: to halvdele − kontant pr. person giver udbetalingen (25.064,44 pr. person)');
const br = l(lon, 'Bro');
check(Number(br.bro_faerge_i_alt) === 50 && Number(br.kontant_i_alt) === 130 && Number(br.afregn_difference) === 180 && Number(br.andel_brutto) === 2000 && Number(br.til_udbetaling) === 1870,
  'Bro 50 og negativ afregn: Difference 180 = Kontant 130 + Bro 50; udbetaling = 2.000 − 130 = 1.870 (bro trækkes ikke igen)');

// Alt andet end kontant og udbetaling er uændret
const ens = (a, b, udenom) => JSON.stringify(a.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !udenom.includes(k))))) === JSON.stringify(b.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !udenom.includes(k)))));
check(ens(lon, lonFoer, ['kontant_i_alt', 'kontant_pr_person', 'til_udbetaling']), 'v_lonseddel: alt andet end kontant, kontant pr. person og udbetaling er uændret (ture, indkørt, overført, difference, bro, model, andel, halvdele)');
check(ens(afr, afrFoer, ['kontant', 'til_udbetaling']), 'v_afregning: alt andet end kontant og udbetaling er uændret');
check(JSON.stringify(await q(`select * from slutrapporter order by slutrapport_nr`)) === dataFoer && JSON.stringify(await q(`select * from satser order by chauffor`)) === satserFoer, 'Data og satser er urørt');

// Siderne: RPC'erne som anon (efter lukningen)
const somAnon = async (sql) => { await db.exec('begin; set local role anon;'); try { const x = await q(sql); await db.exec('commit'); return x; } catch (x) { await db.exec('rollback'); return x.message; } };
let r = await somAnon(`select chauffor, kontant_i_alt, til_udbetaling from hent_alle('ejer', '2026-09') order by 1`);
check(Array.isArray(r) && r.length === 5 && Number(r.find(x => x.chauffor === 'Qaalid').til_udbetaling) === 50128.88, 'hent_alle (ejer) som anon giver de nye tal');
r = await somAnon(`select kontant_i_alt, til_udbetaling from hent_kvittering('tok-fuad', '2026-09')`);
check(Array.isArray(r) && r.length === 1 && Number(r[0].til_udbetaling) === 48182, 'hent_kvittering (Fuads token) giver 48.182,00');
r = await somAnon(`select * from v_lonseddel`);
check(typeof r === 'string' && /permission denied/.test(r), 'Anon kan stadig ikke læse v_lonseddel direkte (lukningen holder)');

// Gentagelse og tilbageføring
let e2 = null; try { await db.exec(FORSLAG); } catch (x) { e2 = x.message; }
check(!e2 && JSON.stringify(await q(`select * from v_lonseddel order by 1, 2`)) === JSON.stringify(lon), 'Kan køres igen uden ændring');
let e3 = null; try { await db.exec(TILBAGE); } catch (x) { e3 = x.message; }
check(!e3 && JSON.stringify(await q(`select * from v_lonseddel order by 1, 2`)) === JSON.stringify(lonFoer) && JSON.stringify(await q(`select * from v_afregning order by 1, 2`)) === JSON.stringify(afrFoer), 'Tilbageføring: lønsedler og afregning er præcis som FØR');
check(await kol('v_lonseddel') === kolLonFoer, 'Tilbageføring: kolonnerne er uændrede');
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
