-- Punkt 0.5, forespørgsel 3 af 3. KUN LÆSNING (ét select, ændrer intet).
-- Rækker i 2026-08 og 2026-09, hvor den gemte kontant IKKE er lig med afregn (indkørt − overført − bro),
-- eller hvor indkørt/overført/bro mangler. Det er disse rækker, der flytter lønnen.
select v.regnskabsmaaned                      as maaned,
       v.chauffor,
       v.dato,
       v.slutrapport_nr                       as nr,
       v.indkort,
       v.overfort,
       v.bro_faerge                           as bro,
       v.kontant                              as kontant_gemt,
       round(v.indkort - v.overfort - coalesce(v.bro_faerge, 0), 2) as afregn,
       round(v.kontant - (v.indkort - v.overfort - coalesce(v.bro_faerge, 0)), 2) as kontant_minus_afregn,
       v.bekraeftet
from v_data v
where v.regnskabsmaaned in ('2026-08', '2026-09')
  and ( v.indkort is null or v.overfort is null or v.bro_faerge is null or v.kontant is null
        or abs(v.kontant - (v.indkort - v.overfort - coalesce(v.bro_faerge, 0))) > 0.005 )
order by v.regnskabsmaaned, v.chauffor, v.dato, v.slutrapport_nr;
