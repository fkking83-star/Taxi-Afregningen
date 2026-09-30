-- taxi_nr på gamle rækker, forespørgsel 3. KUN LÆSNING (ét select, ændrer intet).
-- Rækker med PRÆCIS samme indkørt og overført, men forskelligt nummer eller dato. Det ser ud som samme bon læst to gange,
-- hvor OCR har forlæst nummer og/eller dato (fx 1635 -> 1035 og 2026 -> 2023). Gælder alle måneder og alle chauffører.
-- Dashboardets røde dublet-markering ser kun inden for samme måned og samme dato, så den finder ikke disse.
with g as (
  select indkort, overfort from v_data where indkort > 0 group by indkort, overfort having count(*) > 1
)
select v.indkort, v.overfort, v.dato, v.regnskabsmaaned as maaned, v.chauffor, v.slutrapport_nr as nr, v.bekraeftet, v.oprettet::date as oprettet
from v_data v
join g on g.indkort = v.indkort and g.overfort = v.overfort
order by v.indkort, v.overfort, v.dato;
