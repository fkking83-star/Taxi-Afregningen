-- ================================================================================================
-- IKKE KØRT. Forslag. Køres først, når det er bekræftet, at Make IKKE bruger anon-nøglen.
-- Når den er kørt i SQL Editor: flyt filen til supabase/migrations/ uændret.
-- ================================================================================================
-- Luk direkte adgang til tabeller og views for den offentlige nøgle (anon) og for authenticated.
--
-- Hvorfor: anon-nøglen står i kildekoden til dashboard.html og kvittering.html, så alle, der
-- har et kvitterings-link, kan se den. Live (tjekket 29/9-2026) har anon bl.a.:
--   - SELECT på satser (alle chaufførers tokens og satser) og UPDATE på satser (ændre satser)
--   - SELECT på v_data, v_lonseddel og v_afregning (alle chaufførers ture og løn)
--   - INSERT/UPDATE/DELETE på slutrapporter (satser og slutrapporter har ikke RLS slået til)
-- Views kører som deres ejer og omgår derfor RLS. De skal lukkes med grants.
--
-- Hvad virker stadig: dashboardet og kvitteringen bruger kun RPC-funktioner (hent_alle, hent_ture,
-- hent_kvittering, ret_slutrapport, opret_slutrapport, hent_billeder ...). De er security definer
-- og tjekker selv token, så de påvirkes ikke. service_role (Make med service-nøglen) påvirkes ikke.
-- Rører IKKE lønberegningen (v_data, v_afregning, v_lonseddel og satser er uændrede).

begin;

-- 1) Ingen direkte adgang til tabeller og views i public for anon/authenticated.
--    ("all tables" omfatter også views.)
revoke all on all tables in schema public from anon, authenticated;

-- 2) Nye tabeller og views får heller ikke adgang automatisk
alter default privileges for role postgres in schema public revoke all on tables from anon, authenticated;

-- 3) RLS som ekstra lås på de to tabeller, der mangler den. Uden policies betyder det: ingen adgang
--    for anon/authenticated. Tabellens ejer (RPC-funktionerne) og service_role påvirkes ikke.
alter table public.satser enable row level security;
alter table public.slutrapporter enable row level security;

-- 4) lonseddel(p_chauffor, p_maaned) har intet token-tjek og bruges ikke af siderne
revoke execute on function public.lonseddel(text, text) from public, anon, authenticated;

commit;
