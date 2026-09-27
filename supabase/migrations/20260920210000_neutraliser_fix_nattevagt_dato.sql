-- Bug: trg_nattevagt (BEFORE INSERT ON slutrapporter) kaldte fix_nattevagt_dato(),
-- som trak 1 dag fra 'dato' når vagt_slut < vagt_start (nattevagt der krydser midnat).
-- Den logik antog at 'dato' ankom som vagtens SLUT-dag og skulle rettes til START-dagen.
--
-- OCR-prompten leverer nu allerede 'dato' = VAGT START's dato direkte, så triggeren
-- trak fejlagtigt en EKSTRA dag fra en dato der i forvejen var korrekt.
-- Eksempel: bon med VAGT START 22-SEP kom ind som dato=2026-09-22 fra OCR (korrekt),
-- men endte som 2026-09-21 i databasen pga. denne trigger.
--
-- Verificeret før denne ændring: fix_nattevagt_dato() bruges KUN af trg_nattevagt på
-- slutrapporter (tjekket på tværs af alle tabeller via pg_trigger/pg_proc-join) —
-- ingen andre triggere påvirkes.
--
-- Forsigtig løsning: triggeren BEHOLDES (til dokumentation/historik og nem
-- genaktivering hvis OCR-prompten nogensinde ændres igen), men funktionen gøres
-- til en no-op. Da trg_nattevagt er BEFORE INSERT, kan denne ændring aldrig have
-- påvirket allerede eksisterende rækker — kun fremtidige INSERT's.
--
-- Kørt og verificeret live i produktionsdatabasen (vehgabygvxnkrqsoazfs) 2026-09-20.

create or replace function fix_nattevagt_dato()
returns trigger
language plpgsql as $$
begin
  -- Deaktiveret 2026-09: OCR-prompten leverer nu altid VAGT START's dato direkte.
  -- Tidligere logik (trak 1 dag fra ved nattevagt, dvs. vagt_slut < vagt_start)
  -- antog fejlagtigt at 'dato' stadig var vagtens SLUT-dag og gav derfor en
  -- ekstra, forkert dag fratrukket allerede korrekte datoer.
  return new;
end $$;
