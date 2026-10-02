-- KONTROL AF MÅNEDEN — KUN LÆSNING (ét select, ændrer intet). Samme kontroller som dashboardets "Kontrol af måneden"
-- (site/kontroller.js), så tallene kan sammenlignes. Ret måneden i første linje (regnskabsmåned, 28.–27.).
--   1 nr_flere_chauffoerer   samme nr i samme række (bil) hos forskellige chauffører
--   2 nr_er_vdt              nummer i 2200–2399 uden nogen vagt inden for 50 numre = VDT(Tk)-tallet fra bonen læst som slutrapport-nr (fx 2285, 2303)
--   2b nr_uden_for_omraade   nummer uden nogen anden vagt inden for 50 numre (hos nogen chauffør), eller ikke et firecifret tal
--   3 overlap                to vagter overlapper, hos samme chauffør eller i samme bil (samme nr i samme bil er en dublet, punkt 1)
--   4 samme_dato_beloeb      samme dato og samme indkørt (> 0)
--   5 stor_difference        indkørt − overført ≥ 500 kr, eller ≥ 100 kr og ≥ 20 % af indkørt
--   6 vagtlaengde            vagt kortere end 3 t eller længere end 16 t (slut før start = næste døgn)
--   7 hul_i_raekken          numre mangler mellem to vagter i samme række (rapporteres i måneden efter hullet)
-- BILEN/RÆKKEN findes ud fra NABOER: to numre er i samme række, når de højst er 50 fra hinanden (kæde af naboer). Der bruges ingen faste 100-blokke.
-- Nabomånederne bruges kun som sammenligning (vagter og numre ved månedsskiftet). Fund hører til den valgte måned.
with valg as (select '2026-09'::text as maaned),     -- ← RET KUN DENNE LINJE
p as (select 500 as stor_diff_kr, 0.2 as stor_diff_pct, 100 as stor_diff_min_kr, 180 as vagt_min_min, 960 as vagt_max_min, 5 as overlap_tol_min,
             50 as nr_afstand, 2200 as vdt_fra, 2399 as vdt_til),
