# Taxi-Afregningen
Chauffør Afregningen

Statisk taxi-afregningssystem: chauffører uploader slutrapporter, systemet beregner løn/afregning i Supabase, og både chauffører og vognmand kan se resultatet. Ingen build-step — rent HTML/CSS/vanilla JS.

## Struktur

```
site/                  ← de tre sider der deployes
  index.html           ← chaufføren uploader billede af slutrapport (sendes til Make webhook)
  kvittering.html       ← chaufførens egen kvittering/afregning (Supabase RPC, via ?k= token)
  dashboard.html        ← vognmandens overblik og redigering (Supabase RPC, via ?k= token)
supabase/migrations/    ← tom. Udfyldes automatisk fra den LIVE database (se nedenfor)
docs/                   ← arkitektur-review + Fase 1-plan, til reference
netlify.toml            ← fortæller Netlify at "site/" skal udgives
```

## Kør lokalt

Ingen build nødvendig. Start en simpel webserver i `site/`:

```bash
cd site
python3 -m http.server 8080
```

Åbn derefter:
- Chauffør-upload: http://localhost:8080/index.html
- Chaufførens kvittering: http://localhost:8080/kvittering.html?k=<personligt-token>
- Vognmandens dashboard: http://localhost:8080/dashboard.html?k=<ejer-token>

## Deploy (Netlify)

1. Forbind repoet til Netlify: **New site from Git**.
2. Build command: (ingen — statisk site).
3. Publish directory: `site` — styres allerede af `netlify.toml`, kræver ingen manuel indstilling.
4. Push til `main` → Netlify deployer automatisk.

## Hent databaseskema (Supabase migrations)

`supabase/migrations/` er tom med vilje. Sådan udfyldes den fra jeres **live** database:

```bash
npm install -g supabase
supabase login
supabase link --project-ref vehgabygvxnkrqsoazfs
supabase db pull
```

Dette genererer migrationsfiler baseret på det nuværende skema (tabeller, RPC-funktioner, RLS-politikker). Commit filerne bagefter, så databasens struktur er versioneret sammen med koden.

## Sikkerhed — læs før produktion

- `dashboard.html` indeholder i dag en hardcodet `OWNER_TOKEN_DEFAULT`. Den bør fjernes, eller RLS-politikkerne bør ændres så et gyldigt token altid kræves — ellers kan enhver med adgang til kildekoden (view-source) se vognmandens ejer-token.
- `SUPABASE_ANON_KEY` er offentlig by design, men det kræver at alle RPC-funktioner (`hent_alle`, `hent_ture`, `hent_kvittering`, `ret_slutrapport` m.fl.) selv validerer det medsendte token korrekt.
- `MAKE_WEBHOOK_URL` i `index.html` er et offentligt endpoint uden validering — overvej en delt hemmelighed i form-dataen, valideret i Make-scenariet.

Se `docs/arkitektur-review.md` for en detaljeret gennemgang af den nuværende arkitektur, og `docs/fase-1-plan.md` for de næste skridt.
