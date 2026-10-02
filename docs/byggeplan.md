# Byggeplan — Taxi-afregning (fra eget system til salgbart produkt)
*Opdateret 30. september 2026*

**Mål:** Et system, der læser vagtdata fra kørselskontorerne, kontrollerer det selv, regner lønnen rigtigt og
kun beder ejeren om ét tryk, når noget ikke går op. **Ingen forkert løn må nogensinde godkendes automatisk.**

**Hvem gør hvad:** 🟦 Claude Code (kode, SQL, tests) · 🟨 Fahad (klik i Make/Supabase/Netlify, beslutninger, bon-eksempler) · 🟩 Sammen (Claude Code bygger, Fahad kører/godkender)

**Regler vi bygger efter:**
1. Intet bygges direkte i drift. Alt testes først (testmiljø + `tests/`).
2. Al SQL vises før den køres. Altid FØR/EFTER-tal ved ændringer i lønnen.
3. Alt der ændres, logges og kan fortrydes.
4. Intet forsvinder lydløst: fejl lander synligt i "Til godkendelse".
5. Én ting ad gangen. Kernen først, nye kilder bagefter.

---

## Fase 0 — Lås fundamentet (nu, de første dage)

| # | Opgave | Hvem | Færdig når |
|---|---|---|---|
| 0.1 | Test 2–4 efter lockdown: dashboard, chaufførers kvittering-links, en ny bon gennem Make | 🟨 | Alle tre virker |
| 0.2 | **Nye tokens** til ejer og chauffører (de gamle var læsbare før lockdown) + nye links | 🟩 | Gamle links virker ikke mere |
| 0.3 | Fjern `OWNER_TOKEN_DEFAULT` fra dashboard.html; kræv `?k=` | 🟦 | Kildekoden indeholder ingen koder |
| 0.4 | Skift alle delte nøgler: Gmail, OpenAI, service_role, `sbp_`, DB-password — opdatér i Make | 🟨 | Gamle nøgler er ugyldige |
| 0.5 | Lønsedlens **kontant = afregn** (indkørt − overført − bro), med FØR/EFTER pr. chauffør | 🟩 | Tal godkendt af Fahad ✓ (30/9) |
| 0.6 | Make: `raa_data` i HTTP 110 og 121 (halvfærdigt) | 🟨 | Fejlkort forudfyldes med OCR-tal |
| 0.7 | Migration `ocr_slutrapport_nr` (billedet forsvinder ikke ved Ret) | 🟩 | Billede følger rækken |
| 0.8 | Backup: dagligt eksport af databasen (gratis plan har ingen automatisk gendannelse) | 🟦 + 🟨 | Gendannelse er afprøvet én gang |
| 0.9 | Svar til Claude Code: e-mail til daglig oversigt. (Abdikarins bil udgår: han er afløser uden vagter og har ingen standardbil) | 🟨 | Sendt |
| 0.10 | September-løn til revisor: Faysals boner, Qaalid ✓, tjek dubletter/⚠ | 🟨 | Sendt til revisor |

## Fase 1 — Ny indlæsning uden Make (hovedprojektet)
*Plan godkendt 29/9. Bygges i testmiljø, Make kører imens.*

| Trin | Indhold | Hvem |
|---|---|---|
| 1.0 | Tests i repoet + GitHub Actions ✓ (næsten færdigt); separat test-Supabase-projekt | 🟩 |
| 1.1 | Database udvides: kilde, taxi_nr, status, kontroller, raa_data, billede_sti, virksomhed_id + tabellerne kilder, taxier, indlæsninger, virksomheder. taxi_nr på gamle rækker udfyldes ud fra nummerområde (11xx = 001-7144, 16xx = 001-8646, 18xx = 001-8208), aldrig ud fra chaufføren; rækker uden for områderne vises først og rettes manuelt; den unikke nøgle (kilde, taxi_nr, slutrapport_nr) uden chauffør oprettes først, når der ikke er samme bon hos to chauffører (læse-forespørgsel viser alle par, og migrationen stopper med en tydelig fejl, hvis der stadig er nogen) | 🟦 |
| 1.2 | Lønberegning: kun `status = godkendt`; kontant = afregn; udbetaling = andel − afregn | 🟩 |
| 1.3 | Kontroller som ren kode med enhedstests (18/19, 5/6, 6/8, 3/8, VDT 2303, taxi "001", KALIB-år, afskåret) | 🟦 |
| 1.3b | **Omsætning mellem boner:** TOTAL DKK og ANTAL TURE (kumulativt) fra hver bon; ΔTOTAL = taxameter + fastpris for vagterne imellem; afvigelse = "vagt mangler" med beløb; hul med 0 kr = tom vagt. Standardbil pr. chauffør (afvigelse = markering). **Engangsjob bagud** over alle billeder: `scripts/omsaetning-bagud` (kun læsning; prøve på 20 boner først) | 🟦 bygger, 🟨 kører jobbet |
| 1.4 | Edge Function "modtag-slutrapport": OpenAI structured outputs, billede i privat bucket, log af hver indlæsning | 🟦 + 🟨 (deploy) |
| 1.5 | Chaufførens bekræft-trin ("Nr 1683, 28/9, indkørt 5.046 — korrekt?") + "Til godkendelse" i dashboard | 🟦 |
| 1.6 | OCR-test på ca. 20 rigtige boner | 🟨 leverer boner, 🟦 måler |
| 1.7 | 2 ugers skyggedrift, derefter skift af upload-siden, Make slukkes | 🟩 |

