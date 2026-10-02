# Plan: kilde-uafhængig indlæsning (erstatter Make)

Godkendt af ejeren 2026-09-29. Byg i små trin; al SQL vises før den køres; `tests/` køres før og efter
hver ændring (også automatisk i GitHub Actions ved hver PR).

**Mål:** ingen forkert løn må nogensinde godkendes automatisk, og alt der kan kontrolleres automatisk,
kontrolleres automatisk. Systemet skal kunne sælges til vognmænd, der kører for forskellige
kørselskontorer (Dantaxi, DRIVR, Taxa 4x27, 4x35, Uber m.fl.).

**Rør ikke:** lønberegningens regler (satser, trappe, 50/50), dashboardets eksisterende funktioner,
`kvittering.html`. `slutrapporter` udvides (erstattes ikke). `v_data`/`v_afregning`/`v_lonseddel`
ændres kun i trin 2, med FØR/EFTER-tal.

## Arkitektur
```
index.html ──► Edge Function "modtag-slutrapport"
                 ├─ /analyser: token → gem billede → klassificér (kilde fra overskrift, bontype) → adapter[kilde].udtraek → kontroller → forslag til chaufføren
                 └─ /bekraeft: chaufføren siger "Ja" → række i slutrapporter med status
        adapter (én pr. kilde)        kerne (fælles, kilde-uafhængig)
        - OCR-prompt + JSON-skema      - dublet (kilde + taxi_nr + nr, og samme billede)
        - kildens egne kontroller      - datovindue, nummerrække pr. bil
        - eksempler + testsæt          - status: godkendt / til_godkendelse / afvist
                                       - log af hver indlæsning
```
- Normaliseret vagt: kilde, taxi_nr, slutrapport_nr, dato (vagt start), vagt_slut_dato, vagt_start, total_dkk, antal_ture_kumulativt, taxameter_dkk, fastpris_dkk (tællere til omsætningskontrollen),
  vagt_slut, indkort, overfort, bro_faerge, afregn + `raa_data` (kildens originale felter). Dertil:
  `chauffor_id` (CHAUFFØR-nr på bonen) og de valgfrie `pause_tid` og `arbejdstid` (gemmes som minutter; tomme, når bonen ikke har dem).
  Bontype (`endelig` / `foreloebig` / `ukendt`) hører til indlæsningen, ikke til vagten: kun endelige boner kan blive til en vagt.
- Adapter-mappe pr. kilde (`adapters/dantaxi/`): `prompt.md`, `skema.json`, `kontroller.ts`, `eksempler/`,
  testsæt. Ny kilde = ny mappe + række i `kilder`. CSV/API får samme grænseflade som foto og foretrækkes.
- Intet forsvinder: ubekræftede uploads (> 2 t) → "Til godkendelse"; alle forsøg logges.
- `afvist` kun ved dublet, helt ulæseligt billede eller foreløbig bon (med tydelig besked til chaufføren); alt andet med fejlet kontrol → `til_godkendelse`.
- **Flere kilder, kun Dantaxi bygges.** Designet bærer flere kørselskontorer (Taxi 4x27, DRIVR m.fl.), men der bygges ingen adapter til dem nu.
  En bon, hvis overskrift hører til en kilde uden adapter, bliver ikke forsøgt udtrukket som Dantaxi, men sendt til `til_godkendelse`
  med billedet og beskeden "kilde ikke understøttet endnu".
- **Klassificér først, udtræk bagefter.** Første trin læser kun overskriften (kilde) og bontype. Først derefter vælges adapteren, så en
  anden kildes bon aldrig fortolkes med Dantaxis skema. Så længe der kun findes én adapter, kan de to trin være ét kald med to ekstra felter,
  men kilden og bontypen kontrolleres altid, før resten af svaret bruges.
- **Chauffør og kilde er kobling, ikke bil.** Tabellen `chauffoer_kilder` (chauffor, kilde, chauffor_id) siger, hvilke kilder en chauffør
  bruger, og hvilket CHAUFFØR-nr chaufføren har dér. Nummeret er pr. kilde (samme chauffør kan have forskellige numre hos forskellige
  kontorer). Den har intet med bilen at gøre (beslutning 9).
