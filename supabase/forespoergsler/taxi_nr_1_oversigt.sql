-- taxi_nr på gamle rækker, forespørgsel 1 af 2. KUN LÆSNING (ét select, ændrer intet).
-- Forhåndsvisning: hvor mange rækker ville få hvilket taxi_nr, når bilen findes ud fra NUMMERET (11xx = 001-7144,
-- 16xx = 001-8646, 18xx = 001-8208), aldrig ud fra chaufføren. Rækker uden for områderne får INTET taxi_nr; de står i forespørgsel 2.
-- antal_chauffoerer viser, at alle kan køre alle biler.
with omraader(taxi_nr, fra, til) as (values ('001-7144', 1100, 1199), ('001-8646', 1600, 1699), ('001-8208', 1800, 1899)),
r as (
  select v.*, case when trim(v.slutrapport_nr) ~ '^[0-9]{4}$' then trim(v.slutrapport_nr)::int end as nr_tal
  from v_data v
)
select coalesce(o.taxi_nr, 'UDEN FOR OMRÅDERNE') as taxi_nr,
       count(*)                                  as antal_raekker,
       count(distinct r.chauffor)                as antal_chauffoerer,
       min(r.dato)                               as foerste_dato,
       max(r.dato)                               as sidste_dato
from r
left join omraader o on r.nr_tal between o.fra and o.til
group by coalesce(o.taxi_nr, 'UDEN FOR OMRÅDERNE')
order by 1;
