-- DATARETTELSE (ikke en migration, ændrer ingen struktur). Vist for ejeren før kørsel.
-- Nr 1112 (11/9-2026, indkørt 4.904, overført 4.929) står både hos Adan og hos Fuad. Ejeren har bekræftet, at bonen er Adans.
-- Fuads række slettes, men KUN hvis Adans identiske række findes. Før sletningen gemmes en kopi i sikkerhed_backup
-- (ikke nået af API'et), så rækken kan sættes ind igen. Rører hverken lønberegningen eller Adans række.
-- Kan køres flere gange: anden gang sker der ingenting.
begin;

create schema if not exists sikkerhed_backup;
revoke all on schema sikkerhed_backup from public, anon, authenticated;
create table if not exists sikkerhed_backup.slettede_slutrapporter as
  select *, now() as slettet, null::text as aarsag from public.slutrapporter where false;

with kandidat as (
  select f.* from public.slutrapporter f
  where f.id = '332b32a9-2ad2-4bfb-be5c-c7bb5fcfe3d6'
    and f.chauffor = 'Fuad' and f.slutrapport_nr = '1112'
    and exists (select 1 from public.slutrapporter a
                where a.id = '24cf8513-0478-477c-bce0-ded69d9864ec' and a.chauffor = 'Adan' and a.slutrapport_nr = '1112'
                  and a.dato = f.dato and a.indkort = f.indkort and a.overfort = f.overfort)
), gemt as (
  insert into sikkerhed_backup.slettede_slutrapporter
  select k.*, now(), 'Dublet af Adans nr 1112 (bekræftet af ejeren 30/9-2026)' from kandidat k
  returning id
)
delete from public.slutrapporter s using gemt g where s.id = g.id;

commit;

-- Kontrol (kun læsning): Fuads række skal være væk, Adans skal stå, og kopien skal have 1 række.
select (select count(*) from public.slutrapporter where slutrapport_nr = '1112' and chauffor = 'Fuad') as fuad_1112_tilbage,
       (select count(*) from public.slutrapporter where slutrapport_nr = '1112' and chauffor = 'Adan') as adan_1112,
       (select count(*) from sikkerhed_backup.slettede_slutrapporter where id = '332b32a9-2ad2-4bfb-be5c-c7bb5fcfe3d6') as kopier;
