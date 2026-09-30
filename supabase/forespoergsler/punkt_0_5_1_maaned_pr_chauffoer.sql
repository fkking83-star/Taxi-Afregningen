-- Punkt 0.5, forespørgsel 1 af 3. KUN LÆSNING (ét select, ændrer intet).
-- FØR/EFTER pr. chauffør for 2026-08 og 2026-09.
--   FØR   = lønsedlen som den er i dag (v_lonseddel): udbetaling = andel − kontant − bro
--   EFTER = kontant = afregn = indkørt − overført − bro;  udbetaling = andel − afregn
-- EFTER regnes af de samme rækker (v_data) og de samme satser; andelen regnes på ny med lønsedlens formel.
-- ikke_kontant = JA, hvis noget andet end kontant-ændringen adskiller FØR og EFTER
--   (antal ture, indkørt, overført, bro eller andel afviger, eller udbetalingens forskel ikke er præcis kontant-ændringen).
-- mangler_tal = antal rækker, hvor indkørt, overført eller bro mangler (så afregn ikke kan regnes rigtigt).
with d as (
  select chauffor, regnskabsmaaned,
         count(*)                              as ture,
         sum(indkort)                          as indkort,
         sum(overfort)                         as overfort,
         coalesce(sum(bro_faerge), 0)          as bro,
         count(*) filter (where indkort is null or overfort is null or bro_faerge is null) as mangler_tal
  from v_data
  where regnskabsmaaned in ('2026-08', '2026-09')
  group by chauffor, regnskabsmaaned
),
e as (
  select d.*,
         round(least(d.indkort, s.graense) * s.sats1 + greatest(d.indkort - s.graense, 0) * s.sats2, 2) as andel,
         round(d.indkort - d.overfort - d.bro, 2) as afregn
  from d join satser s on s.chauffor = d.chauffor
)
select e.regnskabsmaaned                              as maaned,
       e.chauffor,
       e.ture,
       e.indkort,
       e.overfort,
       e.bro,
       e.andel,
       l.kontant_i_alt                                as kontant_foer,
       e.afregn                                       as kontant_efter,
       l.til_udbetaling                               as udbetaling_foer,
       round(e.andel - e.afregn, 2)                   as udbetaling_efter,
       round(e.andel - e.afregn - l.til_udbetaling, 2) as forskel,
       round(l.kontant_i_alt + e.bro - e.afregn, 2)   as forventet_forskel_fra_kontant,
       e.mangler_tal,
       case when l.antal_ture <> e.ture
              or l.indkort_i_alt <> round(e.indkort, 2)
              or l.overfort_i_alt <> round(e.overfort, 2)
              or l.bro_faerge_i_alt <> round(e.bro, 2)
              or l.andel_brutto <> e.andel
              or abs((e.andel - e.afregn - l.til_udbetaling) - (l.kontant_i_alt + e.bro - e.afregn)) > 0.005
            then 'JA — ikke kun kontant' else 'nej' end as ikke_kontant
from e
join v_lonseddel l on l.chauffor = e.chauffor and l.regnskabsmaaned = e.regnskabsmaaned
order by e.regnskabsmaaned, e.chauffor;
