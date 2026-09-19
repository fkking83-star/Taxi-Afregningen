# Fase 2-plan: billeder, bekræftelse og manuel rettelse

Denne fase gør de dele af `dashboard.html`, der allerede findes i koden fra Fase 1 (bekræft-flueben, "Ret"-knap/formular, billede-kolonne), reelt funktionelle. Frontend'en kalder allerede `saet_bekraeftet`, `ret_slutrapport` og forventer `billede_url`/`bekraeftet` fra `hent_ture` — disse har blot manglet i databasen indtil nu.

## Hvad blev tilføjet (rent additivt, intet eksisterende ændret)

- To nye kolonner på `slutrapporter`: `billede_url` (text) og `bekraeftet` (boolean, default `false`).
- `hent_ture(p_token, p_maaned)` gendannet med samme signatur og samme eksisterende felter, plus `billede_url` og `bekraeftet` i output.
- Ny funktion `saet_bekraeftet(p_token, p_id, p_vaerdi)` — kun ejer-tokenet kan bruge den.
- Ny funktion `ret_slutrapport(p_token, p_id, p_dato, p_indkort, p_overfort, p_kontant, p_bro_faerge)` — erstatter manuel SQL-redigering af fejlede rækker; kun ejer-tokenet kan bruge den.
- Ny privat Storage-bucket `slutrapport-billeder` (oprettet i Supabase Studio, ikke via migration).

Se `supabase/migrations/20260919220000_billeder_bekraeftet_ret.sql` for den fulde SQL.

## Kørt herfra, eller ej?

Denne migration er **committet til repoet for sporbarhed, men er ikke kørt mod den live database fra denne session** — samme netværksbegrænsning som forhindrede `supabase db pull` i Fase 1 forhindrer også direkte SQL-eksekvering herfra. Den skal køres manuelt:

1. Åbn Supabase Studio → SQL Editor for projektet `vehgabygvxnkrqsoazfs`.
2. Indsæt og kør indholdet af `supabase/migrations/20260919220000_billeder_bekraeftet_ret.sql` (afsnit 1, 3, 4, 5).
3. Opret Storage-bucket manuelt: Storage → New bucket → navn `slutrapport-billeder`, **ikke** public, MIME-typer `image/jpeg, image/png`.
4. Opdater Make-scenariet med de to nye HTTP-moduler (upload + signeret link) beskrevet i specifikationen, så `billede_url` bliver udfyldt for nye uploads. Kan udskydes uden at påvirke resten — kolonnen står bare tom for rækker uden billede indtil da.

## Ikke en del af Fase 2

- Ingen ændring af eksisterende beregninger (`v_lonseddel`, `v_afregning`) eller kvitteringssiden.
- Ingen ændring af `index.html` (chaufførens upload-flow) — kun Make-scenariet bag den udvides.
