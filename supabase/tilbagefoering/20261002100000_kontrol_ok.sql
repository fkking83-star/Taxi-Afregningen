-- ================================================================================================
-- NØDPLAN / TILBAGEFØRING af supabase/pending/20261002100000_kontrol_ok.sql.
-- Fjerner de to funktioner. Tabellen kontrol_log LADES STÅ (den er lukket for API'et), så markeringerne ikke går tabt.
-- Dashboardet virker uden funktionerne: "Kontrol af måneden" viser så alle fund, og OK-knappen er skjult.
-- Vil du også slette markeringerne, så fjern kommentartegnene på sidste linje.
-- Det er IKKE en migration og skal ikke flyttes til migrations/.
-- ================================================================================================
begin;
drop function if exists public.hent_kontrol_ok(text);
drop function if exists public.saet_kontrol_ok(text, text, text, text[], boolean);
-- drop table if exists public.kontrol_log;
commit;
