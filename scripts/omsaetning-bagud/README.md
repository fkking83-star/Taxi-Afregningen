# Omsætning mellem boner — bagudkørsel over alle billeder (engangsjob)

Formål: se **præcis hvilke vagter og hvor mange kroner der mangler**, ved at læse TOTAL DKK og ANTAL TURE (kumulativt) fra hver bon og
sammenligne boner i samme bil. Reglen: for to nabo-boner i samme bil skal `TOTAL(senere) − TOTAL(tidligere) = taxameter + fastpris` for den senere bon
(plus vagterne imellem, hvis der er huller). Er der kroner til overs, mangler en vagt. Hul i nummer med 0 kr imellem er en tom vagt og ikke en fejl.

**Kun læsning.** Jobbet skriver intet til databasen eller Storage. Det henter billederne fra de offentlige URL'er og sender dem til OpenAI til aflæsning
(som Make gør i dag). Resultatet ender i lokale filer i `cache/` og `rapport/`, som ikke kommer i git.

## Før du kører det
1. **SQL først:** kør `supabase/pending/20261003110000_billedliste.sql` i SQL Editor (kun læsning: giver listen over filer i de to buckets). Så behøver jobbet **ingen service_role-nøgle**.
2. **Nye nøgler.** Brug en ny OpenAI-nøgle (de gamle er blevet delt i chatten og skal skiftes). Skriv aldrig nøgler i chat, commit eller filer.
3. Node 20 eller nyere.

## Miljøvariabler (kun i din egen terminal)
```
export SUPABASE_URL="https://vehgabygvxnkrqsoazfs.supabase.co"
export SUPABASE_ANON_KEY="…"        # den offentlige anon-nøgle (står i dashboard.html)
export OWNER_TOKEN="…"              # din ejer-kode (den du bruger i dashboard-linket)
export OPENAI_API_KEY="…"
export OPENAI_MODEL="…"             # en model med billedforståelse og structured outputs; vælg selv, der er ingen standard
# (valgfrit) export OPENAI_URL=…   # kun hvis du bruger en anden OpenAI-kompatibel adresse
```

## Trin (hvert trin vises for dig, før det næste)
```
cd scripts/omsaetning-bagud
node koer.mjs --toer            # tæller billeder. Sender intet til OpenAI.
node koer.mjs --proeve 20       # læser 20 billeder og skriver felterne ud. SAMMENLIGN MED BILLEDERNE.
node koer.mjs --alle --bekraeft=<antal>   # læser resten (antallet fra --toer; ét OpenAI-kald pr. billede). Kan afbrydes og genoptages.
node koer.mjs --rapport [--sammenlign-db] # bygger rapporten ud fra cache
```
`--proeve` er vigtig: instruktionen til modellen (`PROMPT` i `lib.mjs`) er en **første udgave, skrevet uden at have set en rigtig bon**. Passer felterne ikke,
rettes den, før `--alle` køres.

## Rapporten (`rapport/`)
- `opsummering.txt`: antal huller med kroner imellem, manglende numre og **mindst** X kr i alt, pr. bil og pr. regnskabsmåned; tomme vagter; tal der ikke passer.
- `vagter_der_mangler.csv`: hver manglende vagt (bil, numre imellem, beløb, de to nabo-boner og deres billedfiler).
- `led.csv`: alle sammenligninger mellem nabo-boner. `uloeselige.csv`, `mangelfulde_boner.csv`: billeder, der ikke kunne læses fuldt.
- Med `--sammenlign-db`: `bon_uden_vagt_i_db.csv` (billede findes, men ingen vagt) og `afvigende_indkoert.csv`.

Beløbene er et **mindstebeløb** ud fra tællerne, og alt bygger på OCR. Gå listen igennem mod billederne, før noget rettes eller tilføjes; rettelser sker bagefter via Udfyld og godkend, så de logges.
