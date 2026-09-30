-- taxi_nr på gamle rækker, forespørgsel 2 af 2. KUN LÆSNING (ét select, ændrer intet).
-- Rækker, hvor slutrapport-nummeret ligger UDEN FOR de tre områder (11xx = 001-7144, 16xx = 001-8646, 18xx = 001-8208),
-- eller ikke er et firecifret tal. Disse får ikke automatisk taxi_nr, men rettes manuelt efter ejerens godkendelse.
-- naermeste_bil/afstand er kun et hint (hvor mange numre nummeret er fra det nærmeste område), ikke en beslutning.
with omraader(taxi_nr, fra, til) as (values ('001-7144', 1100, 1199), ('001-8646', 1600, 1699), ('001-8208', 1800, 1899)),
r as (
  select v.*, case when trim(v.slutrapport_nr) ~ '^[0-9]+$' then trim(v.slutrapport_nr)::numeric end as nr_tal
  from v_data v
)
select r.regnskabsmaaned                         as maaned,
       r.dato,
       r.chauffor,
       r.slutrapport_nr                          as nr,
       r.indkort,
       r.overfort,
       r.bekraeftet,
       n.taxi_nr                                 as naermeste_bil,
       n.afstand,
       case when r.nr_tal is null then 'nummeret er ikke et tal'
            when trim(r.slutrapport_nr) !~ '^[0-9]{4}$' then 'ikke firecifret' end as bemaerkning
from r
left join lateral (
  select o.taxi_nr, greatest(o.fra - r.nr_tal, r.nr_tal - o.til, 0) as afstand
  from omraader o where r.nr_tal is not null order by 2 limit 1
) n on true
where not exists (select 1 from omraader o
                  where trim(r.slutrapport_nr) ~ '^[0-9]{4}$' and r.nr_tal between o.fra and o.til)
order by r.dato, r.slutrapport_nr;
