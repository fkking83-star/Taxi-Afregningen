# Fase 2-plan: billeder, bekræftelse og manuel rettelse

Status: **gennemført og verificeret live** i produktionsdatabasen (`vehgabygvxnkrqsoazfs`) 2026-09-20, undtagen Make.com-integrationen (afsnit 4 nedenfor, valgfri/kan udskydes).

Denne fase gør de dele af `dashboard.html`, der allerede lå i koden fra Fase 1 (bekræft-flueben, "Ret"-knap/formular, billede-kolonne), reelt funktionelle. Frontend'en kaldte allerede `saet_bekraeftet`, `ret_slutrapport` og forventede `billede_url`/`bekraeftet` fra `hent_ture` — disse manglede i databasen indtil nu.

## Hvad blev tilføjet (rent additivt, intet eksisterende ændret)

- To nye kolonner på `slutrapporter`: `billede_url` (text) og `bekraeftet` (boolean, default `false`).
- `v_data` udvidet til at videreføre de to nye kolonner (eksisterende kolonner/rækkefølge uændret).
- `hent_ture(p_token, p_maaned)` gendannet med samme signatur, nu med `id`, `billede_url` og `bekraeftet` i output.
- Ny funktion `saet_bekraeftet(p_token, p_id, p_vaerdi)` — kun ejer-tokenet kan bruge den.
- Ny funktion `ret_slutrapport(p_token, p_id, p_dato, p_indkort, p_overfort, p_kontant, p_bro_faerge)` — erstatter manuel SQL-redigering af fejlede rækker; kun ejer-tokenet kan bruge den.
- Ny privat Storage-bucket `slutrapport-billeder` (oprettet i Supabase Studio, ikke via migration).

**Verificeret uændret** under udrulningen: `v_afregning`, `v_lonseddel`, `hent_alle`, `hent_kvittering`, `hent_fejlede`, `marker_fejl` — alle sammenlignet før/efter, ingen forskel i output eller definition.

Se `supabase/migrations/20260919220000_billeder_bekraeftet_ret.sql` for den fulde, bekræftede SQL.

## Resterende, valgfrit trin

Make-scenariet skal stadig udvides med to nye HTTP-moduler (upload af originalbillede + hentning af et langtidsholdbart signeret link), så `billede_url` bliver udfyldt for nye uploads. Kan gøres når som helst uden at påvirke resten — indtil da står kolonnen bare tom for nye rækker, og dashboardet viser "intet billede".

## Ikke en del af Fase 2

- Ingen ændring af eksisterende beregninger (`v_lonseddel`, `v_afregning`) eller kvitteringssiden — bekræftet uberørt.
- Ingen ændring af `index.html` (chaufførens upload-flow) — kun Make-scenariet bag den mangler evt. at blive udvidet.
