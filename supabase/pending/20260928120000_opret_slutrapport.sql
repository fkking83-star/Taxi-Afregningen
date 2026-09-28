-- ================================================================================================
-- IKKE KØRT. Ligger i supabase/pending/ (ikke migrations/), så Supabase CLI ikke kører den automatisk.
-- Når den er kørt i SQL Editor: flyt filen til supabase/migrations/ uændret.
-- Testet mod PGlite (21 tjek): opretter rækken + sætter fejl-rækken til rettet i samme transaktion,
-- tydelig besked ved dublet, afviser forkert ejer-kode / allerede godkendt / manglende felter.
-- ================================================================================================
-- opret_slutrapport: "Udfyld og godkend" fra kortene under Fejlede uploads i dashboardet.
-- Opretter én række i slutrapporter ud fra ejerens indtastning (med bonen ved siden af) og
-- markerer fejl-rækken som 'rettet' i SAMME transaktion: fejler noget, sker ingen af delene.
-- Rører IKKE Make, lønberegningen (v_data, v_afregning, v_lonseddel, satser) eller eksisterende funktioner.
-- kontant sættes altid til 0 (OCR-feltet "kontant" bruges ikke).

create or replace function opret_slutrapport(
  p_token          text,
  p_fejl_id        uuid,
  p_chauffor       text,
  p_slutrapport_nr text,
  p_dato           date,
  p_vagt_start     text,
  p_vagt_slut      text,
  p_indkort        numeric,
  p_overfort       numeric,
  p_bro_faerge     numeric default 0,
  p_billede_url    text    default null   -- valgfri: bonens billede, så rækken viser det i tabellen
)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_chauffor text;
  v_nr       text := nullif(trim(p_slutrapport_nr), '');
  v_status   text;
  v_id       uuid;
begin
  if not exists (select 1 from config where n = 'owner_token' and v = p_token) then
    raise exception 'Ugyldig ejer-kode';
  end if;

  -- Samme stavemåde som i satser (lønsedlen og dashboardet matcher på det præcise navn)
  select s.chauffor into v_chauffor
  from satser s where lower(trim(s.chauffor)) = lower(trim(p_chauffor))
  limit 1;
  v_chauffor := coalesce(v_chauffor, nullif(trim(p_chauffor), ''));

  if v_chauffor is null then raise exception 'Chauffør mangler'; end if;
  if v_nr is null       then raise exception 'Slutrapport-nr mangler'; end if;
  if p_dato is null     then raise exception 'Dato mangler'; end if;
  if p_indkort is null or p_overfort is null then
    raise exception 'Indkørt og overført skal udfyldes';
  end if;

  select status into v_status from fejlede_uploads where id = p_fejl_id for update;
  if not found then raise exception 'Fejl-rækken findes ikke (er den slettet?)'; end if;
  if v_status = 'rettet' then raise exception 'Fejl-rækken er allerede godkendt'; end if;

  if exists (select 1 from slutrapporter
             where lower(trim(chauffor)) = lower(v_chauffor) and trim(slutrapport_nr) = v_nr) then
    raise exception 'Rapport nr % findes allerede for %', v_nr, v_chauffor;
  end if;

  begin
    insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort, kontant, bro_faerge,
                               vagt_start, vagt_slut, billede_url)
    values (p_dato, v_nr, v_chauffor, p_indkort, p_overfort, 0, coalesce(p_bro_faerge, 0),
            nullif(trim(p_vagt_start), ''), nullif(trim(p_vagt_slut), ''), nullif(trim(p_billede_url), ''))
    returning id into v_id;
  exception when unique_violation then
    -- To samtidige gem af samme bon: samme tydelige besked som ovenfor
    raise exception 'Rapport nr % findes allerede for %', v_nr, v_chauffor;
  end;

  update fejlede_uploads set status = 'rettet' where id = p_fejl_id;
  return v_id;
end $$;

grant execute on function opret_slutrapport(text, uuid, text, text, date, text, text, numeric, numeric, numeric, text) to anon;
