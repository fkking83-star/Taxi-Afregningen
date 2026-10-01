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
                 ├─ /analyser: token → gem billede → adapter[kilde].udtraek → kontroller → forslag til chaufføren
                 └─ /bekraeft: chaufføren siger "Ja" → række i slutrapporter med status
        adapter (én pr. kilde)        kerne (fælles, kilde-uafhængig)
        - OCR-prompt + JSON-skema      - dublet (kilde + taxi_nr + nr, og samme billede)
        - kildens egne kontroller      - datovindue, nummerrække pr. bil
        - eksempler + testsæt          - status: godkendt / til_godkendelse / afvist
                                       - log af hver indlæsning
```
- Normaliseret vagt: kilde, taxi_nr, slutrapport_nr, dato (vagt start), vagt_slut_dato, vagt_start,
  vagt_slut, indkort, overfort, bro_faerge, afregn + `raa_data` (kildens originale felter).
- Adapter-mappe pr. kilde (`adapters/dantaxi/`): `prompt.md`, `skema.json`, `kontroller.ts`, `eksempler/`,
  testsæt. Ny kilde = ny mappe + række i `kilder`. CSV/API får samme grænseflade som foto og foretrækkes.
- Intet forsvinder: ubekræftede uploads (> 2 t) → "Til godkendelse"; alle forsøg logges.
- `afvist` kun ved dublet eller helt ulæseligt billede; alt andet med fejlet kontrol → `til_godkendelse`.
- Satser pr. kilde designes (ikke bygget). `virksomhed_id` på nye tabeller og `slutrapporter`.

## Kontroller (Dantaxi)
| Kontrol | Fejler → |
|---|---|
| konto + kreditkort + kredit ekstra = overført | til_godkendelse |
| indkørt − overført − bro = afregn | til_godkendelse |
| vagt_slut_dato = dato eller dato + 1 | til_godkendelse |
| dato inden for 60 dage, ikke i fremtiden | til_godkendelse |
| nr 3–5 cifre, starter ikke med 0 | til_godkendelse |
| nr passer til bilens nummerrække. Bilen er `taxi_nr` **aflæst fra bonen**; nummeret sammenlignes med **alle chaufførers** vagter i samme bil (±10 dage, højst 50 fra nærmeste nummer, taxameteret tæller kun op) — aldrig kun med den aktuelle chaufførs egne vagter. Ny bil uden historik → altid manuel | til_godkendelse |
| dublet: kilde + taxi_nr + nr — **uden chauffør**, så samme bon ikke kan ligge hos to chauffører (samme nøgle som den unikke nøgle i databasen) | afvist |
| et nummer i 11xx, 16xx eller 18xx skal passe til bilens `taxi_nr` (11xx = 001-7144, 16xx = 001-8646, 18xx = 001-8208). Fx nr 1850 på en bon med taxi_nr 001-7144 fejler | til_godkendelse |
| samme billede uploadet igen (fingeraftryk af filen) | afvist |
| vagt slut før upload, og upload senest 48 t efter vagt slut | til_godkendelse |
| FØRER-navnet på bonen identificerer chaufføren og **sammenlignes med chaufførens link** (den chauffør, der uploadede). Afvigelse giver `til_godkendelse`. Kontrolleres **kun når navnet står på bonen**: mangler linjen (KOPI-bon), er det ikke en fejl | til_godkendelse |
| rimelige beløb og vagtlængde (fx ≤ 16 t) | til_godkendelse |

"Forkert auto-godkendelse" = mindst ét af chauffør, taxi_nr, nr, dato, indkørt, overført, bro eller afregn
afviger fra facit.

## Trin
0. **Tests og testmiljø** — `tests/` + GitHub Actions; separat gratis Supabase-projekt til test.
1. **Database (kun tilføjelser)** — kolonner på `slutrapporter` (kilde, taxi_nr, status, kontroller,
   raa_data, billede_sti, indlaesning_id, virksomhed_id); tabeller `kilder`, `taxier`, `indlaesninger`,
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
3. **Kontroller som ren kode** med enhedstests (18/19, 5/6, 6/8, 3/8, VDT 2303, taxi "001", KALIB-år, afskåret).
4. **Edge Function `modtag-slutrapport`** (Dantaxi) — OpenAI structured outputs (strict), nøglen kun som
   secret; billede i `slutrapport-billeder` som `dantaxi/{taxi_nr}/{åååå-mm}/{id}.jpg`; kun test-projektet;
   OCR-test på ca. 20 rigtige boner (krav: 0 forkerte auto-godkendelser).
5. **Skærme** — index.html bekræft-trin ("Ja, send" / "Nej, tag nyt billede" / "Send til godkendelse
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
9. **Ingen fast bil pr. chauffør.** Alle chauffører kan køre alle tre vogne. Der findes ingen tabel, kolonne eller kontrol, der forudsætter "chauffør → bil".
10. taxi_nr på gamle rækker udfyldes ud fra nummerområdet, ikke ud fra chaufføren.
11. Nummer-kontrollen går på taxi_nr aflæst fra bonen og sammenligner med alle chaufførers vagter i samme bil.
12. FØRER-navnet på bonen identificerer chaufføren; det kontrolleres kun, når det står der.
13. Den unikke nøgle er (kilde, taxi_nr, slutrapport_nr) **uden chauffør**: samme bon kan ikke ligge hos to chauffører.
14. FØRER-navnet på bonen sammenlignes med chaufførens link (uploaderen). Afvigelse giver `til_godkendelse`.
15. Et nummer i 11xx, 16xx eller 18xx skal passe til bilens `taxi_nr` (11xx = 001-7144, 16xx = 001-8646, 18xx = 001-8208); ellers `til_godkendelse`.
16. Den unikke nøgle oprettes først, når der ikke er samme bon hos to chauffører. En læse-forespørgsel (`supabase/forespoergsler/taxi_nr_4_samme_bon_hos_flere_chauffoerer.sql`) viser alle par (samme bil, samme nr, forskellige chauffører), og migrationen starter med en vagt (`taxi_nr_5_vagt_foer_unik_noegle.sql`), der stopper med en tydelig fejl, hvis der stadig er nogen. Intet ændres da.

## Biler
Alle chauffører kan køre alle tre vogne; bilen findes ud fra nummerområdet (og fra `taxi_nr` på bonen), ikke ud fra chaufføren.

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
