-- Punkt 0.2, trin 0. Kopi af de NUVÆRENDE tokens (ejer + alle chauffører), som slukning og tilbageføring bruger.
-- Ligger i sikkerhed_backup (ikke nået af API'et). Ændrer ingen tokens og intet, brugerne kan mærke. Kan køres igen; kopien overskrives ikke.
-- Efter kørslen vises kun antal, aldrig selve tokens.
create schema if not exists sikkerhed_backup;
revoke all on schema sikkerhed_backup from public, anon, authenticated;
create table if not exists sikkerhed_backup.tokens_gamle_20260930 (
  art    text not null,          -- 'ejer' eller 'chauffør'
  navn   text not null,          -- 'ejer' eller chaufførens navn
  token  text,                   -- tom, hvis chaufføren ingen token havde
  gemt   timestamptz not null default now()
);
revoke all on table sikkerhed_backup.tokens_gamle_20260930 from public, anon, authenticated;

do $$
begin
  if not exists (select 1 from sikkerhed_backup.tokens_gamle_20260930 where art = 'ejer')
     and (select count(*) from public.config where n = 'owner_token') <> 1 then
    raise exception 'Der er ikke præcis én ejer-kode i config — intet ændret';
  end if;
end $$;

insert into sikkerhed_backup.tokens_gamle_20260930 (art, navn, token)
select 'ejer', 'ejer', v from public.config where n = 'owner_token'
  and not exists (select 1 from sikkerhed_backup.tokens_gamle_20260930 where art = 'ejer');
insert into sikkerhed_backup.tokens_gamle_20260930 (art, navn, token)
select 'chauffør', chauffor, token from public.satser
  where not exists (select 1 from sikkerhed_backup.tokens_gamle_20260930 where art = 'chauffør');

select art, count(*) as antal, count(token) as med_token
from sikkerhed_backup.tokens_gamle_20260930 group by art order by art;