- Satser pr. kilde designes (ikke bygget). `virksomhed_id` på nye tabeller og `slutrapporter`.

## Kontroller (Dantaxi)
| Kontrol | Fejler → |
|---|---|
| **kilde:** overskriften på bonen (DANTAXI, Taxi 4x27 …) slås op i `kilder.overskrifter` og sammenlignes med chaufførens kilde(r) i `chauffoer_kilder`. Passer den ikke til nogen af chaufførens kilder, eller kendes overskriften ikke, eller kan den ikke læses → intet gættes | til_godkendelse |
| **bontype:** `foreloebig` afvises med beskeden "Det her er en foreløbig slutrapport. Upload den endelige, når vagten er afsluttet." Foreløbige boner gemmes ikke som vagt og optager aldrig dublet-nøglen. `ukendt` (kan ikke afgøres) auto-godkendes aldrig | afvist (foreløbig) / til_godkendelse (ukendt) |
| **dato:** læses af datoparseren (se nedenfor). Tvetydig dato, hvor kilden ikke har fastlagt formatet, eller en dato der ikke kan læses | til_godkendelse |
| konto + kreditkort + kredit ekstra = overført | til_godkendelse |
| indkørt − overført − bro = afregn | til_godkendelse |
| vagt_slut_dato = dato eller dato + 1 | til_godkendelse |
| dato inden for 60 dage, ikke i fremtiden | til_godkendelse |
| nr 3–5 cifre, starter ikke med 0 | til_godkendelse |
| nr passer til bilens nummerrække. Bilen er `taxi_nr` **aflæst fra bonen**; nummeret sammenlignes med **alle chaufførers** vagter i samme bil (±10 dage, højst 50 fra nærmeste nummer, taxameteret tæller kun op) — aldrig kun med den aktuelle chaufførs egne vagter. Ny bil uden historik → altid manuel | til_godkendelse |
| **omsætning mellem boner:** for to boner i samme bil er ΔTOTAL DKK = taxameter + fastpris for den senere bon (+ vagterne imellem). Kroner til overs → "vagt mangler" med beløb; hul i nummer med 0 kr imellem er en tom vagt (ikke fejl); TOTAL der falder, eller numre i rækkefølge hvor tallene ikke passer → afvigelse. Kræver tællerne fra bonen | til_godkendelse (afvigelse); tom vagt er ok |
| **anden bil end standard** (chaufførens standardbil ≠ bilen fra bonen/nummerrækken) er en markering, ikke en fejl | markering (ingen afvigelse) |
| **nummer = VDT(Tk)-tallet** på bonen (fx 2285, 2303) er en kendt OCR-fejl: bonens VDT(Tk) læst af OCR og lig slutrapport-nr (`vdt_tk`), eller et nummer i VDT-intervallet uden nabo inden for 50 | til_godkendelse |
| dublet: kilde + taxi_nr + nr — **uden chauffør**, så samme bon ikke kan ligge hos to chauffører (samme nøgle som den unikke nøgle i databasen) | afvist |
| et nummer skal have en nabo (±50) i samme bil; bilen er `taxi_nr` fra bonen. Fx nr 1850 på en bon med taxi_nr 001-7144 fejler, hvis vagterne omkring 1850 er kørt i 001-8208. Ingen faste blokke | til_godkendelse |
| samme billede uploadet igen (fingeraftryk af filen) | afvist |
| vagt slut før upload, og upload senest 48 t efter vagt slut | til_godkendelse |
| FØRER-navnet på bonen identificerer chaufføren og **sammenlignes med chaufførens link** (den chauffør, der uploadede). Afvigelse giver `til_godkendelse`. Kontrolleres **kun når navnet står på bonen**: mangler linjen (KOPI-bon), er det ikke en fejl | til_godkendelse |
| **CHAUFFØR-nr** (`chauffor_id`; kolonne `bekraeftet` i `chauffoer_kilder`: Adan og Fuad er ikke bekræftet, kun set på én bon; en afvigelse på et ikke bekræftet nummer giver kun `til_godkendelse` og aldrig afvisning; numrene ligger kun i databasen og kontrolleres kun på serveren) på bonen sammenlignes med den chauffør, der uploadede (nummeret i `chauffoer_kilder` for bonens kilde). Afvigelse giver `til_godkendelse`. Kontrolleres **kun når nummeret står på bonen**. Hvis FØRER-navn og CHAUFFØR-nr begge står der og peger på hver sin chauffør, vises begge afvigelser | til_godkendelse |
| rimelige beløb | til_godkendelse |
| **vagtlængde** regnes på `arbejdstid`, når den står på bonen, ellers på brutto (vagt_start → vagt_slut, med slutdato). Øvre grænse er 20 t i begge tilfælde (ejerens beslutning 2/10; før 16 t), nedre 3 t. Arbejdstid større end brutto fejler. Mangler pause/arbejdstid, er det ikke en fejl | til_godkendelse |
| *(forslag)* hvis både pause_tid, arbejdstid og brutto står på bonen: arbejdstid + pause = brutto (±5 min) | til_godkendelse |

