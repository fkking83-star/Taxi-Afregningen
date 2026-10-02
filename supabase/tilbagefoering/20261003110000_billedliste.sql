-- NØDPLAN / TILBAGEFØRING af supabase/pending/20261003110000_billedliste.sql: fjerner funktionen. Ikke en migration.
begin;
drop function if exists public.hent_billedliste(text);
commit;
