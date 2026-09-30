// Punkt 0.5: de tre læseforespørgsler i supabase/forespoergsler/ (FØR/EFTER for kontant = afregn).
// De er kun-læsning; her afprøves de på kendte tal, der er regnet efter i hånden.
import { readFileSync } from 'fs';
import { bygFraMigrationer } from '../hjaelpere/skema.mjs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };
const Q = n => readFileSync(new URL(`../../supabase/forespoergsler/${n}.sql`, import.meta.url), 'utf8');
const Q1 = Q('punkt_0_5_1_maaned_pr_chauffoer'), Q2 = Q('punkt_0_5_2_qaalid_halvdele'), Q3 = Q('punkt_0_5_3_raekker_kontant_ikke_afregn');

// Kun læsning: ét select, ingen skrive-kommandoer
for (const [navn, sql] of [['1', Q1], ['2', Q2], ['3', Q3]]) {
  const uden = sql.replace(/--.*$/gm, '');
  check(!/\b(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(uden) && uden.trim().split(';').filter(x => x.trim()).length === 1,
    `Forespørgsel ${navn}: ét select, ingen skrive-kommandoer`);
}

const { db, fejl } = await bygFraMigrationer();
check(!fejl, 'Kæden bygger' + (fejl ? ': ' + fejl.besked : ''));
const q = async (s, p = []) => (await db.query(s, p)).rows;
await db.exec(`
  insert into satser values ('Fuad', 0.5, 10000000, 0.5, false, 'tok-f'), ('Qaalid', 0.48, 10000000, 0.48, true, 'tok-q'), ('Adan', 0.48, 50000, 0.4, false, 'tok-a');
  insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort, bro_faerge, kontant) values
    ('2026-09-10', '1601', 'Fuad',   1000,  900,  0,  0),
    ('2026-09-11', '1602', 'Fuad',   2000, 1900, 50, 30),
    ('2026-09-12', '1801', 'Qaalid', 3440, 3376,  0,  0),
    ('2026-09-13', '1802', 'Qaalid', 5000, 4900, 40, 60),
    ('2026-08-15', '1101', 'Adan',   2000, 2000,  0,  0),
    ('2026-09-14', '1102', 'Adan',   2500, 2500,  0,  0),
    ('2026-10-05', '1103', 'Adan',   9999, 1, 0, 0);
`);
const lonFoer = JSON.stringify(await q(`select * from v_lonseddel order by 1, 2`));
const dataFoer = JSON.stringify(await q(`select * from slutrapporter order by slutrapport_nr`));

// ---- Forespørgsel 1 ----
const r1 = await q(Q1);
const f1 = r1.find(r => r.chauffor === 'Fuad' && r.maaned === '2026-09');
check(r1.length === 4 && r1.every(r => ['2026-08', '2026-09'].includes(r.maaned)), 'Q1: én række pr. chauffør og måned, kun 2026-08 og 2026-09 (4 rækker)');
check(Number(f1.indkort) === 3000 && Number(f1.overfort) === 2800 && Number(f1.bro) === 50 && Number(f1.andel) === 1500, 'Q1 Fuad: indkørt 3000, overført 2800, bro 50, andel 1500');
check(Number(f1.kontant_foer) === 30 && Number(f1.kontant_efter) === 150, 'Q1 Fuad: kontant FØR 30 -> EFTER 150 (3000 − 2800 − 50)');
check(Number(f1.udbetaling_foer) === 1420 && Number(f1.udbetaling_efter) === 1350 && Number(f1.forskel) === -70, 'Q1 Fuad: udbetaling FØR 1420 -> EFTER 1350, forskel −70');
check(Number(f1.forventet_forskel_fra_kontant) === -70 && f1.ikke_kontant === 'nej', 'Q1 Fuad: forskellen skyldes kun kontant-ændringen (forventet −70, flag "nej")');
const q1 = r1.find(r => r.chauffor === 'Qaalid');
check(Number(q1.andel) === 4051.2 && Number(q1.udbetaling_foer) === 3951.2 && Number(q1.udbetaling_efter) === 3927.2, 'Q1 Qaalid: andel 4.051,20, udbetaling FØR 3.951,20 -> EFTER 3.927,20');
const a8 = r1.find(r => r.chauffor === 'Adan' && r.maaned === '2026-08'), a9 = r1.find(r => r.chauffor === 'Adan' && r.maaned === '2026-09');
check(a8 && a9 && Number(a8.forskel) === 0 && Number(a9.forskel) === 0, 'Q1 Adan (rækker hvor kontant = afregn = 0): ingen forskel i begge måneder');
check(!r1.some(r => r.chauffor === 'Adan' && r.maaned === '2026-10'), 'Q1: 2026-10 er ikke med');

// Flag for "ikke kontant": en lønseddel, der afviger andet end kontant (simuleret ved at forskyde andelen i en kopi af viewet)
await db.exec(`create view lon_afvigende as select * from v_lonseddel`);
await db.exec(`create or replace view lon_afvigende as select chauffor, regnskabsmaaned, antal_ture, indkort_i_alt, overfort_i_alt, afregn_difference,
  kontant_i_alt, bro_faerge_i_alt, model, andel_brutto + case when chauffor = 'Adan' then 1 else 0 end as andel_brutto,
  andel_op_til_graensen, andel_over_graensen, heraf_chauffor_halvdel, heraf_kone_halvdel, kontant_pr_person,
  til_udbetaling + case when chauffor = 'Adan' then 1 else 0 end as til_udbetaling from v_lonseddel`);
const rAfv = await q(Q1.replace(/v_lonseddel/g, 'lon_afvigende'));
check(rAfv.filter(r => r.ikke_kontant.startsWith('JA')).map(r => r.chauffor).sort().join() === 'Adan,Adan' && rAfv.filter(r => r.ikke_kontant === 'nej').length === 2,
  'Q1: flaget "JA — ikke kun kontant" slår til, når andelen afviger (kun de to Adan-rækker), og ikke ellers');

// ---- Forespørgsel 2 ----
const r2 = await q(Q2);
check(r2.length === 1 && r2[0].chauffor === 'Qaalid' && r2[0].maaned === '2026-09', 'Q2: kun chauffører med del_med_kone (Qaalid), 2026-09');
const x = r2[0];
check(Number(x.andel_i_alt) === 4051.2 && Number(x.halvdel_chauffoer) === 2025.6 && Number(x.halvdel_kone) === 2025.6, 'Q2: andel 4.051,20 delt i to halvdele à 2.025,60');
check(Number(x.kontant_foer_i_alt) === 60 && Number(x.kontant_pr_person_foer) === 30 && Number(x.kontant_efter_i_alt) === 124 && Number(x.kontant_pr_person_efter) === 62,
  'Q2: kontant i alt 60 -> 124; pr. person 30 -> 62');
check(Number(x.bro_pr_person) === 20 && Number(x.udbetaling_pr_person_foer) === 1975.6 && Number(x.udbetaling_pr_person_efter) === 1963.6, 'Q2: bro pr. person 20; udbetaling pr. person 1.975,60 -> 1.963,60');
check(Number(x.udbetaling_i_alt_foer) === 3951.2 && Number(x.udbetaling_i_alt_efter) === 3927.2 && Math.abs(2 * Number(x.udbetaling_pr_person_efter) - Number(x.udbetaling_i_alt_efter)) < 0.005, 'Q2: to halvdele giver i alt 3.927,20 (samme som Q1)');

// ---- Forespørgsel 3 ----
const r3 = await q(Q3);
check(r3.map(r => r.nr).sort().join() === '1601,1602,1801', 'Q3: præcis de rækker, hvor gemt kontant ≠ afregn (1601, 1602, 1801); 1802 (kontant = afregn = 60), Adans og 2026-10 er ikke med');
const n1602 = r3.find(r => r.nr === '1602');
check(Number(n1602.kontant_gemt) === 30 && Number(n1602.afregn) === 50 && Number(n1602.kontant_minus_afregn) === -20, 'Q3 nr 1602: gemt kontant 30, afregn 50, forskel −20');
await db.exec(`insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort, bro_faerge, kontant) values ('2026-09-15', '1603', 'Fuad', 500, null, 0, 0)`);
check((await q(Q3)).some(r => r.nr === '1603'), 'Q3: en række uden overført vises (mangler tal)');
const r1b = (await q(Q1)).find(r => r.chauffor === 'Fuad' && r.maaned === '2026-09');
check(Number(r1b.mangler_tal) === 1, 'Q1: mangler_tal tæller rækken uden overført');

// Intet ændret af forespørgslerne
await db.exec(`delete from slutrapporter where slutrapport_nr = '1603'`);
check(JSON.stringify(await q(`select * from v_lonseddel order by 1, 2`)) === lonFoer && JSON.stringify(await q(`select * from slutrapporter order by slutrapport_nr`)) === dataFoer, 'Forespørgslerne har ikke ændret lønsedler eller data');
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
