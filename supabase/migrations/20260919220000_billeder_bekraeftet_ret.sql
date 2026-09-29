-- Fase 2: billeder + "bekræftet"-flueben + ret-formular.
-- Rent additiv: nye kolonner har standardværdier, eksisterende rækker/beregninger (v_afregning, v_lonseddel,
-- hent_alle, hent_kvittering) påvirkes ikke og er verificeret uændrede.
-- Bekræftet kørt og verificeret live i produktionsdatabasen (vehgabygvxnkrqsoazfs) 2026-09-20.

-- 1) Nye kolonner på slutrapporter
alter table slutrapporter add column if not exists billede_url text;
alter table slutrapporter add column if not exists bekraeftet boolean not null default false;

-- 2) Storage-bucket 'slutrapport-billeder' oprettes manuelt i Supabase Studio (Storage → New bucket, privat, ikke via SQL).

-- 3) v_data viderefører de to nye kolonner til alle aflæsninger (hent_ture, dashboard).
-- Live har billede_url og bekraeftet FØR regnskabsmaaned (tjekket 29/9-2026 med information_schema.columns).
-- Postgres kan ikke indsætte kolonner midt i et view med CREATE OR REPLACE ("cannot change name of view
-- column"), så v_data og det, der bygger på den, droppes og genskabes. v_lonseddel og v_afregning er kopieret
-- ordret fra baseline-migrationen. hent_alle og hent_kvittering er genskabt præcis som de står live 29/9-2026
-- (bemærk: live hent_kvittering matcher token uden trim(), baseline havde trim()). Alt er sammenlignet med live
-- (tests/sql/live_skema.test.mjs). v_lonseddel_pen genskabes ikke: den findes ikke live (29/9-2026).
-- Rettet 29/9-2026, så databasen kan bygges fra bunden. Live er upåvirket (filen er allerede kørt dér).
drop function if exists hent_alle(text, text);
drop function if exists hent_kvittering(text, text);
drop view if exists v_lonseddel_pen;
drop view if exists v_lonseddel;
drop view if exists v_afregning;
drop view if exists v_data;

create view v_data as
select id,
       dato,
       slutrapport_nr,
       chauffor,
       indkort,
       overfort,
       kontant,
       bro_faerge,
       vagt_start,
       vagt_slut,
       oprettet,
       billede_url,
       bekraeftet,
       to_char(
         case
           when extract(day from dato) >= 28 then (date_trunc('month', dato::timestamp with time zone) + interval '1 mon')::date
           else dato
         end::timestamp with time zone, 'YYYY-MM'
       ) as regnskabsmaaned
from slutrapporter s;

create or replace view "public"."v_lonseddel" as  WITH pr AS (
         SELECT d.chauffor,
            d.regnskabsmaaned,
            count(*) AS antal_ture,
            sum(d.indkort) AS indkort,
            sum(d.overfort) AS overfort,
            sum(d.kontant) AS kontant,
            sum(d.bro_faerge) AS bro_faerge
           FROM public.v_data d
          GROUP BY d.chauffor, d.regnskabsmaaned
        )
 SELECT pr.chauffor,
    pr.regnskabsmaaned,
    pr.antal_ture,
    round(pr.indkort, 2) AS indkort_i_alt,
    round(pr.overfort, 2) AS overfort_i_alt,
    round((pr.indkort - pr.overfort), 2) AS afregn_difference,
    round(pr.kontant, 2) AS kontant_i_alt,
    round(pr.bro_faerge, 2) AS bro_faerge_i_alt,
        CASE
            WHEN (sat.graense >= (10000000)::numeric) THEN ((((sat.sats1 * (100)::numeric))::integer)::text || '%'::text)
            ELSE ((((((((sat.sats1 * (100)::numeric))::integer)::text || '% op til '::text) || ((sat.graense)::bigint)::text) || ', '::text) || (((sat.sats2 * (100)::numeric))::integer)::text) || '% derover'::text)
        END AS model,
    round(((LEAST(pr.indkort, sat.graense) * sat.sats1) + (GREATEST((pr.indkort - sat.graense), (0)::numeric) * sat.sats2)), 2) AS andel_brutto,
    round(
        CASE
            WHEN ((sat.graense < (10000000)::numeric) AND (pr.indkort > sat.graense)) THEN (LEAST(pr.indkort, sat.graense) * sat.sats1)
            ELSE NULL::numeric
        END, 2) AS andel_op_til_graensen,
    round(
        CASE
            WHEN (pr.indkort > sat.graense) THEN (GREATEST((pr.indkort - sat.graense), (0)::numeric) * sat.sats2)
            ELSE NULL::numeric
        END, 2) AS andel_over_graensen,
    round(
        CASE
            WHEN sat.del_med_kone THEN (((LEAST(pr.indkort, sat.graense) * sat.sats1) + (GREATEST((pr.indkort - sat.graense), (0)::numeric) * sat.sats2)) / (2)::numeric)
            ELSE NULL::numeric
        END, 2) AS heraf_chauffor_halvdel,
    round(
        CASE
            WHEN sat.del_med_kone THEN (((LEAST(pr.indkort, sat.graense) * sat.sats1) + (GREATEST((pr.indkort - sat.graense), (0)::numeric) * sat.sats2)) / (2)::numeric)
            ELSE NULL::numeric
        END, 2) AS heraf_kone_halvdel,
    round(
        CASE
            WHEN sat.del_med_kone THEN (pr.kontant / (2)::numeric)
            ELSE NULL::numeric
        END, 2) AS kontant_pr_person,
    round(((((LEAST(pr.indkort, sat.graense) * sat.sats1) + (GREATEST((pr.indkort - sat.graense), (0)::numeric) * sat.sats2)) - pr.kontant) - pr.bro_faerge), 2) AS til_udbetaling
   FROM (pr
     JOIN public.satser sat ON ((sat.chauffor = pr.chauffor)))
  ORDER BY pr.regnskabsmaaned, pr.chauffor;

create or replace view "public"."v_afregning" as  WITH pr AS (
         SELECT d.regnskabsmaaned,
            d.chauffor,
            count(*) AS ture,
            sum(d.indkort) AS indkort,
            sum(d.kontant) AS kontant,
            sum(d.bro_faerge) AS bro_faerge
           FROM public.v_data d
          GROUP BY d.regnskabsmaaned, d.chauffor
        )
 SELECT pr.regnskabsmaaned,
    pr.chauffor,
    pr.ture,
    round(pr.indkort, 2) AS indkort,
    round(pr.kontant, 2) AS kontant,
    round(pr.bro_faerge, 2) AS bro_faerge,
    round(((LEAST(pr.indkort, sat.graense) * sat.sats1) + (GREATEST((pr.indkort - sat.graense), (0)::numeric) * sat.sats2)), 2) AS andel,
    round(((((LEAST(pr.indkort, sat.graense) * sat.sats1) + (GREATEST((pr.indkort - sat.graense), (0)::numeric) * sat.sats2)) - pr.kontant) - pr.bro_faerge), 2) AS til_udbetaling
   FROM (pr
     JOIN public.satser sat ON ((sat.chauffor = pr.chauffor)))
  ORDER BY pr.regnskabsmaaned, pr.chauffor;

CREATE OR REPLACE FUNCTION public.hent_alle(p_token text, p_maaned text DEFAULT NULL::text)
 RETURNS SETOF public.v_lonseddel
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select L.* from v_lonseddel L
  where exists (select 1 from config where n='owner_token' and v = p_token)
    and (p_maaned is null or L.regnskabsmaaned = p_maaned);
$function$
;

CREATE OR REPLACE FUNCTION public.hent_kvittering(p_token text, p_maaned text DEFAULT NULL::text)
 RETURNS SETOF public.v_lonseddel
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select L.* from v_lonseddel L
  where L.chauffor = (select chauffor from satser where token = p_token)
    and (p_maaned is null or L.regnskabsmaaned = p_maaned);
$function$
;

-- 4) hent_ture udvidet med id, billede_url, bekraeftet (v_afregning/v_lonseddel/hent_alle/hent_kvittering er ikke berørt)
drop function if exists hent_ture(text, text);

