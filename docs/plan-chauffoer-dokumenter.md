# Plan: chauffør-dokumenter med udløbsdato

Status: **plan, ikke godkendt. Intet er bygget, ingen SQL er kørt.** Skrevet 3/10-2026. Hører til Fase 2 i `docs/byggeplan.md`.

**Mål:** at du aldrig opdager for sent, at en chaufførs kørekort, førerkort, børneattest eller straffeattest er udløbet eller for gammelt. Systemet gemmer **kun datoer og status**, viser trafiklys i dashboardet og sender påmindelser. Det er **kun en advarsel**: det blokerer aldrig løn, upload eller kvittering.

**Rører ikke:** lønberegningen (`v_data`, `v_afregning`, `v_lonseddel`, `satser`), `kvittering.html`, `index.html`, Make, de eksisterende dashboard-funktioner. Alt er nyt og ligger ved siden af.

---

## 1) Hvad der gemmes (og hvad der aldrig gemmes)

| Gemmes | Gemmes ikke |
|---|---|
| Dokumenttype, **gyldig til**-dato, **kontrolleret dato**, **kontrolleret af** (navn), kort **note** | CPR-nummer, dokumentnummer, billeder/PDF (som standard), indholdet af en attest, om en attest "var ren" |
| Hvem der ændrede hvad og hvornår (ændringslog) | Noget om selve afgørelser i en straffeattest eller børneattest |

Note-feltet er højst 200 tegn og har en synlig tekst: *"Skriv ikke oplysninger om indholdet af dokumentet."* For straffeattest og børneattest er note-feltet **slået fra** (se GDPR-punkt 3).

## 2) Dokumenttyper pr. virksomhed

Tabel `dokumenttyper` (en række pr. virksomhed og type), med `virksomhed_id` fra start.

| Standardtype | Regel | Forslag |
|---|---|---|
| Kørekort | **udløbsdato fra dokumentet** | `gyldig til` = datoen på kortet |
| Førerkort (taxa) | **udløbsdato fra dokumentet** | samme |
| Børneattest | **højst X måneder gammel** | X = 12 (ejeren bekræfter) |
| Straffeattest | **højst X måneder gammel** | X = 12 (ejeren bekræfter) |

- Reglen er enten `udloeb` (brug `gyldig til` fra dokumentet) eller `max_alder` (udløb = **kontrolleret dato + X måneder**, hvor X står på typen).
- Ejeren kan slå en type fra for hele virksomheden og tilføje egne typer (fx "ADR-bevis", "Lægeerklæring"). Navnet er fri tekst, højst 60 tegn.
- Pr. chauffør kan en type markeres **"gælder ikke"** (fx børneattest for en chauffør, der ikke kører børn). Så er den grå, ikke rød.

## 3) Pr. chauffør og type

Tabel `chauffoer_dokumenter_log` (kun tilføjelser, samme mønster som `kontrol_log` og `chauffoer_biler_log`): chauffør, type, `gyldig_til`, `kontrolleret_dato`, `kontrolleret_af`, `note`, `gaelder_ikke`, `hvem`, `tidspunkt`, `virksomhed_id`. **Nuværende tilstand = den seneste række** pr. (chauffør, type). Intet overskrives, så **ændringsloggen og Fortryd er gratis**: en fortrydelse er en ny række med de gamle værdier.

Chaufførlisten kommer fra `satser` (inkl. afløsere som Abdikarin). Chauffører uden for lønsystemet kan ikke registreres, før du siger til (åbent punkt A).

## 4) Status: rød / gul / grøn / grå

Beregnes **ét sted, i databasen** (funktionen leverer status, dashboardet viser den bare), på dansk dato (Europe/Copenhagen):

| Farve | Betydning |
|---|---|
| 🔴 rød | udløbet (efter `gyldig_til`, eller kontrolleret dato + X måneder er passeret) |
| 🟡 gul | udløber inden for 60 dage |
| 🟢 grøn | gyldig, og der er mere end 60 dage til |
| ⚪ grå | ikke registreret endnu (mangler), eller sat til "gælder ikke" |

