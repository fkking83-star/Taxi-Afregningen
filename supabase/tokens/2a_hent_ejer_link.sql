-- Punkt 0.2, trin 2a. KUN LÆSNING. Viser dit nye dashboard-link (ét felt). Tryk "Download CSV" i SQL Editor og åbn filen lokalt.
-- Del aldrig linket i chat, mail eller kode. Slet CSV-filen, når linket er gemt som bogmærke/ikon.
-- Kør først migrationen, trin 0 og trin 1. Mangler noget, stopper scriptet med en forklaring (intet vises, intet ændres).
do $$
declare
  v_u text := 'https://superb-daffodil-ca45c8.netlify.app';   -- din Netlify-adresse (uden / til sidst); ret kun, hvis du skifter domæne
begin
  if to_regclass('sikkerhed_backup.tokens_gamle_20260930') is null then
    raise exception 'Kør først trin 0 (0_sikkerhedskopi_gamle_tokens.sql) – kopien af de gamle koder findes ikke endnu. Intet er ændret.';
  end if;
  if not exists (select 1 from public.config where n = 'owner_token'
                   and v not in (select token from sikkerhed_backup.tokens_gamle_20260930 where art = 'ejer' and token is not null)) then
    raise exception 'Der findes ingen NY ejer-kode endnu. Kør først trin 1 (1_ejer_opret_ny_kode.sql). Intet er ændret.';
  end if;
  if v_u is null or v_u = '' or v_u like '%DIN-ADRESSE%' or v_u like '%/' then
    raise exception 'Adressen mangler eller er forkert (skal være fx https://navn.netlify.app uden / til sidst). Intet er ændret.';
  end if;
  perform set_config('tokens.adresse', v_u, false);
end $$;

select current_setting('tokens.adresse') || '/dashboard.html?k=' || c.v as dashboard_link
from public.config c
where c.n = 'owner_token'
  and c.v not in (select token from sikkerhed_backup.tokens_gamle_20260930 where art = 'ejer' and token is not null);
