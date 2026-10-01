-- taxi_nr, forespørgsel 4. KUN LÆSNING (ét select, ændrer intet). Bruges FØR trin 1.1 (taxi_nr findes endnu ikke som kolonne).
-- Viser alle par af rækker, hvor samme nummer står i samme bil (nummerområde: 11xx = 001-7144, 16xx = 001-8646, 18xx = 001-8208)
-- hos FORSKELLIGE chauffører, fx nr 1112 hos både Adan og Fuad. Mellemrum omkring nummeret ignoreres.
-- Den unikke nøgle (kilde, taxi_nr, slutrapport_nr) uden chauffør må ikke oprettes, før denne forespørgsel giver 0 rækker.
-- En række med sikkerhed = 'uden for områderne' har ingen kendt bil; samme nummer hos to chauffører dér er kun et hint og stopper ikke nøglen,
-- men bør alligevel ses efter.
with omraader(taxi_nr, fra, til) as (values ('001-7144', 1100, 1199), ('001-8646', 1600, 1699), ('001-8208', 1800, 1899)),
r as (
  select v.*, btrim(v.slutrapport_nr) as nr_t,
         case when btrim(v.slutrapport_nr) ~ '^[0-9]{4}$' then btrim(v.slutrapport_nr)::int end as nr_tal
  from v_data v
),
m as (
  select r.*, coalesce(o.taxi_nr, 'UDEN FOR OMRÅDERNE') as bil
  from r left join omraader o on r.nr_tal between o.fra and o.til
)
select m.bil                                   as bil,
       m.nr_t                                  as nr,
       m.chauffor,
       m.dato,
       m.regnskabsmaaned                       as maaned,
       m.indkort,
       m.overfort,
       m.bekraeftet,
       m.oprettet::date                        as oprettet,
       case when m.bil = 'UDEN FOR OMRÅDERNE' then 'uden for områderne (hint)' else 'i område (stopper nøglen)' end as sikkerhed
from m
where exists (select 1 from m m2
              where m2.bil = m.bil and m2.nr_t = m.nr_t and m2.chauffor is distinct from m.chauffor)
order by m.bil, m.nr_t, m.dato, m.chauffor;