"Mangler" er grå i første omgang, så dashboardet ikke starter med at lyse rødt for noget, der blot ikke er indtastet. Hvis du hellere vil have mangler som rød, er det én linje (åbent punkt B).

## 5) Dashboard-kort "Dokumenter"

- Et nyt kort, **skjult bag `?dokumenter=1`** til at begynde med (intet bygges direkte i drift), senere altid synligt. De eksisterende kort er uændrede.
- Tabel: chauffør × dokumenttype, hver celle en farve med dato ("gyldig til 14/3-2027"), sorteret med det mest presserende øverst.
- **Filter pr. chauffør** og pr. farve. Tæller øverst: "2 røde · 1 gul".
- Knap **Registrer / forny** pr. celle: dato(er), kontrolleret af (forudfyldt med dit navn), note. Knap **Fortryd** på den seneste ændring.
- Ingen billeder, ingen fil-upload i kortet (se punkt 7).

## 6) Påmindelser pr. e-mail

- Ved **60, 30 og 14 dage** før udløb og **på udløbsdagen** (rød), kun én mail pr. tærskel pr. dokument.
- Genbruger den **daglige mail**, der er planlagt i Fase 2 (Resend). **Den findes ikke endnu.** Indtil den er bygget, er påmindelser kun dashboardkortet. Bygges mailen først, kobles dokumenterne på som én ekstra sektion.
- Databasen leverer en funktion `dokumenter_der_skal_varsles(p_token)`, der kun siger *hvilke* dokumenter der krydsede en tærskel i dag, plus en tabel `dokument_varsler` (hvad der er sendt, så der ikke sendes dobbelt). Selve afsendelsen sker i den daglige mail.
- Mailen indeholder **navn + dokumenttype + dato**, aldrig noget om indholdet (se GDPR-punkt 6).
- **Aldrig blokering:** ingen kontrol i `kontroller.js`, ingen kobling til lønnen, ingen kobling til upload af slutrapporter.

## 7) Fil-upload: kun som indstilling, slået fra

- Indstilling `filer_slaaet_til` pr. virksomhed, **standard: nej**. Er den nej, findes der ikke noget upload-felt og ingen bucket til formålet.
- Hvis du slår den til: **privat bucket** `chauffoer-dokumenter` (ingen offentlig URL, kun tidsbegrænsede links til ejeren), og en funktion `slet_dokumentfiler(p_token, p_chauffor)` kører, **når chaufføren stopper**.
- **Dette bygges ikke nu** (åbent punkt C), men tabellerne forbereder det (`fil_sti` findes ikke før da).

## 8) Sikkerhed og drift

- **Alle nye tabeller har RLS slået til uden politikker og `revoke all` fra `anon` og `authenticated`.** Kun `security definer`-funktioner kommer ind, og **alle kræver ejer-koden** (`config.owner_token`), som i resten af systemet.
- Funktioner (navne): `hent_dokumenttyper`, `saet_dokumenttype`, `hent_dokumenter`, `saet_dokument`, `fortryd_dokument`, `dokumenter_der_skal_varsles`.
- `virksomhed_id` er med fra første række. **Afhængighed:** tabellen `virksomheder` hører til trin 1.1 og findes ikke endnu. Forslag: den første dokument-migration bruger `virksomhed_id integer not null default 1` uden fremmednøgle, og 1.1 tilføjer fremmednøglen (åbent punkt D).
- Ændringer: dokument-loggen *er* ændringsloggen for dokumenter og vises i kortets historik. Den eksisterende "Seneste ændringer" (kun slutrapporter) bevares uændret; en fælles visning kan tilføjes senere.

## 9) Test (før noget køres)