"Forkert auto-godkendelse" = mindst ét af chauffør, taxi_nr, nr, dato, indkørt, overført, bro eller afregn
afviger fra facit. Afvigelse på chauffor_id, kilde eller bontype tæller også.

## Første udgave af kontrollerne (bygget 2/10-2026)
Dashboardets "Kontrol af måneden" kører allerede kontrollerne som ren kode i `site/kontroller.js` (samme nøgle-, overlap-, diff-, længde- og hul-logik
som SQL'en `supabase/forespoergsler/kontrol_maaned.sql`; en test kræver ens fund). Funktionen `Kontroller.tjekNy(ny, eksisterende)` kører de samme
kontroller på en NY vagt og skal genbruges i `modtag-slutrapport` (trin 3–4) i stedet for at skrive dem om. Parametrene (nummerområder, grænser for
difference og vagtlængde, overlap-tolerance) står ét sted (`Kontroller.STANDARD`). Kontrollen foreslår kun; rettelser går gennem Ret / Udfyld og godkend.
**Områdetjekket bruger naboer, ikke faste 100-blokke** (3/10-2026): to numre er i samme række (bil), når de højst er 50 fra hinanden (kæde af
naboer); et nummer uden nogen anden vagt (hos nogen chauffør) inden for 50 er "uden for bilernes rækker". Det retter, at 1095–1098 blev fejlmarkeret og hullet
1099–1100 skjult. Når bonens `taxi_nr` er læst, sammenlignes kun inden for samme bil. Et ensomt nummer i 2200–2399 (intervallet er et skøn ud fra 2285 og 2303 og rettes i
`Kontroller.STANDARD`) markeres som **VDT(Tk)-tallet** læst som slutrapport-nr (en kendt OCR-fejl), og er bonens VDT(Tk) læst som `vdt_tk` og lig nummeret, markeres det altid.
**Huller i nummerrækken er spørgsmål, ikke fejl** (3/10-2026): bilerne kan køres af chauffører uden for lønsystemet. Dashboardet viser hullet i eget afsnit "Mangler der en bon?" med nabovagterne
(nr, chauffør og dato før og efter), og hvert manglende nummer kan markeres "kendt hul – OK" (nøgle `hul_nr|<nr>`, gemmes som øvrige OK-markeringer). Et hul må aldrig sende en ny bon til `til_godkendelse`
(`tjekNy` markerer det `spoergsmaal: true`).
De faste blokke (11xx/16xx/18xx) bruges kun til at udfylde taxi_nr på gamle rækker (engangs, i 1.1) – ikke til beslutning 15 og ikke til nogen kontrol.
Der er endnu ikke bygget: kilde, bontype, CHAUFFØR-nr, FØRER-navn, datoparser, dublet på billede og uploadtidspunkt (kræver selve indlæsningen).

## Datoparser (design; bygges i trin 3 som ren funktion med enhedstests)
Bonens datoer kan stå i flere formater, og formatet kan være forskelligt fra kilde til kilde. Parseren returnerer `{dato, format, tvetydig}`
eller en fejl, aldrig en gætning.

| Format | Eksempel | Bemærkning |
|---|---|---|
| åååå-mm-dd | 2026-09-06 | ISO |
| åååå-dd-mm | 2026-06-09 | findes på nogle boner |
| dd-mm-åååå, dd.mm.åååå, dd/mm/åååå | 06.09.2026 | |
| dd/mm/åå, dd.mm.åå | 06/09/26 | tocifret år: 20åå |
| dato med månedsnavn | 6. sep 2026, 6 SEP 26 | danske og engelske forkortelser |

Regler:
1. **Hver kilde fastlægger sine formater** i adapteren (`kilder.datoformater`, i prioriteret rækkefølge). Parseren prøver kun dem.
2. **Tvetydighed:** hvis både dag og måned er ≤ 12 (06-09 kan være 6/9 eller 9/6), og kilden ikke har fastlagt præcis ét format, er datoen `tvetydig`
   → `til_godkendelse`. Gælder især åååå-dd-mm mod åååå-mm-dd.
3. **Datovinduet afgør, når kun én tolkning er mulig:** ligger kun én tolkning inden for 60 dage og ikke i fremtiden, bruges den, og valget logges. Ligger begge i vinduet, men er forskellige → `til_godkendelse`.
4. Ugyldige datoer (31/2, måned 13, år uden for 2020–2099) er fejl. OCR-fejl i året (fx 2023 i stedet for 2026) fanges af datovinduet.
5. Formatet, der blev brugt, gemmes i `indlaesninger` og `raa_data`, så en forkert tolkning kan spores bagefter.

## Trin
0. **Tests og testmiljø** — `tests/` + GitHub Actions; separat gratis Supabase-projekt til test.
1. **Database (kun tilføjelser)** — kolonner på `slutrapporter` (kilde, taxi_nr, status, kontroller,
   raa_data, billede_sti, indlaesning_id, virksomhed_id, chauffor_id, pause_min, arbejdstid_min, total_dkk, ture_kum, taxameter, fastpris); tabeller `kilder` (inkl. `overskrifter` og
   `datoformater`), `chauffoer_kilder` (chauffor, kilde, chauffor_id), `taxier`, `indlaesninger` (inkl. bontype og brugt datoformat),
   `virksomheder`; **unik nøgle (kilde, taxi_nr, slutrapport_nr) uden chauffør**, hvor taxi_nr er udfyldt, så samme bon ikke kan
   ligge hos to chauffører (som nr 1112 hos både Adan og Fuad i september). Indsættelse og `opret_slutrapport` tjekker dublet på samme
   nøgle. Nøglen oprettes **først**, når der ikke er samme bon hos to chauffører: forespørgsel
   `taxi_nr_4_samme_bon_hos_flere_chauffoerer.sql` viser alle par, og migrationen starter med en vagt
   (`taxi_nr_5_vagt_foer_unik_noegle.sql`), der stopper med en tydelig fejl, hvis der stadig er nogen (intet ændres da).
   Den gamle nøgle (chauffør, nr) bevares, indtil gamle rækker har fået taxi_nr; taxi_nr på gamle
   rækker ud fra **nummerområdet** (11xx = 001-7144, 16xx = 001-8646, 18xx = 001-8208), aldrig ud fra chaufføren,
   da alle chauffører kan køre alle biler. Rækker med et nummer uden for de tre områder vises for ejeren først og
   rettes manuelt; intet køres før listen er godkendt.
2. **Lønberegning** — kun `status = 'godkendt'`; kontant = afregn = indkørt − overført − bro;
   **udbetaling = andel − afregn** (bro trækkes ikke fra igen). FØR/EFTER pr. chauffør for 2026-09 først.
3. **Kontroller som ren kode** med enhedstests (18/19, 5/6, 6/8, 3/8, VDT 2303, taxi "001", KALIB-år, afskåret, datoparser med alle formater og tvetydighed,
   kilde mod chaufførens kilde, CHAUFFØR-nr mod uploader, foreløbig/endelig bon, vagtlængde på arbejdstid og brutto).
4. **Edge Function `modtag-slutrapport`** (Dantaxi) — OpenAI structured outputs (strict), nøglen kun som
   secret; billede i `slutrapport-billeder` som `dantaxi/{taxi_nr}/{åååå-mm}/{id}.jpg`; kun test-projektet;
   OCR-test på ca. 20 rigtige boner (krav: 0 forkerte auto-godkendelser).
5. **Skærme** (se også `docs/plan-scan-foer-send.md`: lag 1 lokal billedtest, lag 2 `/analyser`) — index.html bekræft-trin ("Ja, send" / "Nej, tag nyt billede" / "Send til godkendelse
   alligevel") bag `?ny=1`; dashboard "Til godkendelse" (genbruger "Udfyld og godkend").
6. **Drift** — dagligt job (pg_cron + pg_net) → e-mail via Resend; log af hver indlæsning.
7. **Overgang** — 2 ugers skyggedrift (ny funktion skriver kun til log), daglig sammenligning, skift af
   upload-siden, Make slukkes til sidst.

## Beslutninger (ejeren, 2026-09-29)
1. Bro trækkes ikke fra igen: udbetaling = andel − afregn.
2. "Send til godkendelse alligevel" er okay.
3. Upload senere end 48 t efter vagt slut → `til_godkendelse` (ikke afvist).
4. FØRER-navn kontrolleres kun, når det står på bonen; mangler linjen (KOPI-bon), er det ikke en fejl. Navnet på bonen er det, der identificerer chaufføren.
5. ~~Abdikarins bil~~ — **udgår** (30/9): der er ingen fast bil pr. chauffør, og Abdikarin er afløser uden vagter i september.
6. Resend er okay; modtager-adresse: **mangler** (skal bruges i trin 6).
7. Testbilleder i test-projektets private bucket, ikke i repoet.
8. Salgsversion: privat bucket, tidsbegrænsede links, `OWNER_TOKEN_DEFAULT` fjernes (fjernet fra dashboardet 30/9, punkt 0.3; koden skiftes i punkt 0.2).

## Beslutninger (ejeren, 2026-09-30)
9. ~~**Ingen fast bil pr. chauffør.**~~ **Afløst af beslutning 22 (3/10):** bilerne er faste som udgangspunkt, men en anden bil kan forekomme. (Oprindelig tekst: alle chauffører kan køre alle tre vogne.) Der findes ingen tabel, kolonne eller kontrol, der forudsætter "chauffør → bil".
10. taxi_nr på gamle rækker udfyldes ud fra nummerområdet, ikke ud fra chaufføren.
11. Nummer-kontrollen går på taxi_nr aflæst fra bonen og sammenligner med alle chaufførers vagter i samme bil.
12. FØRER-navnet på bonen identificerer chaufføren; det kontrolleres kun, når det står der.
13. Den unikke nøgle er (kilde, taxi_nr, slutrapport_nr) **uden chauffør**: samme bon kan ikke ligge hos to chauffører.
14. FØRER-navnet på bonen sammenlignes med chaufførens link (uploaderen). Afvigelse giver `til_godkendelse`.
15. Et nummer skal passe til bilens nummerrække: der skal findes en vagt i samme bil højst 50 numre fra (naboer ±50); bilen er `taxi_nr` fra bonen, ellers den række nummeret hører til. Findes ingen sådan nabo, eller ligger naboerne i en anden bil end bonens `taxi_nr`, er nummeret uden for rækken → `til_godkendelse`. Faste nummerblokke (11xx/16xx/18xx) bruges ikke til kontrollen.
16. Den unikke nøgle oprettes først, når der ikke er samme bon hos to chauffører. En læse-forespørgsel (`supabase/forespoergsler/taxi_nr_4_samme_bon_hos_flere_chauffoerer.sql`) viser alle par (samme bil, samme nr, forskellige chauffører), og migrationen starter med en vagt (`taxi_nr_5_vagt_foer_unik_noegle.sql`), der stopper med en tydelig fejl, hvis der stadig er nogen. Intet ændres da.

## Beslutninger (ejeren, 2026-10-02) — design nu, byg ikke 4x27/DRIVR
17. **CHAUFFØR-nr:** bonens felt `chauffor_id` sammenlignes med den chauffør, der uploadede. Afvigelse giver `til_godkendelse`. Kontrolleres kun, når feltet står på bonen.
18. **Pause og arbejdstid:** `pause_tid` og `arbejdstid` er valgfrie felter. "Rimelig vagtlængde" regnes på arbejdstid, eller brutto ≤ 20 t (øvre grænse 20 t, beslutning 2/10).
19. **Kilde:** kilden aflæses af bonens overskrift (DANTAXI, Taxi 4x27 …) og sammenlignes med chaufførens kilde. Afvigelse giver `til_godkendelse`.
20. **Bontype:** `foreloebig` / `endelig`. Foreløbige boner afvises med tydelig besked.
21. **Datoparser:** skal kunne håndtere flere formater (fx åååå-dd-mm), med faste regler for tvetydige datoer (se Datoparser ovenfor).

Kun Dantaxi bygges. De øvrige kilder (Taxi 4x27, DRIVR m.fl.) er kun med i designet.

## Beslutninger (ejeren, 2026-10-03)
22. **Bilerne er faste som udgangspunkt, ikke som regel.** Adan = 001-7144, Fuad og Faysal = 001-8646, Qaalid = 001-8208. En anden bil kan forekomme (fx Adan på 8646 den 3/9). Bilen gemmes pr. chauffør som standard; afvigelse = markering, ikke fejl.
23. **Omsætning mellem boner.** Hver bon aflæses for TOTAL DKK og ANTAL TURE (kumulativt) samt vagtens taxameter og fastpris. For to boner på samme bil skal forskellen i TOTAL = sum af (taxameter + fastpris) for vagterne imellem. Afvigelse → "vagt mangler" med beløb.
    Hul i nummer med 0 kr imellem er en tom vagt, ikke en fejl. Er der kroner til overs, mangler en vagt (mindst så mange kr).
24. **Engangsjob bagud** over alle billeder i Storage (`scripts/omsaetning-bagud`): kun læsning, rapport over hvilke vagter og hvor mange kroner der mangler. Køres af ejeren med egne nøgler; først en prøve på ca. 20 boner.

## Biler
Bilerne er faste **som udgangspunkt pr. chauffør** (standard, ikke regel): Adan 001-7144, Fuad og Faysal 001-8646, Qaalid 001-8208. En anden bil kan forekomme (fx Adan på 001-8646 den 3/9);
de er en **markering**, ikke en fejl. Standardbilen gemmes pr. chauffør (`chauffoer_biler_log`, sidste række gælder) og bruges kun til markeringen. En vagts bil findes ud fra
`taxi_nr` på bonen, ellers ud fra nummerrækken (naboer ±50). Standardbilen bruges ikke til at gætte `taxi_nr` på gamle rækker.

| Taxi nr. | Slutrapport-nr. (nummerområde) |
|---|---|
| 001-7144 | 11xx |
| 001-8208 | 18xx |
| 001-8646 | 16xx |

## Acceptkriterier
- 0 forkerte auto-godkendelser på testsættet og i 2 ugers parallel drift.
- Alle afvigelser lander synligt i "Til godkendelse" — intet forsvinder.
- En ny kilde kan tilføjes ved kun at skrive en adapter + testsæt.

## Fundet undervejs (trin 0)
- Migrationskæden kunne ikke bygge en tom database: baseline oprettede `hent_alle`/`hent_kvittering` før
  `v_lonseddel` (rettet ved at flytte dem), og `20260919220000` indsætter kolonner midt i `v_data`
  (afventer live-definitionen af `v_data`).
- Sikkerhed: `satser` og `slutrapporter` har ikke RLS slået til, og anon har læseadgang til `satser`
  (chaufførernes tokens) og skriveadgang til `slutrapporter`. Anon-nøglen står i dashboard.html.
  Tjekkes mod live og lukkes — før salgsversionen og helst før trin 4.
