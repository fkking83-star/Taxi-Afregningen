-- ================================================================================================
-- NØDPLAN / TILBAGEFØRING af supabase/pending/20260930120000_chauffor_tokens.sql.
-- Gendanner hent_kvittering og hent_ture, så kun satser.token gælder, og gendanner primærnøglen på config(n).
-- Tabellen chauffor_tokens lades stå (den er lukket for API'et), men nye chauffør-links, der kun ligger dér, virker ikke mere.
-- Stopper uden at ændre noget, hvis config har to ejer-koder: kør først 3_ejer_sluk_gammel_kode (eller behold kun den kode, du vil bruge).
-- Det er IKKE en migration og skal ikke flyttes til migrations/.
-- ================================================================================================
begin;

do $$
begin
  if exists (select n from public.config group by n having count(*) > 1) then
    raise exception 'config har flere rækker med samme n (to ejer-koder) — sluk den ene først — intet ændret';
  end if;
end $$;

create or replace function public.hent_kvittering(p_token text, p_maaned text default null::text)
 returns setof public.v_lonseddel
 language sql
 security definer
 set search_path to 'public'
as $function$
  select L.* from v_lonseddel L
  where L.chauffor = (select chauffor from satser where token = p_token)
    and (p_maaned is null or L.regnskabsmaaned = p_maaned);
$function$;

create or replace function public.hent_ture(p_token text, p_maaned text)
 returns table(id uuid, dato date, slutrapport_nr text, indkort numeric, overfort numeric,
               kontant numeric, vagt_start text, vagt_slut text, chauffor text,
               billede_url text, bekraeftet boolean)
 language sql
 security definer
 set search_path to 'public'
as $function$
  select d.id, d.dato, d.slutrapport_nr, d.indkort, d.overfort, d.kontant,
         d.vagt_start, d.vagt_slut, d.chauffor, d.billede_url, d.bekraeftet
  from v_data d
  where d.regnskabsmaaned = p_maaned
    and ( d.chauffor = (select chauffor from satser where token = p_token)
          or exists (select 1 from config where n='owner_token' and v = p_token) )
  order by d.dato;
$function$;

do $$
begin
  alter table public.config drop constraint if exists config_n_v_key;
  if not exists (select 1 from pg_constraint where conrelid = 'public.config'::regclass and conname = 'config_pkey') then
    alter table public.config add primary key (n);
  end if;
end $$;

commit;
