-- ================================================================================================
-- IKKE KØRT. Vist for ejeren 2/10-2026 (dashboardets "Kontrol af måneden").
-- Når den er kørt i SQL Editor: flyt filen til supabase/migrations/ uden denne overskrift.
-- Fortryd: supabase/tilbagefoering/20261002100000_kontrol_ok.sql
-- ================================================================================================
-- "Kontrolleret – OK" på et fund i dashboardets "Kontrol af måneden". Kun tilføjelser: en ny logtabel og to nye funktioner.
-- Rører IKKE slutrapporter, satser, lønberegningen eller nogen eksisterende funktion. Ingen data ændres af kontrollen selv;
-- alle rettelser går fortsat gennem Ret / Udfyld og godkend (og logges dér).
--
-- Hver markering gemmes som en række i kontrol_log (hvem, hvornår, hvilket fund). En fortrydelse er en ny række, så intet overskrives.
-- Et fund er "OK", når dets SIDSTE række siger 'ok'. Nøglen består af fundets type, rækkernes id'er og et fingeraftryk af rækkernes værdier,
-- så et OK ikke dækker over et fund, hvor en af rækkerne er rettet bagefter.
-- Tabellen kan ikke læses af anon/authenticated; kun de to security definer-funktioner kan (kræver ejer-koden).

begin;

create table if not exists public.kontrol_log (
  id         bigint generated always as identity primary key,
  noegle     text not null check (length(noegle) between 1 and 400),
  type       text not null check (length(type) between 1 and 60),
  handling   text not null check (handling in ('ok', 'fortryd_ok')),
  raekker    text[] not null default '{}',     -- de rækkers id'er, fundet gælder (til visning)
  hvem       text not null,
  tidspunkt  timestamptz not null default now()
);
create index if not exists kontrol_log_noegle on public.kontrol_log (noegle, id desc);
alter table public.kontrol_log enable row level security;
revoke all on table public.kontrol_log from anon, authenticated;
revoke all on sequence public.kontrol_log_id_seq from anon, authenticated;

-- Alle fund, der lige nu er markeret OK
create or replace function public.hent_kontrol_ok(p_token text)
 returns table(noegle text, type text, hvem text, tidspunkt timestamptz)
 language sql
 security definer
 set search_path to 'public'
as $function$
  select s.noegle, s.type, s.hvem, s.tidspunkt
  from (select distinct on (l.noegle) l.noegle, l.type, l.handling, l.hvem, l.tidspunkt
        from kontrol_log l order by l.noegle, l.id desc) s
  where s.handling = 'ok'
    and exists (select 1 from config where n = 'owner_token' and v = p_token)
  order by s.tidspunkt desc;
$function$;

-- Markér et fund OK (p_ok = true) eller fortryd det (p_ok = false). Gør intet, hvis fundet allerede har den tilstand.
create or replace function public.saet_kontrol_ok(p_token text, p_noegle text, p_type text, p_raekker text[], p_ok boolean)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_nu text;
begin
  if not exists (select 1 from config where n = 'owner_token' and v = p_token) then
    raise exception 'Ugyldig ejer-kode';
  end if;
  if p_noegle is null or length(trim(p_noegle)) = 0 or length(p_noegle) > 400 then
    raise exception 'Ugyldig nøgle';
  end if;
  if p_type is null or length(trim(p_type)) = 0 or length(p_type) > 60 then
    raise exception 'Ugyldig type';
  end if;

  select l.handling into v_nu from kontrol_log l where l.noegle = p_noegle order by l.id desc limit 1;
  if (coalesce(v_nu, 'fortryd_ok') = 'ok') = coalesce(p_ok, true) then return; end if;   -- allerede i den tilstand

  insert into kontrol_log (noegle, type, handling, raekker, hvem)
  values (p_noegle, p_type, case when coalesce(p_ok, true) then 'ok' else 'fortryd_ok' end, coalesce(p_raekker, '{}'), 'ejer (dashboard)');
end;
$function$;

commit;
