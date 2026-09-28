-- ================================================================================================
-- IKKE KØRT. Ligger i supabase/pending/ (ikke migrations/), så Supabase CLI ikke kører den automatisk.
-- Kræver at 20260927120000_slutrapport_billeder_bucket.sql er kørt først (hent_billeder returnerer bucket).
-- Når den er kørt i SQL Editor: flyt filen til supabase/migrations/ uændret.
-- Testet mod PGlite (19 tjek): Ret ændrer ikke ocr_slutrapport_nr, billedet findes stadig efter Ret.
-- ================================================================================================
-- ocr_slutrapport_nr: det nummer OCR/Make oprindeligt læste. Billedfilen i Storage er navngivet
-- med dette nummer ({nr}_{driver_id}_{tidsstempel}.jpg), så når ejeren retter slutrapport_nr via Ret,
-- skal billedet stadig findes via det OCR-læste nummer.
-- Rører IKKE lønberegningen (v_lonseddel, v_afregning, v_data, satser) eller ret_slutrapport.
-- Views med eksplicitte kolonnelister (v_data m.fl.) påvirkes ikke af en ny kolonne.

-- 1) Kolonnen + backfill af eksisterende rækker med det nuværende nummer
alter table slutrapporter add column if not exists ocr_slutrapport_nr text;

update slutrapporter
set ocr_slutrapport_nr = slutrapport_nr
where ocr_slutrapport_nr is null;

-- 2) Udfyld ved INSERT (kopi af slutrapport_nr), og bevar værdien ved UPDATE (fx Ret).
--    En tom værdi (null) må udfyldes senere. Bevidst manuel rettelse i SQL Editor:
--      begin; select set_config('app.ret_ocr_nr', 'ja', true); update slutrapporter set ocr_slutrapport_nr = ... ; commit;
create or replace function saet_ocr_slutrapport_nr()
returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    new.ocr_slutrapport_nr := coalesce(nullif(trim(new.ocr_slutrapport_nr), ''), new.slutrapport_nr);
  elsif old.ocr_slutrapport_nr is not null
        and coalesce(current_setting('app.ret_ocr_nr', true), '') <> 'ja' then
    new.ocr_slutrapport_nr := old.ocr_slutrapport_nr;
  end if;
  return new;
end $$;

drop trigger if exists trg_ocr_slutrapport_nr on slutrapporter;
create trigger trg_ocr_slutrapport_nr
  before insert or update on slutrapporter
  for each row execute function saet_ocr_slutrapport_nr();

-- 3) hent_billeder: samme signatur og returtype som efter 20260927120000 (navn, slutrapport_nr, bucket),
--    så dashboardet er uændret. Leder i begge buckets.
--    p_numre er rækkernes (evt. rettede) slutrapport_nr. For hver række søges filen på
--    ocr_slutrapport_nr (fallback: slutrapport_nr) + chaufførens driver_id, og der returneres
--    rækkens nuværende nummer, så dashboardet kobler billedet til den rigtige række.
--    Valg pr. række: 1) {ocr_nr}_{driver_id}_..., 2) gammel fil uden fører {ocr_nr}__...; nyeste først.
--    Numre uden række i slutrapporter matches som før direkte på nummeret.
create or replace function hent_billeder(p_token text, p_numre text[] default null, p_chauffor text default null)
returns table(navn text, slutrapport_nr text, bucket text)
language sql stable security definer set search_path = public, storage as $$
  with soeg as (
    select trim(s.slutrapport_nr) as nr,
           coalesce(nullif(trim(s.ocr_slutrapport_nr), ''), trim(s.slutrapport_nr)) as fil_nr,
           lower(trim(s.chauffor)) as drv
    from slutrapporter s
    where (p_numre is null or trim(s.slutrapport_nr) = any(p_numre))
      and (nullif(lower(trim(p_chauffor)), '') is null or lower(trim(s.chauffor)) = lower(trim(p_chauffor)))
    union all
    select n, n, nullif(lower(trim(p_chauffor)), '')
    from unnest(p_numre) n
    where not exists (
      select 1 from slutrapporter s
      where trim(s.slutrapport_nr) = n
        and (nullif(lower(trim(p_chauffor)), '') is null or lower(trim(s.chauffor)) = lower(trim(p_chauffor))))
  ),
  kandidater as (
    select k.nr, o.name, o.bucket_id, o.created_at,
           case
             when k.drv is not null and split_part(o.name, '_', 2) = k.drv then 1
             when split_part(o.name, '_', 2) = '' then 2
           end as prio
    from soeg k
    join storage.objects o
      on o.bucket_id in ('slutrapport-billeder', 'fejlede-billeder')
     and split_part(o.name, '_', 1) = k.fil_nr
     and k.fil_nr <> ''
    where exists (select 1 from config where n = 'owner_token' and v = p_token)
  )
  select distinct on (nr) name, nr, bucket_id
  from kandidater
  where prio is not null
  order by nr, prio, created_at desc;
$$;

grant execute on function hent_billeder(text, text[], text) to anon;
