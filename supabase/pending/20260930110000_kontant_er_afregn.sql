-- ================================================================================================
-- IKKE KØRT. Vist for ejeren 30/9-2026; køres først efter godkendelse af FØR/EFTER-tallene (punkt 0.5).
-- Når den er kørt i SQL Editor: flyt filen til supabase/migrations/ uden denne overskrift.
-- Fortryd: supabase/tilbagefoering/20260930110000_kontant_er_afregn.sql
-- ================================================================================================
-- Lønsedlens kontant = afregn = indkørt − overført − bro (summeret pr. chauffør og regnskabsmåned).
-- Udbetaling = andel − afregn. Bro trækkes IKKE fra en ekstra gang, den er allerede med i afregn.
-- Før: kontant var summen af kolonnen slutrapporter.kontant (det Make gemte pr. række), og udbetaling = andel − kontant − bro.
-- Kun udtrykkene for kontant og til_udbetaling ændres i v_lonseddel og v_afregning. Kolonner, rækkefølge og typer er uændrede,
-- så hent_alle og hent_kvittering (der returnerer v_lonseddel) og kvittering.html/dashboard berøres ikke.
-- afregn_difference (indkørt − overført) er uændret; på siderne er Difference = Kontant + Bro.
-- Rører IKKE satser, trappe, 50/50, halvdelene (kontant_pr_person = kontant / 2) eller v_data.
-- Kendt: en række uden indkørt eller overført tæller ikke med i summen (som afregn_difference i dag). Den slags rækker
-- skal i trin 1.2 ikke tælle med i lønnen (status), indtil de er rettet.

begin;

create or replace view "public"."v_lonseddel" as  WITH pr AS (
         SELECT d.chauffor,
            d.regnskabsmaaned,
            count(*) AS antal_ture,
            sum(d.indkort) AS indkort,
            sum(d.overfort) AS overfort,
            (sum(d.indkort) - sum(d.overfort) - COALESCE(sum(d.bro_faerge), (0)::numeric)) AS kontant,
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
    round(((((LEAST(pr.indkort, sat.graense) * sat.sats1) + (GREATEST((pr.indkort - sat.graense), (0)::numeric) * sat.sats2)) - pr.kontant)), 2) AS til_udbetaling
   FROM (pr
     JOIN public.satser sat ON ((sat.chauffor = pr.chauffor)))
  ORDER BY pr.regnskabsmaaned, pr.chauffor;

create or replace view "public"."v_afregning" as  WITH pr AS (
         SELECT d.regnskabsmaaned,
            d.chauffor,
            count(*) AS ture,
            sum(d.indkort) AS indkort,
            (sum(d.indkort) - sum(d.overfort) - COALESCE(sum(d.bro_faerge), (0)::numeric)) AS kontant,
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
    round(((((LEAST(pr.indkort, sat.graense) * sat.sats1) + (GREATEST((pr.indkort - sat.graense), (0)::numeric) * sat.sats2)) - pr.kontant)), 2) AS til_udbetaling
   FROM (pr
     JOIN public.satser sat ON ((sat.chauffor = pr.chauffor)))
  ORDER BY pr.regnskabsmaaned, pr.chauffor;

commit;
