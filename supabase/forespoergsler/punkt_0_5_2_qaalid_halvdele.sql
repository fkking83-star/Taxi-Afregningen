-- Punkt 0.5, forespørgsel 2 af 3. KUN LÆSNING (ét select, ændrer intet).
-- Chauffører, der deler med kone (satser.del_med_kone, i dag Qaalid): halvdelene og kontant pr. person, FØR og EFTER.
-- Pr. person: udbetaling = halvdel − (afregn / 2).  FØR: halvdel − (kontant + bro) / 2.
with d as (
  select chauffor, regnskabsmaaned,
         sum(indkort)                 as indkort,
         sum(overfort)                as overfort,
         coalesce(sum(bro_faerge), 0) as bro
  from v_data
  where regnskabsmaaned in ('2026-08', '2026-09')
  group by chauffor, regnskabsmaaned
)
select l.regnskabsmaaned                                           as maaned,
       l.chauffor,
       l.andel_brutto                                              as andel_i_alt,
       l.heraf_chauffor_halvdel                                    as halvdel_chauffoer,
       l.heraf_kone_halvdel                                        as halvdel_kone,
       l.kontant_i_alt                                             as kontant_foer_i_alt,
       l.kontant_pr_person                                         as kontant_pr_person_foer,
       round(d.indkort - d.overfort - d.bro, 2)                    as kontant_efter_i_alt,
       round((d.indkort - d.overfort - d.bro) / 2, 2)              as kontant_pr_person_efter,
       round(d.bro / 2, 2)                                         as bro_pr_person,
       round(l.heraf_chauffor_halvdel - (l.kontant_i_alt + d.bro) / 2, 2)      as udbetaling_pr_person_foer,
       round(l.heraf_chauffor_halvdel - (d.indkort - d.overfort - d.bro) / 2, 2) as udbetaling_pr_person_efter,
       l.til_udbetaling                                            as udbetaling_i_alt_foer,
       round(l.andel_brutto - (d.indkort - d.overfort - d.bro), 2) as udbetaling_i_alt_efter
from v_lonseddel l
join d on d.chauffor = l.chauffor and d.regnskabsmaaned = l.regnskabsmaaned
join satser s on s.chauffor = l.chauffor and s.del_med_kone
where l.regnskabsmaaned in ('2026-08', '2026-09')
order by l.regnskabsmaaned, l.chauffor;