create function hent_ture(p_token text, p_maaned text)
returns table(
  id uuid, dato date, slutrapport_nr text, indkort numeric, overfort numeric,
  kontant numeric, vagt_start text, vagt_slut text, chauffor text,
  billede_url text, bekraeftet boolean
)
language sql security definer set search_path = public as $$
  select d.id, d.dato, d.slutrapport_nr, d.indkort, d.overfort, d.kontant,
         d.vagt_start, d.vagt_slut, d.chauffor, d.billede_url, d.bekraeftet
  from v_data d
  where d.regnskabsmaaned = p_maaned
    and ( d.chauffor = (select chauffor from satser where token = p_token)
          or exists (select 1 from config where n='owner_token' and v = p_token) )
  order by d.dato;
$$;

grant execute on function hent_ture(text, text) to anon;

-- 5) Marker en række som bekræftet (kun ejeren)
create or replace function saet_bekraeftet(p_token text, p_id uuid, p_vaerdi boolean)
returns void
language sql security definer set search_path = public as $$
  update slutrapporter
  set bekraeftet = p_vaerdi
  where id = p_id
    and exists (select 1 from config where n='owner_token' and v = p_token);
$$;

grant execute on function saet_bekraeftet(text, uuid, boolean) to anon;

-- 6) Ret en slutrapport manuelt (erstatter SQL-redigering — kun ejeren)
create or replace function ret_slutrapport(
  p_token text, p_id uuid,
  p_dato date, p_indkort numeric, p_overfort numeric,
  p_kontant numeric, p_bro_faerge numeric
)
returns void
language sql security definer set search_path = public as $$
  update slutrapporter
  set dato = coalesce(p_dato, dato),
      indkort = coalesce(p_indkort, indkort),
      overfort = coalesce(p_overfort, overfort),
      kontant = coalesce(p_kontant, kontant),
      bro_faerge = coalesce(p_bro_faerge, bro_faerge)
  where id = p_id
    and exists (select 1 from config where n='owner_token' and v = p_token);
$$;

grant execute on function ret_slutrapport(text, uuid, date, numeric, numeric, numeric, numeric) to anon;

-- 7) Make.com: upload af originalbillede + signeret link → billede_url. Manuel opsætning i Make, ikke SQL.
