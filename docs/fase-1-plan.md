# Fase 1-plan

Formålet med Fase 1 er at få det eksisterende system (tre statiske sider + Supabase) ind i en ordentlig repo-struktur, versioneret og deploybar — uden at ændre selve forretningslogikken eller brugerfladen. Ingen omskrivning, ingen ny stack.

## Trin

1. **Repo-struktur på plads** ✅
   - `site/` med de tre eksisterende sider (`index.html`, `kvittering.html`, `dashboard.html`), uændret funktionalitet.
   - `netlify.toml` der peger Netlifys build på `site/` som publish-mappe.
   - `supabase/migrations/` oprettet (tom), klar til at blive udfyldt.
   - `docs/` med denne plan og arkitektur-reviewet.

2. **Træk databaseskemaet ind i repoet**
   - Kør `supabase link` + `supabase db pull` mod den **live** database (`vehgabygvxnkrqsoazfs`), så tabeller, RPC-funktioner (`hent_alle`, `hent_ture`, `hent_kvittering`, `ret_slutrapport`, `saet_bekraeftet`, `hent_fejlede`, `marker_fejl`) og RLS-politikker bliver til versionerede migrationsfiler.
   - Commit resultatet. Herefter er databasens struktur en del af repo-historikken, og fremtidige ændringer kan laves som nye migrationer i stedet for ad-hoc i Supabase-UI'et.

3. **Deploy til Netlify**
   - Forbind repoet til et Netlify-site, bekræft at `site/` publiceres korrekt, og at alle tre sider virker på den nye URL (test både chauffør-flow og vognmand-flow).

4. **Luk sikkerhedshullerne fundet i arkitektur-reviewet**
   - Fjern `OWNER_TOKEN_DEFAULT` fra `dashboard.html`, eller flyt validering af ejer-adgang til databasen (RLS/RPC), så et gyldigt `?k=`-link altid er påkrævet.
   - Bekræft/test at alle RPC-funktioner faktisk afviser ugyldige/tomme tokens.
   - Overvej simpel beskyttelse af `MAKE_WEBHOOK_URL` (delt hemmelighed i form-data, valideret i Make-scenariet).

5. **Dokumentér driftsprocessen**
   - README skal indeholde præcise, kopierbare kommandoer for: lokal kørsel, deploy, og hvordan man opdaterer `supabase/migrations/` når databasen ændres.

## Ikke en del af Fase 1

- Ingen ændring af UI eller brugerflow.
- Ingen migrering væk fra Make.com til fx en direkte API/webhook i egen kode.
- Ingen ny stack (React, bundler osv.) — siderne forbliver statisk HTML/JS.
