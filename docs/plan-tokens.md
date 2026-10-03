# Plan: nye tokens (punkt 0.2)

Status: **plan, ikke godkendt, intet kørt.** Skrevet 30/9-2026, rettet 3/10-2026 efter ejerens svar (punkt 0.3 og lockdown er merget til main i PR #6).

**Hvorfor:** ejer-koden stod indbygget i `dashboard.html` (og ligger stadig i git-historikken og i ældre Netlify-udgaver), og
chaufførernes tokens kunne læses direkte i tabellen `satser`, før lockdown'en. De gamle koder skal derfor dø, og nye skal i brug,
uden at nogen mister adgang undervejs.

**Regler for dette punkt**
- Gamle og nye links virker **side om side** (overlap), indtil ejeren slukker de gamle.
- **Ét token ad gangen:** først ejer-koden, bagefter chauffør for chauffør.
- **Ingen token i chat, PR-tekst, commit-beskeder eller filer i repoet.** Tokens dannes af databasen, når scriptet køres, og vises kun i de to
  forespørgsler `2a` og `4a`, som ejeren henter som CSV-fil i SQL Editor. Alle andre scripts viser kun antal.
- Al SQL vises først; `tests/` køres før og efter; hver slukning kan fortrydes med det samme.

## Tjekliste før godkendelse

| | Krav | Hvor i planen | Status |
|---|---|---|---|
| a | Ejer først, så én chauffør ad gangen, med overlap | "Rækkefølge" (trin D–F ejer, G–J chauffør for chauffør); gamle og nye koder virker side om side, til du selv slukker | ✓ |
| b | Liste over dine links og bogmærker, der stopper | "Hvad holder op med at virke" (opdateret 3/10) | ✓ |
| c | Tilbageføring | "Tilbageføring" (ejer, chauffører og migration; kopien bevares til trin K) | ✓ |
| d | SQL vist først | Hvert script **vises i chatten, før det køres**, og køres først efter dit ja (kolonnen "Vist i chat" nedenfor). Ændrede/nye i dag: `2a`, `4a`, `00b` | ✓ rettet: reglen er nu et trin i tabellen |
| e | Færdig beskedtekst til chaufførerne | "Færdig besked til hver chauffør" (rettet til WhatsApp/SMS: *slet den gamle besked med dit gamle link*) | ✓ |

## Hvad der skal til teknisk

| Hvad | I dag | Ændring |
|---|---|---|
| Ejer-kode | `config` har primærnøgle på `n` → kun én `owner_token` | Primærnøglen erstattes af en unik nøgle på `(n, v)`. To forskellige ejer-koder kan stå side om side. **Ingen funktion ændres** (alle tjek er `exists (… v = p_token)`). |
| Chauffør-token | Én kolonne `satser.token` | Ny tabel `chauffor_tokens` (lukket for API'et). `hent_kvittering` og `hent_ture` slår op i begge steder. Kun opslaget ændres. |
| Lønberegning | | **Urørt** (`v_lonseddel`, `v_afregning`, `v_data`, `satser`). Testen sammenligner lønsedler før og efter hele forløbet. |

Filer (alle på branchen, intet kørt):
- `supabase/pending/20260930120000_chauffor_tokens.sql` — migration (nøgle + tabel + de to funktioner). Nødplan: `supabase/tilbagefoering/20260930120000_chauffor_tokens.sql`.
- `supabase/tokens/00_foerstetjek.sql` … `6_ryd_op_sikkerhedskopi.sql` — selve skiftet, ét script pr. trin.
- `supabase/tilbagefoering/20260930_tilbage_ejer_kode.sql` og `…_tilbage_chauffoer_koder.sql` — åbner de gamle koder igen.
- `tests/sql/tokens_skift.test.mjs` — spiller hele forløbet igennem på en testdatabase (62 tjek).

## Rækkefølge

Ejeren kører SQL i SQL Editor. Claude skriver, tester og viser SQL først.

| # | Trin | Script | Effekt for brugere | Efter trinnet testes |
|---|---|---|---|---|
| A | Første tjek (kun læsning) | `00_foerstetjek` og `00b_config_og_funktioner` | Ingen | Forventet: 1 ejer-kode, alle chauffører har token, ingen dubletter; `config` har kun `owner_token`; ingen uventet funktion skriver til `config`. Resultatet (kun navne og antal) sendes til Claude |
| B | Migration (overlap muligt) | `pending/20260930120000_chauffor_tokens` | Ingen (gamle koder virker uændret) | Dashboard og en kvittering virker som før |
| C | Kopi af gamle tokens | `0_sikkerhedskopi_gamle_tokens` | Ingen | Viser kun antal (1 ejer + alle chauffører) |
| D | **Ejer:** ny kode ved siden af den gamle | `1_ejer_opret_ny_kode` | Ingen (begge virker) | `config` har 2 ejer-koder |
| E | **Ejer:** hent nyt dashboard-link som CSV | `2a_hent_ejer_link` (ret adressen) | Ingen | Åbn linket: alle tal som før. Flyt bogmærker/ikoner til det nye link |
| F | **Ejer:** sluk den gamle kode | `3_ejer_sluk_gammel_kode` | **Gamle ejer-links holder op** (se nedenfor) | Nyt link virker; gammelt viser "Ejer-koden i linket gav ingen data" |
| G | **Chauffør 1** (ét navn ad gangen): ny kode ved siden af | `4_chauffoer_opret_ny_kode` | Ingen | Kvittering med gammelt link virker stadig |
| H | Hent link og færdig besked som CSV | `4a_hent_chauffoer_link` | Ingen | Ejeren sender beskeden; chaufføren bekræfter, at det nye link virker |
| I | Sluk chaufførens gamle kode (efter få dage) | `5_chauffoer_sluk_gammel_kode` | **Chaufførens gamle link holder op** | Nyt link virker; gammelt giver tom kvittering |
| J | Gentag G–I for næste chauffør | | | |
| K | Oprydning (tidligst en uge efter sidste sluk) | `6_ryd_op_sikkerhedskopi` | Gamle links kan ikke åbnes igen | |

**Regler for hvert trin:** (1) Claude viser scriptet i chatten. (2) Du svarer ja. (3) Du kører det i SQL Editor. (4) Du siger "virker / virker ikke". Ingen scripts kører i bunker.

**Spærre, før trin F (sluk den gamle ejer-kode) må køres:**
1. Nyt dashboard-link er set virke på computer **og** telefon (svar: virker / virker ikke). *Dashboardet er testet med `?k=` (gammel kode) efter PR #6; testen med den NYE kode mangler.*
2. Resultatet af `00b_config_og_funktioner` er sendt, og ingen uventet funktion bruger ejer-koden (Make bruger den ikke, ejerens oplysning 3/10).
3. Du har rettet `OWNER_TOKEN` i din egen terminal, hvis du bruger `scripts/omsaetning-bagud` (det bruger ejer-koden).

Anbefalet tempo: ejer-koden skiftes og slukkes **samme dag**, når det nye link er set virke, fordi den gamle kode giver fuld læse-
og skriveadgang og stadig ligger i git-historikken. Chauffører: ét navn ad gangen, gammelt link slukkes, når chaufføren har
bekræftet det nye.

### Sikringer i scripts
- Sluk af ejer-koden **stopper uden ændring**, hvis der ikke findes en anden ejer-kode (du kan ikke låse dig selv ude).
- Hvert script stopper uden ændring, hvis kopien af de gamle tokens (trin C) mangler.
- Nye koder kan ikke oprettes to gange; slukning for en chauffør kræver præcis ét nyt link.
- Koderne er 64 hex-tegn fra to tilfældige uuid'er; scripts indeholder ingen token-værdier (testen tjekker det).

### Tilbageføring (med det samme)
- Ejer: `tilbagefoering/20260930_tilbage_ejer_kode.sql` — den gamle kode virker igen, den nye også.
- Chauffør: `tilbagefoering/20260930_tilbage_chauffoer_koder.sql` — ret navnet, eller skriv `alle`. Gammelt link virker igen, nyt også.
- Migrationen: `tilbagefoering/20260930120000_chauffor_tokens.sql` (stopper, så længe der er to ejer-koder).
- Kopien ligger i `sikkerhed_backup.tokens_gamle_20260930` (ikke nået af API'et) og bevares, til trin K.

## Hvad holder op med at virke — præcist

**Når den gamle ejer-kode slukkes (trin F):**
1. Hvert dashboard-link eller bogmærke, der slutter på `?k=` + den gamle ejer-kode: på computer, på telefon, som hjemmeskærms-ikon, og i
   beskeder/mails, hvor du har gemt linket til dig selv.
2. Dashboard-adressen **uden** `?k=` er **allerede stoppet** (PR #6 merget 3/10): den viser kun "Linket mangler ejer-koden". Efter trin F ville selv en gammel udgave få tomme data.
3. Gemte kopier af `dashboard.html` på en computer (filen indeholder den gamle kode).
4. Din egen kopi af `scripts/omsaetning-bagud` (miljøvariablen `OWNER_TOKEN`), hvis du bruger den.
5. Make: **ingen virkning** (ejerens oplysning 3/10: alle HTTP-moduler skriver med `service_role` og har ingen ejer-kode i body). `00b` viser, hvad databasen selv siger.

**Holder ikke op:** upload-siden `index.html` (`?driver=…`), Makes adgang (service_role), chaufførernes kvitteringslinks (skiftes hver for sig),
og det nye ejer-link.

**Når en chaufførs gamle kode slukkes (trin I):** hvert `kvittering.html?k=…` med den gamle kode for netop den chauffør: bogmærker, hjemmeskærms-
ikoner og de gamle WhatsApp/SMS-beskeder i jeres chat (de kan ikke trækkes tilbage; **slukningen af den gamle kode er det, der tæller**).
Andre chauffører og upload-siden berøres ikke. De nye links sendes samme vej (WhatsApp/SMS), én besked pr. chauffør, kun med hans eget link.

## Færdig besked til hver chauffør

Scriptet `4a_hent_chauffoer_link` laver den færdigt med navn og link i CSV-filen (kolonnen `besked`). Teksten:

```
Hej <navn>!

Du har fået et nyt, personligt link til din afregning:
<nyt link>

Gem det nye link, og slet den gamle besked med dit gamle link i vores chat – også hvis du har det som ikon på hjemmeskærmen. Det gamle link bliver lukket om få dage.
Send ikke linket videre til andre – det viser din løn.

Hilsen Fahad
Taxi & Flex 22 ApS
```

## Svar fra ejeren (3/10-2026) og hvad der stadig mangler
1. **Netlify-adresse:** `superb-daffodil-ca45c8.netlify.app` — indbygget i `2a` og `4a` (adressen er ikke hemmelig).
2. **Make:** bruger `service_role`, ingen ejer-kode i body, skriver ikke til `config` (ejerens oplysning). **Mangler:** resultatet af `00b` (kun navne og antal) som bekræftelse fra databasen.
3. **Chaufførernes links:** sendt via WhatsApp og SMS; de nye sendes samme vej. De gamle ligger i chatten og kan ikke trækkes tilbage, så trin I (slukning) er det, der tæller.
4. **0.1 og merge:** gjort (PR #6, 3/10). **Svar mangler:** er dashboardet testet med `?k=` efter merge (ja/nej)? Og senere med det NYE link (spærren før trin F).
5. **Hygiejne:** koderne hentes kun på ejerens egen computer, sendes ikke videre, hver chauffør får kun sit eget link, filen slettes bagefter. Koder står aldrig i chat, PR eller commit.

**Læg mærke til:** hvis en chauffør har sendt sit link videre eller har det i en gruppe-chat, ændrer den nye kode intet for dem, der allerede har det gamle, før trin I.
