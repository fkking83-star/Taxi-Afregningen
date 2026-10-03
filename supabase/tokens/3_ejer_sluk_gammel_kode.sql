-- Punkt 0.2, trin 3. SLUKKER den gamle ejer-kode. Alle links og bogmærker med den gamle kode holder op med at virke med det samme.
-- Sikring: stopper uden at ændre noget, hvis der ikke findes en anden (ny) ejer-kode — så du aldrig låser dig selv ude.
-- Fortryd med det samme: supabase/tilbagefoering/20260930_tilbage_ejer_kode.sql
do $$
begin
  if to_regclass('sikkerhed_backup.tokens_gamle_20260930') is null then
    raise exception 'Kør først trin 0 (0_sikkerhedskopi_gamle_tokens.sql) – kopien af de gamle koder findes ikke endnu. Intet er ændret.';
  end if;
  if not exists (select 1 from sikkerhed_backup.tokens_gamle_20260930 where art = 'ejer' and token is not null) then
    raise exception 'Kopien af den gamle ejer-kode mangler — intet ændret';
  end if;
  if not exists (select 1 from public.config where n = 'owner_token'
                   and v not in (select token from sikkerhed_backup.tokens_gamle_20260930 where art = 'ejer' and token is not null)) then
    raise exception 'Der er ingen ny ejer-kode at falde tilbage på — intet ændret';
  end if;
  delete from public.config
   where n = 'owner_token'
     and v in (select token from sikkerhed_backup.tokens_gamle_20260930 where art = 'ejer' and token is not null);
end $$;

select count(*) as ejer_koder_nu from public.config where n = 'owner_token';   -- skal være 1