**Kontroller (Dantaxi):** konto+kort=overført · indkørt−overført−bro=afregn · slutdato = start eller +1 dag · dato inden for 60 dage · nr 3–5 cifre, ikke 0 først · nr passer til bilens række (taxi_nr fra bonen, sammenlignet med alle chaufførers vagter i samme bil) · dublet · samme billede igen · upload senest 48 t efter vagt · FØRER-navnet på bonen identificerer chaufføren (kontrolleres kun hvis det står der) · rimelige beløb/vagtlængde.

**Acceptkriterier:** 0 forkerte auto-godkendelser på testsæt og i 2 ugers skyggedrift · alt der afviger lander synligt · ny kilde = kun en adapter + testsæt.

**Beslutninger for indlæsningen (samme ordlyd som `docs/plan-indlaesning.md`, beslutning 13–16):**
13. Den unikke nøgle er (kilde, taxi_nr, slutrapport_nr) **uden chauffør**: samme bon kan ikke ligge hos to chauffører.
14. FØRER-navnet på bonen sammenlignes med chaufførens link (uploaderen). Afvigelse giver `til_godkendelse`.
15. Et nummer i 11xx, 16xx eller 18xx skal passe til bilens `taxi_nr` (11xx = 001-7144, 16xx = 001-8646, 18xx = 001-8208); ellers `til_godkendelse`.
16. Den unikke nøgle oprettes først, når der ikke er samme bon hos to chauffører. En læse-forespørgsel (`supabase/forespoergsler/taxi_nr_4_samme_bon_hos_flere_chauffoerer.sql`) viser alle par (samme bil, samme nr, forskellige chauffører), og migrationen starter med en vagt (`taxi_nr_5_vagt_foer_unik_noegle.sql`), der stopper med en tydelig fejl, hvis der stadig er nogen. Intet ændres da.

### Udfasning af Make.com (mål: Make slukkes helt)
| Make-modul i dag | Erstattes af |
|---|---|
| Webhook 93 | Edge Function `modtag-slutrapport` |
| OpenAI 87 + JSON 88 | Samme funktion, OpenAI structured outputs (fast skema) |
| Upload 113 | Samme funktion, privat bucket |
| Router + filtre | Kontroller i kode, status godkendt / til_godkendelse / afvist |
| HTTP 92 | Samme funktion |
| HTTP 109/110/121 | Indlæsningslog + "Til godkendelse" |

Rækkefølge: (1) Make kører uændret, ingen nye Make-ændringer (0.6 er kun en bro) → (2) ny funktion bygges og testes i testmiljø →
(3) 2 ugers skyggedrift: upload-siden sender til begge, kun Make skriver til lønnen, daglig sammenligning →
(4) skift: upload-siden peger kun på den nye → (5) Make på pause i 2 uger som sikkerhedsnet →
(6) Make slettes, og service_role-nøglen fjernes derfra.

Sikkert at slukke når: 0 forkerte auto-godkendelser i test og skyggedrift · alle chauffører har sendt mindst én bon gennem
den nye · intet i Makes kø · backup (0.8) er på plads.

## Fase 2 — Drift uden opsyn

| Opgave | Hvem |
|---|---|
| Daglig e-mail (Resend): nye vagter, det der venter på godkendelse, advarsel >24 t, chauffør der ikke har sendt i 2 døgn | 🟦 |
| Indlæsningslog og fejlovervågning (kilde, resultat, varighed, fejl) | 🟦 |
| Automatisk test af hele kæden hver nat ("kanariefugl": en testbon gennem systemet; alarm hvis den fejler) | 🟦 |
| Ændringslog + Fortryd ✓ (bygget); udvides til alle ændringer | 🟦 |
| Månedsafslutning: lås regnskabsmåneden efter godkendelse, så tal ikke ændres bagefter | 🟦 |
| Revisor-eksport: månedsrapport som PDF/Excel pr. chauffør + samlet (kontrol af at tallene stemmer med dashboardet) | 🟦 |
| Chaufførens side: se egen løn, egne vagter, status på sendte boner ("modtaget / til godkendelse / godkendt") | 🟦 |

## Fase 3 — Gør det til et produkt (flere vognmænd)

