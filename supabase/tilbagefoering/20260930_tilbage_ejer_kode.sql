-- NØDPLAN: åbner den gamle ejer-kode igen (den nye forbliver gyldig ved siden af). Virker med det samme.
-- Bruges, hvis trin 3 (sluk gammel ejer-kode) gav problemer. Ikke en migration.
do $$
begin
  if not exists (select 1 from sikkerhed_backup.tokens_gamle_20260930 where art = 'ejer' and token is not null) then
    raise exception 'Kopien af den gamle ejer-kode mangler — intet ændret';
  end if;
  insert into public.config (n, v)
  select 'owner_token', b.token from sikkerhed_backup.tokens_gamle_20260930 b
  where b.art = 'ejer' and b.token is not null
    and not exists (select 1 from public.config c where c.n = 'owner_token' and c.v = b.token);
end $$;

select count(*) as ejer_koder_nu from public.config where n = 'owner_token';
