-- ================================================================================================
-- NØDPLAN / TILBAGEFØRING af supabase/migrations/20260930100000_luk_direkte_adgang.sql (kørt live 30/9-2026).
-- Kør KUN hvis noget holder op med at virke efter lukningen. Åbner præcis som før lukningen:
-- anon/authenticated får de rettigheder tilbage, der blev gemt i sikkerhed_backup.rettigheder_20260929,
-- RLS slås fra på satser og slutrapporter igen, og lonseddel() kan kaldes igen.
-- Det er IKKE en migration og skal ikke flyttes til migrations/.
-- ================================================================================================

begin;

-- 1) Rettighederne tilbage fra sikkerhedskopien (stopper uden ændringer, hvis kopien mangler eller er tom)
do $$
declare
  r record;
begin
  if not exists (select 1 from sikkerhed_backup.rettigheder_20260929) then
    raise exception 'Sikkerhedskopien sikkerhed_backup.rettigheder_20260929 er tom — intet ændret';
  end if;
  for r in select distinct objekt, type, grantee, privilegie from sikkerhed_backup.rettigheder_20260929 loop
    if to_regclass(format('public.%I', r.objekt)) is not null then
      execute format('grant %s on %s public.%I to %I', r.privilegie,
                     case when r.type = 'S' then 'sequence' else 'table' end, r.objekt, r.grantee);
    end if;
  end loop;
end $$;

-- 2) Nye tabeller får igen automatisk adgang for anon/authenticated (Supabases standard)
alter default privileges for role postgres in schema public grant all on tables to anon, authenticated;

-- 3) RLS fra igen på de to tabeller (som før lukningen)
alter table public.satser disable row level security;
alter table public.slutrapporter disable row level security;

-- 4) lonseddel() kan kaldes igen
grant execute on function public.lonseddel(text, text) to public, anon, authenticated;

commit;

-- Sikkerhedskopien bevares, så lukningen kan køres igen senere uden at miste den oprindelige tilstand.
