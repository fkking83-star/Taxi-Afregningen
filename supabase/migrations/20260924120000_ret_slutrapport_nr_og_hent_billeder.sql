-- To dashboard-udvidelser. Rent additivt. Rører IKKE lønberegningen
-- (v_lonseddel, v_afregning, v_data, satser) — slutrapport_nr indgår ikke i nogen beregning,
-- så at kunne rette det påvirker ingen tal.
-- Køres i Supabase SQL Editor FØR den nye dashboard.html tages i brug.

-- 1) ret_slutrapport: tilføj p_slutrapport_nr, så et fejllæst nummer kan rettes.
--    Signaturen ændres (ny parameter), så funktionen skal droppes + genskabes.
--    p_slutrapport_nr har DEFAULT null, så gamle 7-argument-kald stadig virker.
drop function if exists ret_slutrapport(text, uuid, date, numeric, numeric, numeric, numeric);

create function ret_slutrapport(
  p_token text, p_id uuid,
  p_dato date, p_indkort numeric, p_overfort numeric,
  p_kontant numeric, p_bro_faerge numeric,
  p_slutrapport_nr text default null
)
returns void
language sql security definer set search_path = public as $$
  update slutrapporter
  set dato           = coalesce(p_dato, dato),
      indkort        = coalesce(p_indkort, indkort),
      overfort       = coalesce(p_overfort, overfort),
      kontant        = coalesce(p_kontant, kontant),
      bro_faerge     = coalesce(p_bro_faerge, bro_faerge),
      slutrapport_nr = coalesce(p_slutrapport_nr, slutrapport_nr)
  where id = p_id
    and exists (select 1 from config where n='owner_token' and v = p_token);
$$;

grant execute on function ret_slutrapport(text, uuid, date, numeric, numeric, numeric, numeric, text) to anon;

-- 2) hent_billeder: slå de faktiske filnavne op i den offentlige bucket ud fra NUMMERET.
--    Filnavnet er {slutrapport_nr}_{fører}.jpg, hvor føreren ofte er det fulde navn fra bonen
--    ("Adan abdi Abdulle"), ikke databasens korte chauffor ("Adan"). Ved at matche på nummeret
--    (prefix "{nr}_") rammer vi filen uanset hvordan førernavnet staves.
--    Ejer-token-beskyttet, så filnavne ikke kan listes af andre. Rører ikke Storage/Make.
create or replace function hent_billeder(p_token text, p_numre text[] default null)
returns table(navn text)
language sql security definer set search_path = public, storage as $$
  select o.name
  from storage.objects o
  where o.bucket_id = 'fejlede-billeder'
    and exists (select 1 from config where n='owner_token' and v = p_token)
    and ( p_numre is null
          or exists (select 1 from unnest(p_numre) n where o.name like (n || '\_%')) );
$$;

grant execute on function hent_billeder(text, text[]) to anon;
