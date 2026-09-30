-- Punkt 0.2, trin 1. Opretter en NY ejer-kode ved siden af den gamle (overlap): begge virker, til du slukker den gamle (trin 3).
-- Koden dannes i databasen og vises ikke her. Hent linket med 2a_hent_ejer_link.sql.
do $$
begin
  if not exists (select 1 from sikkerhed_backup.tokens_gamle_20260930 where art = 'ejer' and token is not null) then
    raise exception 'Kør først 0_sikkerhedskopi_gamle_tokens.sql — intet ændret';
  end if;
  if (select count(*) from public.config where n = 'owner_token') <> 1
     or not exists (select 1 from public.config c join sikkerhed_backup.tokens_gamle_20260930 b on b.art = 'ejer' and b.token = c.v where c.n = 'owner_token') then
    raise exception 'Der findes allerede en ny ejer-kode (eller ejer-koden er ændret siden kopien) — intet ændret';
  end if;
  insert into public.config (n, v) values ('owner_token', replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));
end $$;

select count(*) as ejer_koder_nu from public.config where n = 'owner_token';   -- skal være 2
