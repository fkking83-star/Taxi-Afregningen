-- Punkt 0.2, trin 4a. KUN LÆSNING. Viser chaufførens nye kvitterings-link og en færdig besked, klar til at sende.
-- Tryk "Download CSV" i SQL Editor og åbn filen lokalt. Del aldrig linket i chat, mail til andre eller kode.
with valg as (select 'Fuad'::text as navn,                      -- ← RET: chaufførens navn
                     'https://DIN-ADRESSE'::text as u)          -- ← RET: din Netlify-adresse, uden / til sidst
select t.chauffor,
       valg.u || '/kvittering.html?k=' || t.token as link,
       'Hej ' || t.chauffor || E'!\n\n'
       || E'Du har fået et nyt, personligt link til din afregning:\n'
       || valg.u || '/kvittering.html?k=' || t.token || E'\n\n'
       || E'Gem det nye link, og fjern det gamle – også hvis du har det som ikon på hjemmeskærmen. Det gamle link bliver lukket om få dage.\n'
       || E'Send ikke linket videre til andre – det viser din løn.\n\n'
       || E'Hilsen Fahad\nTaxi & Flex 22 ApS' as besked
from valg
join public.chauffor_tokens t on t.chauffor = valg.navn
where valg.u not like '%DIN-ADRESSE%';
