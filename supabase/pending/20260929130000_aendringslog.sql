-- ================================================================================================
-- IKKE KØRT. Når den er kørt i SQL Editor: flyt filen til supabase/migrations/ uden denne overskrift.
-- ================================================================================================
-- Ændringslog for slutrapporter: "Ret" og "Udfyld og godkend" gemmer rækken før og efter ændringen
-- (hvem, hvornår), og en ændring kan fortrydes fra dashboardet.
-- Rører IKKE lønberegningen (v_data, v_afregning, v_lonseddel, satser) eller slutrapporter-tabellens kolonner.
-- ret_slutrapport og opret_slutrapport gør præcis det samme som før; de skriver blot også en log-række.

-- 1) Logtabellen. Kun RPC-funktionerne (security definer) læser og skriver; anon har ingen direkte adgang.
create table if not exists slutrapport_log (
  id               bigint generated always as identity primary key,
  slutrapport_id   uuid not null,
  handling         text not null check (handling in ('ret', 'opret', 'fortryd')),
  hvem             text not null,
  tidspunkt        timestamptz not null default now(),
  foer             jsonb,          -- rækken før ændringen (null ved opret)
  efter            jsonb,          -- rækken efter ændringen (null når en oprettelse fortrydes = rækken slettes)
  fejl_id          uuid,           -- opret: fejl-rækken, der blev godkendt (sættes tilbage til 'ny' ved fortryd)
  fortrudt_tid     timestamptz,    -- sat, når ændringen er fortrudt
  fortrudt_log_id  bigint references slutrapport_log(id)
);
create index if not exists slutrapport_log_raekke on slutrapport_log (slutrapport_id, id desc);
alter table slutrapport_log enable row level security;
revoke all on table slutrapport_log from anon, authenticated;

-- 2) De felter, der logges og sammenlignes (ikke bekraeftet/oprettet: fluebenet må gerne sættes imellem).
create or replace function slutrapport_felter(s slutrapporter)
returns jsonb
language sql immutable as $$
  select jsonb_build_object(
    'id', s.id, 'dato', s.dato, 'slutrapport_nr', s.slutrapport_nr, 'chauffor', s.chauffor,
    'indkort', s.indkort, 'overfort', s.overfort, 'kontant', s.kontant, 'bro_faerge', s.bro_faerge,
    'vagt_start', s.vagt_start, 'vagt_slut', s.vagt_slut, 'billede_url', s.billede_url);
$$;
revoke execute on function slutrapport_felter(slutrapporter) from public, anon, authenticated;

-- 3) ret_slutrapport: samme signatur, samme ændring som før (coalesce = tomt felt ændres ikke).
--    Nyt: rækken før og efter gemmes i loggen, hvis noget faktisk blev ændret.
create or replace function ret_slutrapport(
  p_token text, p_id uuid,
  p_dato date, p_indkort numeric, p_overfort numeric,
  p_kontant numeric, p_bro_faerge numeric,
  p_slutrapport_nr text default null
)
returns void
language plpgsql security definer set search_path = public as $$
declare
  v_foer  slutrapporter;
  v_efter slutrapporter;
begin
  -- Som før: forkert ejer-kode eller ukendt id ændrer intet (og giver ingen fejl)
  if not exists (select 1 from config where n = 'owner_token' and v = p_token) then return; end if;
  select * into v_foer from slutrapporter where id = p_id for update;
  if not found then return; end if;

  update slutrapporter
  set dato           = coalesce(p_dato, dato),
      indkort        = coalesce(p_indkort, indkort),
      overfort       = coalesce(p_overfort, overfort),
      kontant        = coalesce(p_kontant, kontant),
      bro_faerge     = coalesce(p_bro_faerge, bro_faerge),
      slutrapport_nr = coalesce(p_slutrapport_nr, slutrapport_nr)
  where id = p_id
  returning * into v_efter;

  if slutrapport_felter(v_foer) is distinct from slutrapport_felter(v_efter) then
    insert into slutrapport_log (slutrapport_id, handling, hvem, foer, efter)
    values (p_id, 'ret', 'ejer (dashboard)', slutrapport_felter(v_foer), slutrapport_felter(v_efter));
  end if;
end $$;

grant execute on function ret_slutrapport(text, uuid, date, numeric, numeric, numeric, numeric, text) to anon;

-- 4) opret_slutrapport: som 20260929120000 (dublet-svar m.m.); nyt: den oprettede række logges.
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
  v_ny       slutrapporter;
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
    returning * into v_ny;
  exception when unique_violation then
    -- To samtidige gem af samme bon: samme svar som ovenfor
    select to_jsonb(d) into v_findes from find_slutrapport(p_token, v_chauffor, v_nr) d limit 1;
    raise exception using message = format('Rapport nr %s findes allerede for %s', v_nr, v_chauffor),
                          detail = coalesce(v_findes::text, ''), hint = 'dublet';
  end;

  update fejlede_uploads set status = 'rettet' where id = p_fejl_id;
  insert into slutrapport_log (slutrapport_id, handling, hvem, efter, fejl_id)
  values (v_ny.id, 'opret', 'ejer (dashboard)', slutrapport_felter(v_ny), p_fejl_id);
  return v_ny.id;
