# Byggeplan: udfas Make.com

Mål: Make.com udfases helt. Indlæsning, OCR og kontrol flyttes til egen kode i Supabase.
Til Make bygges der ikke mere.

## Regler

- Al SQL vises for ejeren, før den køres.
- `tests/` køres før og efter hver ændring (`cd tests && npm test`).
- Intet bygges direkte i drift. Nyt afprøves først i test-projektet (Fase 1).
- Alt, der rører lønnen, vises med FØR/EFTER-tal pr. chauffør og godkendes, før det køres.
- Lønberegningens regler (satser, trappe, 50/50) ændres kun efter udtrykkelig godkendelse.
- Ét punkt ad gangen. Der stoppes efter hvert punkt, så ejeren kan se resultatet.

## Fase 0: oprydning i det nuværende system

| Punkt | Indhold | Status |
|-------|---------|--------|
| 0.3 | `OWNER_TOKEN_DEFAULT` fjernet fra `dashboard.html`. Dashboardet kræver `?k=` i linket. | Bygget (dashboard v2026-09-30a), afventer ejerens test |
| 0.5 | Lønsedlens kontant = afregn (indkort − overfort − bro_faerge), også pr. person ved Qaalids 50/50. Udbetaling = andel − afregn. FØR/EFTER pr. chauffør for 2026-09 vises først. Forventet efter: Faysal ca. 34.430,50 (hvis 1672/1682/1639 er med) og Qaalid ca. 50.128,88. | Ikke startet |
| 0.2 | Nye tokens til ejer og chauffører plus nye links. De gamle kunne læses før lockdown. Skiftet sker, uden at chaufførerne mister adgang. SQL vises først. | Ikke startet |
| 0.6 | raa_data i Make HTTP 121 | Springes over (Make udfases) |

Allerede gjort: lukning af direkte adgang for anon-nøglen (`supabase/migrations/20260930100000_luk_direkte_adgang.sql`, kørt live 30/9-2026).

## Fase 1: test-projekt og databaseudvidelse

| Trin | Indhold | Status |
|------|---------|--------|
| 1.0 | Opret et Supabase test-projekt (vejledning klik for klik), og byg databasen fra `supabase/migrations/`. | Ikke startet |
| 1.1 | Databaseudvidelse, kun tilføjelser: kolonnerne `kilde`, `taxi_nr`, `status`, `kontroller`, `raa_data`, `billede_sti`, `indlaesning_id` og `virksomhed_id` samt tabellerne `kilder`, `taxier`, `indlaesninger` og `virksomheder`. SQL vises først. | Ikke startet |

Mangler fra ejeren:
- Abdikarins bil: [UDFYLD]
- Modtager af den daglige e-mail: [UDFYLD]

Se også `docs/taxi-nr-plan.md` (bil-fordeling) og `docs/plan-indlaesning.md`.
