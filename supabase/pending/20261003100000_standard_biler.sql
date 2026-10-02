-- ================================================================================================
-- IKKE KØRT. Vist for ejeren 3/10-2026 (standardbil pr. chauffør til dashboardets "Kontrol af måneden").
-- Når den er kørt i SQL Editor: flyt filen til supabase/migrations/ uden denne overskrift.
-- Fortryd: supabase/tilbagefoering/20261003100000_standard_biler.sql
-- ================================================================================================
-- Bilerne er faste SOM UDGANGSPUNKT pr. chauffør (standard, ikke regel): Adan 001-7144, Fuad og Faysal 001-8646, Qaalid 001-8208.
-- En anden bil kan forekomme (fx Adan på 001-8646 den 3/9); det giver en markering i kontrollen, ikke en fejl.
-- Kun tilføjelser: en logtabel og to funktioner. Rører IKKE slutrapporter, satser, lønberegningen eller nogen eksisterende funktion.
-- Hver ændring er en ny række i chauffoer_biler_log (hvem, hvornår); en chaufførs standardbil er den seneste række. Intet overskrives.
-- Tabellen kan ikke læses af anon/authenticated; kun de to funktioner kan (kræver ejer-koden).

begin;

create table if not exists public.chauffoer_biler_log (
  id         bigint generated always as identity primary key,
  chauffor   text not null check (length(btrim(chauffor)) between 1 and 100),
  taxi_nr    text check (taxi_nr is null or taxi_nr ~ '^[0-9]{3}-[0-9]{4}$'),   -- null = ingen standardbil
  hvem       text not null,
  tidspunkt  timestamptz not null default now()
);
create index if not exists chauffoer_biler_log_ch on public.chauffoer_biler_log (lower(btrim(chauffor)), id desc);
alter table public.chauffoer_biler_log enable row level security;
revoke all on table public.chauffoer_biler_log from anon, authenticated;
revoke all on sequence public.chauffoer_biler_log_id_seq from anon, authenticated;

-- Startværdier (ejerens angivelse 3/10-2026), kun første gang. Navnene tages fra satser, så stavemåden er den samme som på lønsedlen.
insert into public.chauffoer_biler_log (chauffor, taxi_nr, hvem)
select s.chauffor, v.taxi_nr, 'migration 3/10-2026 (ejerens angivelse)'
from (values ('adan', '001-7144'), ('fuad', '001-8646'), ('faysal', '001-8646'), ('qaalid', '001-8208')) v(ch, taxi_nr)
join (select distinct chauffor from public.satser) s on lower(btrim(s.chauffor)) = v.ch
where not exists (select 1 from public.chauffoer_biler_log);

do $$
begin
  if (select count(*) from public.chauffoer_biler_log) < 4 then
    raise exception 'Standardbiler: fandt kun % af de 4 chauffører (Adan, Fuad, Faysal, Qaalid) i satser — intet ændret', (select count(*) from public.chauffoer_biler_log);
  end if;
end $$;

-- Hver chaufførs nuværende standardbil
create or replace function public.hent_chauffoer_biler(p_token text)
 returns table(chauffor text, taxi_nr text, hvem text, tidspunkt timestamptz)
 language sql
 security definer
 set search_path to 'public'
as $function$
  select s.chauffor, s.taxi_nr, s.hvem, s.tidspunkt
  from (select distinct on (lower(btrim(l.chauffor))) l.chauffor, l.taxi_nr, l.hvem, l.tidspunkt
        from chauffoer_biler_log l order by lower(btrim(l.chauffor)), l.id desc) s
  where s.taxi_nr is not null
    and exists (select 1 from config where n = 'owner_token' and v = p_token)
  order by lower(btrim(s.chauffor));
$function$;

-- Sæt (eller fjern, med tom p_taxi_nr) en chaufførs standardbil. Gør intet, hvis den allerede er sådan.
create or replace function public.saet_chauffoer_bil(p_token text, p_chauffor text, p_taxi_nr text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_ch  text;
  v_nr  text := nullif(btrim(p_taxi_nr), '');
  v_nu  text;
begin
  if not exists (select 1 from config where n = 'owner_token' and v = p_token) then
    raise exception 'Ugyldig ejer-kode';
  end if;
  select s.chauffor into v_ch from satser s where lower(btrim(s.chauffor)) = lower(btrim(p_chauffor)) limit 1;
  if v_ch is null then raise exception 'Ukendt chauffør'; end if;
  if v_nr is not null and v_nr !~ '^[0-9]{3}-[0-9]{4}$' then raise exception 'Ugyldigt taxi nr (forventer fx 001-7144)'; end if;

  select l.taxi_nr into v_nu from chauffoer_biler_log l where lower(btrim(l.chauffor)) = lower(btrim(v_ch)) order by l.id desc limit 1;
  if found and v_nu is not distinct from v_nr then return; end if;
  if not found and v_nr is null then return; end if;

  insert into chauffoer_biler_log (chauffor, taxi_nr, hvem) values (v_ch, v_nr, 'ejer (dashboard)');
end;
$function$;

commit;
