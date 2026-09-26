# Arkitektur-review

Status: nuværende, faktiske system, som det ser ud i `site/`.

## Overblik

Systemet er tre statiske HTML-sider uden build-step (rent HTML/CSS/vanilla JS). Ingen framework, ingen bundler. Det gør dem trivielle at deploye (fx som Netlify static site) og lette at forstå, men det betyder også at al opsætning (nøgler, URL'er) ligger direkte i kildekoden.

### `site/index.html` — Chaufførens upload-side
- Chaufføren identificeres enten via URL-parameter (`?driver=fuad` m.fl.) eller ved at vælge sig selv i en dropdown. Driver-listen (`DRIVERS`) er hardcoded i filen (navn + telefonnr.).
- Chaufføren tager/vælger et billede af slutrapporten. Billedet skaleres client-side (max 1600px, JPEG-kvalitet 0.82) via `<canvas>` før afsendelse — ingen server-side billedbehandling nødvendig.
- Billedet sendes som `multipart/form-data` direkte til en **Make.com webhook** (`MAKE_WEBHOOK_URL`, hardcoded). Siden har ingen direkte adgang til Supabase — al parsing/OCR og skrivning til databasen sker formodentlig i Make-scenariet på den anden side af webhooken.
- Webhook-svaret forventes at indeholde et vagt-/slutrapportnummer (JSON eller ren tekst), som vises som kvittering på skærmen.

### `site/kvittering.html` — Chaufførens egen afregning
- Adgang styres af et personligt token i URL'en (`?k=`), som sendes som parameter til Supabase RPC-kald.
- Kalder Supabase direkte fra klienten via `fetch` mod `/rest/v1/rpc/hent_kvittering` og `/rest/v1/rpc/hent_ture`, med `SUPABASE_ANON_KEY` hardcoded i filen.
- Viser lønseddel pr. regnskabsmåned (28.–27.) og en tabel over chaufførens ture i perioden, med visuel markering af differencer (indkørt vs. overført) og kontantbeløb.

### `site/dashboard.html` — Vognmandens overblik
- Samme mønster: direkte Supabase-kald fra klienten via RPC'er, styret af `OWNER_TOKEN` (fra `?k=` eller en hardcoded `OWNER_TOKEN_DEFAULT`).
- RPC'er der bruges: `hent_alle`, `hent_ture`, `hent_fejlede`, `saet_bekraeftet`, `ret_slutrapport`, `marker_fejl`.
- Giver vognmanden mulighed for at se alle chaufførers lønsedler for en given måned, rette enkelte slutrapporter (dato/indkørt/overført/kontant), markere ture som bekræftede, og se/behandle fejlede uploads (fx OCR-fejl fra Make-scenariet).
- Markerer automatisk mistænkte dubletter (samme dato + indkørt beløb) i rød.

## Datastrøm (samlet billede)

```
Chauffør (index.html) --billede--> Make.com webhook --> (OCR/parsing) --> Supabase (Postgres)
                                                                              ^
Chauffør (kvittering.html) <--RPC (hent_kvittering, hent_ture)---------------|
Vognmand  (dashboard.html) <--RPC (hent_alle, hent_ture, hent_fejlede, ...)--|
                            --RPC (ret_slutrapport, saet_bekraeftet, ...)---->
```

Databasen (Supabase-projekt `vehgabygvxnkrqsoazfs`) er selve kilden til sandhed. Al forretningslogik (beregning af andele, differencer, udbetaling) sker i RPC-funktionerne i databasen — ikke i klienten. Klienterne er "dumme" visnings-/redigeringslag.

## Sikkerhedsbemærkninger

1. **`OWNER_TOKEN_DEFAULT` er hardcoded i `dashboard.html`.** Enhver der åbner siden og ser kildekoden (view-source) kan se vognmandens ejer-token og dermed få adgang til alle chaufførers data og redigeringsrettigheder uden at kende et `?k=`-link. Dette bør ikke ligge i klientkoden i klartekst — flyt til en server-side proxy, eller kræv altid et link med `?k=` og fjern default-værdien.
2. **`SUPABASE_ANON_KEY` er offentlig by design** (det er meningen med en "anon public"-nøgle), men det betyder at *al* adgangskontrol afhænger af, at RPC-funktionerne (`hent_alle`, `hent_kvittering`, `ret_slutrapport` osv.) selv validerer det medsendte token korrekt server-side (typisk via Row Level Security eller eksplicit tokentjek i funktionen). Dette bør verificeres/testes eksplicit — der er intet i klientkoden der beskytter mod at nogen kalder RPC'erne direkte med et gættet/lækket token.
3. **`MAKE_WEBHOOK_URL` i `index.html` er et helt åbent, offentligt endpoint.** Enhver der kender URL'en kan poste vilkårlige filer til den. Overvej rate-limiting eller simpel validering (fx et delt hemmeligt felt i form-dataen) i selve Make-scenariet.
4. Ingen af siderne har CSP-headers eller anden hardening — acceptabelt for et internt værktøj i lille skala, men værd at være opmærksom på hvis brugerkredsen vokser.

## Styrker ved den nuværende løsning

- Enkel: ingen build, ingen dependencies, let at deploye og fejlsøge.
- Forretningslogik samlet ét sted (databasens RPC-funktioner), ikke duplikeret mellem sider.
- Mobilvenligt UI, designet til brug på telefonen ude i bilen (kamera-optag, store touch-targets).
