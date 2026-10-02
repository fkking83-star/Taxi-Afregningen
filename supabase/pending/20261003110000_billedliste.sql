-- ================================================================================================
-- IKKE KØRT. Vist for ejeren 3/10-2026 (engangsjob: kør omsætningskontrollen bagud over alle billeder).
-- Når den er kørt i SQL Editor: flyt filen til supabase/migrations/ uden denne overskrift.
-- Fortryd: supabase/tilbagefoering/20261003110000_billedliste.sql
-- ================================================================================================
-- Én ny funktion, KUN LÆSNING: listen over alle filer i de to billed-buckets (navn, bucket, oprettet). Jobbet scripts/omsaetning-bagud
-- bruger den (med ejer-koden) til at finde billederne og henter dem derefter fra de offentlige URL'er. Så behøver jobbet ingen service_role-nøgle.
-- Rører ingen tabeller, ingen data og ingen eksisterende funktion.
begin;

create or replace function public.hent_billedliste(p_token text)
 returns table(bucket text, navn text, oprettet timestamptz)
 language sql
 stable
 security definer
 set search_path to 'public', 'storage'
as $function$
  select o.bucket_id, o.name, o.created_at
  from storage.objects o
  where o.bucket_id in ('slutrapport-billeder', 'fejlede-billeder')
    and exists (select 1 from config where n = 'owner_token' and v = p_token)
  order by o.created_at, o.name;
$function$;

grant execute on function public.hent_billedliste(text) to anon;

commit;