end $$;

grant execute on function opret_slutrapport(text, uuid, text, text, date, text, text, numeric, numeric, numeric, text) to anon;

-- 5) hent_aendringer: de seneste ændringer (evt. kun for én række), med om de kan fortrydes nu.
--    En ændring kan fortrydes, når den ikke er fortrudt, og rækken stadig ser ud som lige efter ændringen
--    (ellers skal den nyere ændring fortrydes først).
create or replace function hent_aendringer(p_token text, p_slutrapport_id uuid default null, p_antal int default 30)
returns table(id bigint, slutrapport_id uuid, handling text, hvem text, tidspunkt timestamptz,
              foer jsonb, efter jsonb, fortrudt_tid timestamptz, kan_fortrydes boolean)
language sql stable security definer set search_path = public as $$
  select l.id, l.slutrapport_id, l.handling, l.hvem, l.tidspunkt, l.foer, l.efter, l.fortrudt_tid,
         l.handling in ('ret', 'opret') and l.fortrudt_tid is null
           and exists (select 1 from slutrapporter s where s.id = l.slutrapport_id and slutrapport_felter(s) = l.efter)
  from slutrapport_log l
  where exists (select 1 from config where n = 'owner_token' and v = p_token)
    and (p_slutrapport_id is null or l.slutrapport_id = p_slutrapport_id)
  order by l.id desc
  limit greatest(1, least(coalesce(p_antal, 30), 200));
$$;

grant execute on function hent_aendringer(text, uuid, int) to anon;

-- 6) fortryd_aendring: sæt rækken tilbage (Ret) eller slet den oprettede række og vis fejlkortet igen
--    (Udfyld og godkend). Kun hvis rækken er uændret siden; selve fortrydelsen logges også.
create or replace function fortryd_aendring(p_token text, p_log_id bigint)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  l        slutrapport_log;
  v_nu     slutrapporter;
  v_efter  slutrapporter;
  v_log_id bigint;
begin
  if not exists (select 1 from config where n = 'owner_token' and v = p_token) then
    raise exception 'Ugyldig ejer-kode';
  end if;
  select * into l from slutrapport_log where id = p_log_id for update;
  if not found then raise exception 'Ændringen findes ikke'; end if;
  if l.handling not in ('ret', 'opret') then raise exception 'Kun "Ret" og "Udfyld og godkend" kan fortrydes'; end if;
  if l.fortrudt_tid is not null then raise exception 'Ændringen er allerede fortrudt'; end if;

  select * into v_nu from slutrapporter where id = l.slutrapport_id for update;
  if not found then raise exception 'Rækken findes ikke længere'; end if;
  if slutrapport_felter(v_nu) is distinct from l.efter then
    raise exception 'Rækken er ændret siden — fortryd den nyeste ændring først';
  end if;

  if l.handling = 'ret' then
    begin
      update slutrapporter
      set dato           = (l.foer->>'dato')::date,
          slutrapport_nr = l.foer->>'slutrapport_nr',
          indkort        = (l.foer->>'indkort')::numeric,
          overfort       = (l.foer->>'overfort')::numeric,
          kontant        = (l.foer->>'kontant')::numeric,
          bro_faerge     = (l.foer->>'bro_faerge')::numeric
      where id = l.slutrapport_id
      returning * into v_efter;
    exception when unique_violation then
      raise exception 'Kan ikke fortryde: rapport nr % bruges nu af en anden række for %',
        l.foer->>'slutrapport_nr', v_nu.chauffor;
    end;
    insert into slutrapport_log (slutrapport_id, handling, hvem, foer, efter)
    values (l.slutrapport_id, 'fortryd', 'ejer (dashboard)', slutrapport_felter(v_nu), slutrapport_felter(v_efter))
    returning id into v_log_id;
  else
    delete from slutrapporter where id = l.slutrapport_id;
    if l.fejl_id is not null then
      update fejlede_uploads set status = 'ny' where id = l.fejl_id;
    end if;
    insert into slutrapport_log (slutrapport_id, handling, hvem, foer, efter, fejl_id)
    values (l.slutrapport_id, 'fortryd', 'ejer (dashboard)', slutrapport_felter(v_nu), null, l.fejl_id)
    returning id into v_log_id;
  end if;

  update slutrapport_log set fortrudt_tid = now(), fortrudt_log_id = v_log_id where id = l.id;
  return jsonb_build_object('handling', l.handling, 'slutrapport_id', l.slutrapport_id,
                            'chauffor', v_nu.chauffor, 'dato', coalesce(v_efter.dato, v_nu.dato),
                            'slettet', l.handling = 'opret');
end $$;

grant execute on function fortryd_aendring(text, bigint) to anon;
