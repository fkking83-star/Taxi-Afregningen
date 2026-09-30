-- ================================================================================================
-- NØDPLAN / TILBAGEFØRING af supabase/migrations/20260930110000_kontant_er_afregn.sql (kørt live 30/9-2026).
-- Kør KUN hvis noget går galt. Gendanner lønsedlens gamle regler: kontant = sum(slutrapporter.kontant), udbetaling = andel − kontant − bro.
-- Det er IKKE en migration og skal ikke flyttes til migrations/.
-- ================================================================================================

begin;

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

commit;
