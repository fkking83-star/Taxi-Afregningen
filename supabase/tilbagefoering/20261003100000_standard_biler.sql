-- ================================================================================================
-- NØDPLAN / TILBAGEFØRING af supabase/pending/20261003100000_standard_biler.sql.
-- Fjerner de to funktioner. Tabellen chauffoer_biler_log LADES STÅ (lukket for API'et). Dashboardet bruger så de indbyggede standardbiler.
-- Det er IKKE en migration og skal ikke flyttes til migrations/.
-- ================================================================================================
begin;
drop function if exists public.hent_chauffoer_biler(text);
drop function if exists public.saet_chauffoer_bil(text, text, text);
-- drop table if exists public.chauffoer_biler_log;
commit;
