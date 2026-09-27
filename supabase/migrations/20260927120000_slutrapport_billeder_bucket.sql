-- To buckets: "slutrapport-billeder" (nye, godkendte billeder) og "fejlede-billeder" (som i dag).
-- Rører IKKE lønberegningen (v_lonseddel, v_afregning, v_data, satser), slutrapporter eller ret_slutrapport.

-- 1) Offentlig bucket til billeder. Offentlig = billederne kan vises via public-URL uden login
--    (samme som fejlede-billeder). Der oprettes ingen upload-politikker her, så anon kan IKKE
--    uploade eller slette via denne migration. Om Make skal have en upload-regel til bucket'en,
--    afgøres af policy-tjekket på storage.objects (evt. i en separat migration).
insert into storage.buckets (id, name, public, allowed_mime_types)
values ('slutrapport-billeder', 'slutrapport-billeder', true, array['image/*'])
on conflict (id) do update
  set public = excluded.public,
      allowed_mime_types = excluded.allowed_mime_types;

-- 2) hent_billeder: samme match som i dag (nummer + driver_id, nyeste først, gamle filer uden
--    fører som tilbagefald), men i BEGGE buckets. Returnerer nu også bucket, så dashboardet kan
--    bygge den rigtige URL. Returtypen ændres, så funktionen skal droppes og genskabes.
drop function if exists hent_billeder(text, text[], text);

create function hent_billeder(p_token text, p_numre text[] default null, p_chauffor text default null)
returns table(navn text, slutrapport_nr text, bucket text)
language sql stable security definer set search_path = public, storage as $$
  with kandidater as (
    select o.name,
           o.bucket_id,
           split_part(o.name, '_', 1) as nr,
           case
             when nullif(lower(trim(p_chauffor)), '') is not null
              and split_part(o.name, '_', 2) = lower(trim(p_chauffor)) then 1
             when split_part(o.name, '_', 2) = '' then 2
           end as prio,
           o.created_at
    from storage.objects o
    where o.bucket_id in ('slutrapport-billeder', 'fejlede-billeder')
      and split_part(o.name, '_', 1) <> ''   -- afviste filer uden nummer hører til fejl-rækker, ikke slutrapporter
      and exists (select 1 from config where n = 'owner_token' and v = p_token)
      and (p_numre is null or split_part(o.name, '_', 1) = any(p_numre))
  )
  select distinct on (nr) name, nr, bucket_id
  from kandidater
  where prio is not null
  order by nr, prio, created_at desc;
$$;

grant execute on function hent_billeder(text, text[], text) to anon;

-- 3) hent_fejl_billeder: billedet til hver række i fejlede_uploads.
--    Afviste filer har intet nummer ("_{driver_id}_{tidsstempel}.jpg"), så de matches på
--    driver_id + tidspunkt: den fil fra samme chauffør, der er uploadet tættest på fejl-rækkens
--    "modtaget", inden for p_minutter (standard 5). Filer med nummer matches på samme måde.
--    Ingen fil inden for vinduet -> ingen række (dashboardet viser så intet billede).
create or replace function hent_fejl_billeder(p_token text, p_minutter int default 5)
returns table(fejl_id uuid, bucket text, navn text)
language sql stable security definer set search_path = public, storage as $$
  select f.id, b.bucket_id, b.name
  from fejlede_uploads f
  cross join lateral (
    select o.bucket_id, o.name
    from storage.objects o
    where o.bucket_id in ('slutrapport-billeder', 'fejlede-billeder')
      and split_part(o.name, '_', 2) = lower(trim(coalesce(nullif(trim(f.driver_id), ''), f.chauffor)))
      and o.created_at between f.modtaget - make_interval(mins => p_minutter)
                           and f.modtaget + make_interval(mins => p_minutter)
    order by abs(extract(epoch from (o.created_at - f.modtaget)))
    limit 1
  ) b
  where exists (select 1 from config where n = 'owner_token' and v = p_token);
$$;

grant execute on function hent_fejl_billeder(text, int) to anon;
