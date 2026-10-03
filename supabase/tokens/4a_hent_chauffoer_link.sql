-- Punkt 0.2, trin 4a. KUN LÆSNING. Viser chaufførens nye kvitterings-link og en færdig besked, klar til at sende.
-- Tryk "Download CSV" i SQL Editor og åbn filen lokalt. Del aldrig linket i chat, mail til andre eller kode.
-- Kør først migrationen og trin 4 for den chauffør. Mangler noget, stopper scriptet med en forklaring (intet vises, intet ændres).
do $$
declare
  v_navn text := 'Fuad';   -- ← RET: chaufførens navn (ét ad gangen)
  v_u text := 'https://superb-daffodil-ca45c8.netlify.app';   -- din Netlify-adresse (uden / til sidst); ret kun, hvis du skifter domæne
begin
  if to_regclass('public.chauffor_tokens') is null then
    raise exception 'Kør først migrationen (supabase/pending/20260930120000_chauffor_tokens.sql) – den nye nøgle/tabel findes ikke endnu. Intet er ændret.';
  end if;
  if not exists (select 1 from public.satser where chauffor = v_navn) then
    raise exception 'Ukendt chauffør: % – navnet skal stå præcis som i satser. Intet er ændret.', v_navn;
  end if;
  if not exists (select 1 from public.chauffor_tokens where chauffor = v_navn) then
    raise exception '% har intet nyt link endnu. Kør først trin 4 (4_chauffoer_opret_ny_kode.sql) for % – eller trin 5 er allerede kørt, og så er det nye link allerede hans faste. Intet er ændret.', v_navn, v_navn;
  end if;
  if v_u is null or v_u = '' or v_u like '%DIN-ADRESSE%' or v_u like '%/' then
    raise exception 'Adressen mangler eller er forkert (skal være fx https://navn.netlify.app uden / til sidst). Intet er ændret.';
  end if;
  perform set_config('tokens.navn', v_navn, false);
  perform set_config('tokens.adresse', v_u, false);
end $$;

select t.chauffor,
       current_setting('tokens.adresse') || '/kvittering.html?k=' || t.token as link,
       'Hej ' || t.chauffor || E'!\n\n'
       || E'Du har fået et nyt, personligt link til din afregning:\n'
       || current_setting('tokens.adresse') || '/kvittering.html?k=' || t.token || E'\n\n'
       || E'Gem det nye link, og slet den gamle besked med dit gamle link i vores chat – også hvis du har det som ikon på hjemmeskærmen. Det gamle link bliver lukket om få dage.\n'
       || E'Send ikke linket videre til andre – det viser din løn.\n\n'
       || E'Hilsen Fahad\nTaxi & Flex 22 ApS' as besked
from public.chauffor_tokens t
where t.chauffor = current_setting('tokens.navn');
