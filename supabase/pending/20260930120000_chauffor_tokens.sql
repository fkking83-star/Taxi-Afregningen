-- ================================================================================================
-- IKKE KØRT. Vist for ejeren 30/9-2026 som del af punkt 0.2 (nye tokens, docs/plan-tokens.md).
-- Når den er kørt i SQL Editor: flyt filen til supabase/migrations/ uden denne overskrift.
-- Fortryd: supabase/tilbagefoering/20260930120000_chauffor_tokens.sql
-- ================================================================================================
-- Gør det muligt at have to gyldige koder ad gangen under skiftet (overlap).
--
-- EJER: config.n er i dag primærnøgle, så der kun kan findes én ejer-kode. Primærnøglen erstattes af en unik nøgle på (n, v):
-- samme kode kan stadig ikke stå to gange, men to forskellige ejer-koder kan stå side om side. Alle ejer-tjek i funktionerne er
-- "exists (select 1 from config where n = 'owner_token' and v = p_token)", så begge koder virker uden at nogen funktion ændres.
-- (Ingen fremmednøgle eller "on conflict (n)" i repoet bruger primærnøglen. Tjek i Make, at intet modul skriver til config.)
--
-- CHAUFFØR: den nuværende token ligger i satser.token (én kolonne). Nye tokens lægges i en ny tabel, og de to funktioner,
-- der slår en chauffør op ud fra token, kigger i begge: hent_kvittering og hent_ture.
--
-- Kun opslag og nøgle ændres. Lønberegningen (v_lonseddel, v_afregning, v_data, satser) er urørt.
-- Den nye tabel kan ikke læses af anon/authenticated; kun security definer-funktionerne kan.

begin;

do $$
begin
  if exists (select 1 from pg_constraint where conrelid = 'public.config'::regclass and conname = 'config_pkey') then
    alter table public.config drop constraint config_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conrelid = 'public.config'::regclass and conname = 'config_n_v_key') then
    alter table public.config add constraint config_n_v_key unique (n, v);
  end if;
end $$;

create table if not exists public.chauffor_tokens (
  id        uuid primary key default gen_random_uuid(),
  chauffor  text not null,
  token     text not null unique,
  oprettet  timestamptz not null default now()
);
alter table public.chauffor_tokens enable row level security;
revoke all on table public.chauffor_tokens from anon, authenticated;

create or replace function public.hent_kvittering(p_token text, p_maaned text default null::text)
 returns setof public.v_lonseddel
 language sql
 security definer
 set search_path to 'public'
as $function$
  select L.* from v_lonseddel L
  where L.chauffor = (select chauffor from (
                        select chauffor from satser where token = p_token
                        union
                        select chauffor from chauffor_tokens where token = p_token
                      ) t limit 1)
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
    and ( d.chauffor = (select chauffor from (
                          select chauffor from satser where token = p_token
                          union
                          select chauffor from chauffor_tokens where token = p_token
                        ) t limit 1)
          or exists (select 1 from config where n='owner_token' and v = p_token) )
  order by d.dato;
$function$;

commit;