mdr as (
  select to_char(x.d - interval '1 month', 'YYYY-MM') as foer, v.maaned, to_char(x.d + interval '1 month', 'YYYY-MM') as efter
  from valg v, lateral (select to_date(v.maaned || '-01', 'YYYY-MM-DD') as d) x
),
r as (
  select v.id::text as id, v.dato, btrim(v.slutrapport_nr) as nr, v.chauffor, lower(btrim(v.chauffor)) as ch,
         v.indkort, v.overfort, v.regnskabsmaaned as maaned, (v.regnskabsmaaned = (select maaned from valg)) as valgt,
         case when btrim(v.slutrapport_nr) ~ '^[0-9]{4}$' then btrim(v.slutrapport_nr)::int end as nr_tal,
         case when btrim(v.vagt_start) ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' and btrim(v.vagt_slut) ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then
           (v.dato - date '1970-01-01') * 1440 + extract(hour from btrim(v.vagt_start)::time)::int * 60 + extract(minute from btrim(v.vagt_start)::time)::int end as s_min,
         case when btrim(v.vagt_start) ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' and btrim(v.vagt_slut) ~ '^([01]?[0-9]|2[0-3]):[0-5][0-9]$' then
           (v.dato - date '1970-01-01') * 1440 + extract(hour from btrim(v.vagt_slut)::time)::int * 60 + extract(minute from btrim(v.vagt_slut)::time)::int
           + case when btrim(v.vagt_slut)::time < btrim(v.vagt_start)::time then 1440 else 0 end end as e_min
  from v_data v
  where v.regnskabsmaaned in (select foer from mdr union all select maaned from mdr union all select efter from mdr)
),
tal as (select distinct nr_tal from r where nr_tal is not null),
s0 as (select nr_tal, lag(nr_tal) over (order by nr_tal) as forrige from tal),
s as (
  select nr_tal, sum(case when forrige is null or nr_tal - forrige > (select nr_afstand from p) then 1 else 0 end) over (order by nr_tal) as serie
  from s0
),
sz as (select nr_tal, serie, count(*) over (partition by serie) as antal_i_serie from s),
t as (
  select r.*, case when sz.serie is not null then 'række ' || sz.serie end as bil, sz.antal_i_serie,
         coalesce('række ' || sz.serie, 'ukendt') || '|' || r.nr as gruppe
  from r left join sz on sz.nr_tal = r.nr_tal
),
f1 as (
  select 'nr_flere_chauffoerer'::text as type,
         'nr_flere_chauffoerer|' || string_agg(id, ',' order by id collate "C") as identitet,
         'nr ' || min(nr) || ' (' || coalesce(min(bil), 'ukendt række') || ') hos ' || string_agg(distinct chauffor, ' og ') as hvad
  from t group by gruppe having count(distinct ch) > 1 and bool_or(valgt)
),
f2 as (
  select 'nr_er_vdt', 'nr_er_vdt|' || id, 'nr ' || nr || ' (' || chauffor || ', ' || dato || ') ligner VDT(Tk)-tallet'
  from t, p where valgt and nr_tal between p.vdt_fra and p.vdt_til and antal_i_serie = 1
),
f2b as (
  select 'nr_uden_for_omraade', 'nr_uden_for_omraade|' || id, 'nr ' || coalesce(nullif(nr, ''), '(tomt)') || ' (' || chauffor || ', ' || dato || ')'
  from t, p
  where valgt and (nr_tal is null or (antal_i_serie = 1 and not (nr_tal between p.vdt_fra and p.vdt_til)))
),
f3 as (
  select 'overlap', 'overlap|' || x.id || ',' || y.id,
         x.chauffor || ' nr ' || x.nr || ' og ' || y.chauffor || ' nr ' || y.nr || ' overlapper ' || (least(x.e_min, y.e_min) - greatest(x.s_min, y.s_min)) || ' min'
  from t x join t y on x.id collate "C" < y.id and x.s_min is not null and y.s_min is not null
   and (x.valgt or y.valgt) and x.gruppe <> y.gruppe
   and (x.ch = y.ch or (x.bil is not null and x.bil = y.bil))
  where least(x.e_min, y.e_min) - greatest(x.s_min, y.s_min) > (select overlap_tol_min from p)
),
f4 as (
  select 'samme_dato_beloeb', 'samme_dato_beloeb|' || string_agg(id, ',' order by id collate "C"),
         count(*) || ' vagter den ' || dato || ' med indkørt ' || indkort
  from t where indkort > 0 group by dato, indkort having count(*) > 1 and bool_or(valgt)
),
f5 as (
  select 'stor_difference', 'stor_difference|' || id, chauffor || ' nr ' || nr || ': indkørt ' || indkort || ' − overført ' || overfort || ' = ' || (indkort - overfort)
  from t, p
  where valgt and indkort is not null and overfort is not null
    and (abs(indkort - overfort) >= p.stor_diff_kr
         or (abs(indkort - overfort) >= p.stor_diff_min_kr and indkort > 0 and abs(indkort - overfort) / indkort >= p.stor_diff_pct))
),
f6 as (
  select 'vagtlaengde', 'vagtlaengde|' || id, chauffor || ' nr ' || nr || ': ' || (e_min - s_min) || ' min'
  from t, p
  where valgt and s_min is not null and (e_min - s_min < p.vagt_min_min or e_min - s_min > p.vagt_max_min)
),
n as (
  select distinct on (bil, nr_tal) bil, nr_tal, id, valgt
  from t where bil is not null and nr_tal is not null
  order by bil, nr_tal, id collate "C"
),
g as (select bil, nr_tal, valgt, lag(nr_tal) over (partition by bil order by nr_tal) as forrige from n),
f7 as (
  select 'hul_i_raekken', 'hul_i_raekken|' || forrige || '|' || nr_tal, bil || ': ' || (nr_tal - forrige - 1) || ' numre mangler mellem ' || forrige || ' og ' || nr_tal
  from g, p where forrige is not null and nr_tal - forrige > 1 and nr_tal - forrige <= p.nr_afstand and valgt
)
select * from (
  select * from f1 union all select * from f2 union all select * from f2b union all select * from f3 union all select * from f4
  union all select * from f5 union all select * from f6 union all select * from f7
) alle(type, identitet, hvad)
order by type, identitet;
