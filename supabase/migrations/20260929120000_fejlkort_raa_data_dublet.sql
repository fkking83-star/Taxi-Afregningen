-- Kørt i live-databasen 29/9-2026 (SQL Editor).
-- Fejlkort i dashboardet: OCR-tallene gemmes på fejl-rækken, og dubletter vises direkte på kortet.
-- Rører IKKE lønberegningen (v_data, v_afregning, v_lonseddel, satser) eller slutrapporter-tabellen.

-- 1) raa_data: OCR-resultatet (samme JSON som Make ellers indsætter i slutrapporter:
--    slutrapport_nr, dato, vagt_start, vagt_slut, indkort, overfort, kontant, bro_faerge).
--    Udfyldes af Make, når en upload afvises. Tom (null) for gamle rækker.
--    hent_fejlede returnerer allerede hele rækken (select f.* ... returns setof fejlede_uploads),
--    så den nye kolonne kommer med uden ændring af funktionen.
alter table fejlede_uploads add column if not exists raa_data jsonb;

-- 2) find_slutrapport: findes der allerede en række med samme chauffør + slutrapport-nr?
--    Kun ejeren. Samme sammenligning som dublet-tjekket i opret_slutrapport.
create or replace function find_slutrapport(p_token text, p_chauffor text, p_slutrapport_nr text)
returns table(id uuid, dato date, slutrapport_nr text, chauffor text, indkort numeric, overfort numeric,
              bro_faerge numeric, vagt_start text, vagt_slut text, billede_url text)
language sql stable security definer set search_path = public as $$
  select s.id, s.dato, s.slutrapport_nr, s.chauffor, s.indkort, s.overfort,
         s.bro_faerge, s.vagt_start, s.vagt_slut, s.billede_url
  from slutrapporter s
  where exists (select 1 from config where n = 'owner_token' and v = p_token)
    and lower(trim(s.chauffor)) = lower(trim(p_chauffor))
    and trim(s.slutrapport_nr) = trim(p_slutrapport_nr)
  order by s.dato;
$$;

grant execute on function find_slutrapport(text, text, text) to anon;

-- 3) opret_slutrapport: ved dublet sendes den eksisterende række med tilbage (id og data) i fejlens
--    DETAIL som JSON, med HINT = 'dublet'. Beskeden er den samme som før, så dashboards, der ikke kender
--    DETAIL, viser det samme som i dag. Signatur og returtype er uændrede. Alt andet er som før.
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
  v_findes   jsonb;
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

  select to_jsonb(d) into v_findes
  from find_slutrapport(p_token, v_chauffor, v_nr) d
  limit 1;
  if v_findes is not null then
    raise exception using message = format('Rapport nr %s findes allerede for %s', v_nr, v_chauffor),
                          detail = v_findes::text, hint = 'dublet';
  end if;

  begin
    insert into slutrapporter (dato, slutrapport_nr, chauffor, indkort, overfort, kontant, bro_faerge,
                               vagt_start, vagt_slut, billede_url)
    values (p_dato, v_nr, v_chauffor, p_indkort, p_overfort, 0, coalesce(p_bro_faerge, 0),
            nullif(trim(p_vagt_start), ''), nullif(trim(p_vagt_slut), ''), nullif(trim(p_billede_url), ''))
    returning id into v_id;
  exception when unique_violation then
    -- To samtidige gem af samme bon: samme svar som ovenfor
    select to_jsonb(d) into v_findes from find_slutrapport(p_token, v_chauffor, v_nr) d limit 1;
    raise exception using message = format('Rapport nr %s findes allerede for %s', v_nr, v_chauffor),
                          detail = coalesce(v_findes::text, ''), hint = 'dublet';
  end;

  update fejlede_uploads set status = 'rettet' where id = p_fejl_id;
  return v_id;
end $$;

grant execute on function opret_slutrapport(text, uuid, text, text, date, text, text, numeric, numeric, numeric, text) to anon;