| Opgave | Hvem |
|---|---|
| `virksomhed_id` overalt + række-niveau-sikkerhed (RLS), så en vognmand aldrig kan se en andens data | 🟦 |
| Rigtigt login til ejere (Supabase Auth) i stedet for links med koder | 🟦 |
| Admin-skærme: opret chauffører, biler og satser selv (ingen SQL) | 🟦 |
| Satser/aflønningsmodel pr. chauffør **og pr. kilde** (procent, trappe, 50/50, timeløn, pr. tur) | 🟦 |
| Privat bucket + tidsbegrænsede billedlinks | 🟦 |
| Onboarding: ny vognmand opretter sig, tilføjer biler/chauffører og sender første bon på under 30 minutter | 🟦 |
| Betaling (Stripe), abonnement pr. vogn/chauffør | 🟩 |
| **GDPR og jura:** databehandleraftale, privatlivspolitik, vilkår, sletning/opbevaring af bon-billeder (chaufførnavne + løn er personoplysninger). Få en jurist til at kigge på det | 🟨 |
| Support: fejlrapport-knap, statusside, dokumentation/videoer til vognmænd | 🟩 |

## Fase 4 — Flere kørselskontorer (kilder)

| Kilde | Forudsætning |
|---|---|
| Dantaxi (foto) ✓ | Bygges i fase 1 |
| Digitale data fra Dantaxi (CSV/API), hvis de tilbyder det | Fahad spørger Dantaxi |
| DRIVR, Taxa 4x27, 4x35, Uber m.fl. | Fahad taler med kontorerne og får 5–10 eksempler + spørgsmålene nedenfor |

**Spørgsmål til hvert kørselskontor:** Kan vi få vagt-/slutrapport-data digitalt (API, CSV, PDF pr. mail)? Hvilke felter er med? Hvordan identificeres chauffør og bil? Hvad trækker kontoret selv fra? Afregningsperiode? Eksempelfiler? Kræves databehandleraftale?

**Adapter pr. kilde:** `prompt.md`, `skema.json`, `kontroller.ts`, `eksempler/`, testsæt. Digital data foretrækkes altid frem for foto.

## Fase 5 — Flextrafik (først når fase 1–2 er færdige og bevist)
Kilde af type (b): vognløb/ture pr. vogn, dag og chauffør, evt. tidsregistrering (brutto/pause/netto).
Fahad skal først levere: hvordan flex-chaufførerne aflønnes, hvilke data der kommer fra FynBus/Midttrafik/Sydtrafik (format, hyppighed) og 2–3 eksempler.
Tjek selv udbudsmaterialet for, om kravet om arbejdstidsrapport (FV10) gælder jer, før det bliver et salgsargument.
Positionering: konkurrenter sælger drift (kort, vognløb). Vi sælger **lønafregning med automatisk kontrol**.

## Fase 6 — Salg

| Opgave | Hvem |
|---|---|
| Bevis: egen virksomhed kører 2–3 måneder uden manuelle rettelser (nøgletal: andel auto-godkendt, antal rettelser, tid brugt pr. måned) | 🟨 |
| Pris: start ved 300–500 kr./md. pr. vognmand (op til ca. 5 chauffører) + tillæg pr. chauffør; test med 2–3 pilotkunder | 🟨 |
| Demo + kort salgsmateriale ("Fra bon til løn uden regneark") | 🟩 |
| Første 3 pilotkunder (gerne gratis 2–3 måneder mod feedback og reference) | 🟨 |

---

## Anbefalet rækkefølge
1. **Fase 0** (denne uge) — sikkerhed, rigtig løn, september til revisor.
2. **Fase 1** (2–4 uger) — ny indlæsning, test, skyggedrift.
3. **Fase 2** (sideløbende med skyggedriften) — daglig e-mail, overvågning, revisor-eksport.
4. **Fase 3** (når kernen kører stabilt) — produktgørelse.
5. **Fase 4 → 5** (når du har eksempler fra kontorerne) — flere kilder, derefter flex.
6. **Fase 6** — pilotkunder, når fase 3 er på plads.

## Ikke i planen endnu (vurdér senere)
- Chauffør-app/PWA med kamera-guide ("læg bonen her") — kan reducere dårlige billeder markant.
- Direkte integration til lønsystem/bogholderi (e-conomic, Dinero).
- Flere sprog i chaufførsiden (mange chauffører har et andet modersmål).

---

## Status (opdateres løbende)
| Punkt | Status |
|---|---|
| Lockdown (luk_direkte_adgang) | Kørt live 30/9, ligger i `supabase/migrations/20260930100000_luk_direkte_adgang.sql` |
| 0.1 | Afventer Fahads test (anon-nøgle blokeret, dashboard, kvittering, Make) |
| 0.3 | Bygget og pushet (dashboard v2026-09-30a), tests grønne. Ikke merget til `main` endnu (venter på 0.1-testene) |
| 0.5 | Gjort 30/9: kontant = afregn på lønsedlen, kørt live (`migrations/20260930110000_kontant_er_afregn.sql`); kontrol for 2026-09 OK for alle fire chauffører. Fuads dublet 1112 fjernet, Faysals nr 1674 rettet til 0. Nødplan: `tilbagefoering/20260930110000_kontant_er_afregn.sql` |
| 0.6 | Springes over (Make udfases) |
