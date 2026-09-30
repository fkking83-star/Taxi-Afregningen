-- Punkt 0.5, forespørgsel 5. KUN LÆSNING (ét select, ændrer intet).
-- Alle rækker for én chauffør i 2026-09 (ret navnet i første linje), med afregn og løbende sum af udbetaling EFTER,
-- så tallet kan sammenlignes bon for bon. Udbetaling EFTER = sum af (andel − afregn) pr. række, når satsen er ens (uden trappe).
with valg as (select 'Faysal'::text as navn)
select row_number() over (order by v.dato, v.slutrapport_nr)                     as nr_i_raekken,
       v.dato, v.slutrapport_nr as nr, v.indkort, v.overfort, v.bro_faerge as bro, v.kontant as kontant_gemt,
       round(v.indkort - v.overfort - coalesce(v.bro_faerge, 0), 2)              as afregn,
       round(v.indkort * s.sats1, 2)                                             as andel_paa_raekken,
       round(sum(v.indkort * s.sats1 - (v.indkort - v.overfort - coalesce(v.bro_faerge, 0)))
             over (order by v.dato, v.slutrapport_nr), 2)                        as loebende_udbetaling,
       v.bekraeftet
from v_data v
join satser s on s.chauffor = v.chauffor
where v.chauffor = (select navn from valg) and v.regnskabsmaaned = '2026-09'
order by v.dato, v.slutrapport_nr;
