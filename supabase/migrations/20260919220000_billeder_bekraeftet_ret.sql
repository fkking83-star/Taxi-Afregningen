-- Fase 2: billeder + "bekræftet"-flueben + ret-formular.
-- Rent additiv: nye kolonner har standardværdier, eksisterende rækker/beregninger (v_afregning, v_lonseddel,
-- hent_alle, hent_kvittering) påvirkes ikke og er verificeret uændrede.
-- Bekræftet kørt og verificeret live i produktionsdatabasen (vehgabygvxnkrqsoazfs) 2026-09-20.

-- 1) Nye kolonner på slutrapporter
alter table slutrapporter add column if not exists billede_url text;
alter table slutrapporter add column if not exists bekraeftet boolean not null default false;

-- 2) Storage-bucket 'slutrapport-billeder' oprettes manuelt i Supabase Studio (Storage → New bucket, privat, ikke via SQL).

-- 3) v_data viderefører de to nye kolonner til alle aflæsninger (hent_ture, dashboard).
-- CREATE OR REPLACE er sikkert her: eksisterende kolonner/rækkefølge er uændrede, de nye er tilføjet til sidst.
create or replace view v_data as
select id,
       dato,
       slutrapport_nr,
       chauffor,
       indkort,
       overfort,
       kontant,
       bro_faerge,
       vagt_start,
       vagt_slut,
       oprettet,
       billede_url,
       bekraeftet,
       to_char(
         case
           when extract(day from dato) >= 28 then (date_trunc('month', dato::timestamp with time zone) + interval '1 mon')::date
           else dato
         end::timestamp with time zone, 'YYYY-MM'
       ) as regnskabsmaaned
from slutrapporter s;

-- 4) hent_ture udvidet med id, billede_url, bekraeftet (v_afregning/v_lonseddel/hent_alle/hent_kvittering er ikke berørt)
drop function if exists hent_ture(text, text);

create function hent_ture(p_token text, p_maaned text)
returns table(
  id uuid, dato date, slutrapport_nr text, indkort numeric, overfort numeric,
  kontant numeric, vagt_start text, vagt_slut text, chauffor text,
  billede_url text, bekraeftet boolean
)
language sql security definer set search_path = public as $$
  select d.id, d.dato, d.slutrapport_nr, d.indkort, d.overfort, d.kontant,
         d.vagt_start, d.vagt_slut, d.chauffor, d.billede_url, d.bekraeftet
  from v_data d
  where d.regnskabsmaaned = p_maaned
    and ( d.chauffor = (select chauffor from satser where token = p_token)
          or exists (select 1 from config where n='owner_token' and v = p_token) )
  order by d.dato;
$$;

grant execute on function hent_ture(text, text) to anon;

-- 5) Marker en række som bekræftet (kun ejeren)
create or replace function saet_bekraeftet(p_token text, p_id uuid, p_vaerdi boolean)
returns void
language sql security definer set search_path = public as $$
  update slutrapporter
  set bekraeftet = p_vaerdi
  where id = p_id
    and exists (select 1 from config where n='owner_token' and v = p_token);
$$;

grant execute on function saet_bekraeftet(text, uuid, boolean) to anon;

-- 6) Ret en slutrapport manuelt (erstatter SQL-redigering — kun ejeren)
create or replace function ret_slutrapport(
  p_token text, p_id uuid,
  p_dato date, p_indkort numeric, p_overfort numeric,
  p_kontant numeric, p_bro_faerge numeric
)
returns void
language sql security definer set search_path = public as $$
  update slutrapporter
  set dato = coalesce(p_dato, dato),
      indkort = coalesce(p_indkort, indkort),
      overfort = coalesce(p_overfort, overfort),
      kontant = coalesce(p_kontant, kontant),
      bro_faerge = coalesce(p_bro_faerge, bro_faerge)
  where id = p_id
    and exists (select 1 from config where n='owner_token' and v = p_token);
$$;

grant execute on function ret_slutrapport(text, uuid, date, numeric, numeric, numeric, numeric) to anon;

-- 7) Make.com: upload af originalbillede + signeret link → billede_url. Manuel opsætning i Make, ikke SQL.
