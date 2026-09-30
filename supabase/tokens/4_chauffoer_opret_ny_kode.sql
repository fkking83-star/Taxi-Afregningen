-- Punkt 0.2, trin 4. Opretter et NYT kvitterings-link til ÉN chauffør ved siden af det gamle (overlap). Kræver migrationen chauffor_tokens.
-- Koden dannes i databasen og vises ikke her. Hent linket og beskeden med 4a_hent_chauffoer_link.sql.
do $$
declare
  v_navn text := 'Fuad';   -- ← RET KUN DENNE LINJE: chaufførens navn præcis som i satser
begin
  if not exists (select 1 from public.satser where chauffor = v_navn) then
    raise exception 'Ukendt chauffør: % — intet ændret', v_navn;
  end if;
  if not exists (select 1 from sikkerhed_backup.tokens_gamle_20260930 where art = 'chauffør' and navn = v_navn) then
    raise exception 'Kør først 0_sikkerhedskopi_gamle_tokens.sql — intet ændret';
  end if;
  if exists (select 1 from public.chauffor_tokens where chauffor = v_navn) then
    raise exception '% har allerede et nyt link — hent det med 4a_hent_chauffoer_link.sql — intet ændret', v_navn;
  end if;
  insert into public.chauffor_tokens (chauffor, token)
  values (v_navn, replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''));
end $$;

select chauffor, count(*) as nye_links from public.chauffor_tokens group by chauffor order by chauffor;
