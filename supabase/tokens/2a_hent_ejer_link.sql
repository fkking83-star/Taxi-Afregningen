-- Punkt 0.2, trin 2a. KUN LÆSNING. Viser dit nye dashboard-link (ét felt). Tryk "Download CSV" i SQL Editor og åbn filen lokalt.
-- Del aldrig linket i chat, mail eller kode. Slet CSV-filen, når linket er gemt som bogmærke/ikon.
with base as (select 'https://DIN-ADRESSE'::text as u)   -- ← RET KUN DENNE LINJE: din Netlify-adresse, uden / til sidst
select base.u || '/dashboard.html?k=' || c.v as dashboard_link
from base, public.config c
where c.n = 'owner_token'
  and c.v not in (select token from sikkerhed_backup.tokens_gamle_20260930 where art = 'ejer' and token is not null)
  and base.u not like '%DIN-ADRESSE%';
