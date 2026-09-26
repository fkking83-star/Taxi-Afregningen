-- hent_billeder: match på slutrapport_nr + driver_id, nyeste billede først.
-- Rører IKKE lønberegningen (v_lonseddel, v_afregning, v_data, satser) eller ret_slutrapport.
--
-- Filnavne i bucket'en 'fejlede-billeder':
--   nyt format (fra Make efter rettelsen):  {slutrapport_nr}_{driver_id}_{tidsstempel}.jpg   fx 1114_adan_1790400000.jpg
--   gammelt format (fører-feltet var tomt): {slutrapport_nr}__{tidsstempel}.jpg             fx 1114__1790281237.jpg
--
-- Kobling chauffør -> driver_id: driver_id = lower(trim(chauffor)).
-- Gælder for alle nuværende chauffører (Fuad->fuad, Faysal->faysal, Abdikarin->abdikarin,
-- Qaalid->qaalid, Adan->adan), jf. DRIVERS-listen i site/index.html.
--
-- Valg pr. nummer: 1) nyt format med chaufførens driver_id, 2) gammel fil uden fører.
-- Inden for hver gruppe vinder det nyeste billede (created_at desc).
-- Andre chaufførers filer med samme nummer vælges aldrig (numrene er ikke unikke på tværs af biler).
--
-- Returtypen ændres (slutrapport_nr tilføjet), så funktionen skal droppes og genskabes.
-- p_chauffor har DEFAULT null, og navn er stadig første kolonne, så det nuværende dashboard
-- (som kalder uden p_chauffor og kun læser navn) virker videre og får de gamle filer uden fører.

drop function if exists hent_billeder(text, text[]);

create function hent_billeder(p_token text, p_numre text[] default null, p_chauffor text default null)
returns table(navn text, slutrapport_nr text)
language sql stable security definer set search_path = public, storage as $$
  with kandidater as (
    select o.name,
           split_part(o.name, '_', 1) as nr,
           case
             when nullif(lower(trim(p_chauffor)), '') is not null
              and split_part(o.name, '_', 2) = lower(trim(p_chauffor)) then 1
             when split_part(o.name, '_', 2) = '' then 2
           end as prio,
           o.created_at
    from storage.objects o
    where o.bucket_id = 'fejlede-billeder'
      and exists (select 1 from config where n = 'owner_token' and v = p_token)
      and (p_numre is null or split_part(o.name, '_', 1) = any(p_numre))
  )
  select distinct on (nr) name, nr
  from kandidater
  where prio is not null
  order by nr, prio, created_at desc;
$$;

grant execute on function hent_billeder(text, text[], text) to anon;