- **SQL (PGlite, som de øvrige):** RLS slået til, `anon` kan hverken læse eller skrive tabellerne, forkert/tom ejer-kode giver intet/en fejl, status-grænser (60 dage præcis, udløbsdagen, `max_alder` med måneds-overgang, skudår), idempotens, fortryd, "gælder ikke", note-længde, tilbageføring genskaber funktioner.
- **Enhed/browser:** kortet viser de fire farver, filteret, Registrer/forny, Fortryd, mobilvisning på 360 px, og at **løn, upload og kvittering er uændrede** (samme tal før og efter).
- Intet af det rører lønberegningen; en FØR/EFTER-test sammenligner `v_lonseddel` før og efter migrationen.

## 10) Byggerækkefølge (hver gang: SQL vises først, du godkender, jeg tester, du kører)

1. Migration: tabeller + funktioner + tilbageføring (vises i chat).
2. Dashboard-kort bag `?dokumenter=1` + tests.
3. Du registrerer de første dokumenter; vi justerer farver/grænser ud fra virkeligheden.
4. Mail-sektion, når den daglige mail findes.
5. Fil-upload kun hvis du beder om det, og kun efter juristens svar.

---

## GDPR-punkter, du bør have en jurist til at vurdere
*(Jeg er ikke jurist. Det her er spørgsmål, ikke svar.)*

1. **Straffeattest og børneattest er følsomme.** Må en arbejdsgiver registrere *at* en attest er indhentet og dens dato, og hvilken hjemmel gælder (lovkrav i taxa-lovgivningen/tilladelsen, børneattestlovens samtykke, andet)? Er selve datoen "oplysninger om straffedomme og lovovertrædelser"?
2. **Retsgrundlag pr. type:** retlig forpligtelse, legitim interesse eller samtykke? Er samtykke gyldigt i et ansættelsesforhold?
3. **Dataminimering:** er det nok at gemme "kontrolleret dato + gyldig til" og aldrig resultatet/indholdet? Skal note-feltet slås helt fra for attester (forslag: ja)?
4. **Sletning og opbevaring:** hvor længe må datoerne gemmes efter, at chaufføren er stoppet? Min log er kun-tilføjelser; en sletning for en chauffør kræver en bevidst undtagelse (`slet_dokumenter_for`), som juristen skal godkende, og som ikke må ødelægge revisionsloggen.
5. **Hvem må se det:** kun ejeren (ja, via ejer-koden). Må en revisor eller en medarbejder se status? Kræver det adgangsstyring og logning af opslag?
6. **Påmindelser pr. e-mail:** personnavn + "straffeattest udløber" i en mail er en personoplysning i en ukrypteret kanal. Skal teksten være neutral ("et dokument udløber, se dashboardet")? Hvilke e-mail-leverandører (Resend) kræver databehandleraftale?
7. **Databehandlere:** Supabase og evt. Resend skal have databehandleraftale, og placering (EU) skal dokumenteres.
8. **Chauffører uden for lønsystemet / afløsere / underleverandører:** er de dine ansatte eller et andet firmas? Må du registrere deres dokumenter?
9. **Information til chaufførerne:** skal de orienteres (art. 13), og må de se egne data (indsigt, rettelse)? Skal kvitterings-siden vise dem deres egen status?
10. **Fil-upload (hvis det slås til):** privat opbevaring, sletning ved fratræden, og om billeder af attester overhovedet må opbevares.
11. **Salgsversionen (Fase 3):** her er du databehandler for andre vognmænd. Databehandleraftale, instruks, og hvem der er ansvarlig for hvilke data.

## Åbne punkter til dig
| # | Spørgsmål | Min anbefaling |
|---|---|---|
| A | Skal chauffører uden for lønsystemet kunne registreres? | Nej i første omgang (listen kommer fra `satser`) |
| B | "Mangler" = grå eller rød? | Grå, til de første dokumenter er indtastet |
| C | Fil-upload: ikke nu? | Ikke nu |
| D | `virksomhed_id` som `integer default 1` uden fremmednøgle, til 1.1 findes? | Ja |
| E | Børne-/straffeattest: X = 12 måneder? | Ja, du bekræfter |
| F | Note-felt slået fra for børne- og straffeattest? | Ja |
| G | Kortet bag `?dokumenter=1` først? | Ja |
| H | Påmindelser: kun dashboard, til den daglige mail findes? | Ja |
