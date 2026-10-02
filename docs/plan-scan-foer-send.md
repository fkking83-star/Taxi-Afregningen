# Plan: "Scan før send" i index.html

Status: **godkendt 3/10-2026 (D1–D8 besvaret, se nederst). Lag 1 er bygget i `site/index.html` bag `?scan=1` / `?scan=debug`; lag 2 afventer test-projektet (1.0) og nye tokens (0.2).** Skrevet 3/10-2026.

**Rører ikke:** lønberegningen, Make, kvittering.html, dashboardet. Lag 1 ændrer kun `site/index.html`. Lag 2 hører til trin 4–5 i `docs/plan-indlaesning.md` og bygges først, når test-projektet findes.

**Mål:** en dårlig bon opdages, mens chaufføren stadig står med bonen i hånden, så vi ikke får fejlede uploads og vagter, der først opdages ved månedsafslutningen.
Lag 1 fanger *dårlige billeder* (sløret, mørkt, genskin, for lille, bonen fylder for lidt). Lag 2 fanger *forkerte tal* (regnestykket går ikke op, forkert chauffør-id). De er to forskellige problemer, og lag 1 kan aldrig afgøre, om tallene er rigtige.

---

## Lag 1: lokal billedkvalitetstest (kun `index.html`)

### Hvor i flowet
Kun `processFile()` og `send()` ændres. Billedet findes allerede lokalt som `ImageBitmap`/canvas, og intet forlader telefonen før `send()` (`fetch` til Make). Det forbliver sådan:

1. Chaufføren vælger et billede → `processFile()` laver `ImageBitmap` (EXIF-rotation som i dag).
2. **Ny:** `vurderBillede(bitmap)` kører på en nedskaleret kopi (lang side 1000 px) og returnerer `{godkendt, aarsager[], maal{…}}`. Vises med "Tjekker billedet…".
3. Godkendt → som i dag. Ikke godkendt → teksten *"Billedet kunne ikke læses. Tag et nyt og mere tydeligt billede"* plus en kort årsag ("for sløret", "for mørkt", "genskin", "for lille", "hele bonen skal med"), **Send-knappen er `disabled`**, og "Tag nyt billede" er den store knap.
4. `send()` får et ekstra værn: sender intet, hvis det aktuelle billede ikke er godkendt (så en fejl i knaplåsen aldrig kan sende et dårligt billede).

Koden ligger **inline i `index.html`** i en afgrænset blok (`SCAN-START … SCAN-SLUT`) med alle tærskler i ét objekt `SCAN_GRAENSER`, ingen biblioteker, ingen CDN, ingen netværkskald. (Alternativ: en separat `site/scan.js`; jeg anbefaler inline, fordi du bad om "kun index.html", og testerne kan hente blokken ud af siden, som de gør med `nrAdvarsler`.)

### Målinger
Alle regnes på gråtoner (luma) af den nedskalerede kopi. Tallene i tabellen er **startværdier til at begynde målingen med**, ikke resultater. De endelige tærskler sættes af målefasen.

| Test | Sådan måles det | Startværdi | Kendt svaghed |
|---|---|---|---|
| For lille | originalens korteste side og bonens bredde i pixel | korteste side ≥ 1000 px; bonens bredde ≥ 600 px ved 1600 px | WhatsApp-billeder er allerede nedskaleret; grænsen skal ligge under dem |
| Bonen findes | Otsu-tærskel → største lyse sammenhængende område = bonen (bbox, areal, hældning) | område ≥ 10 % af billedet | mørk bon på lyst bord, hvid bon på hvidt bord |
| Fylder billedet / hele bonen med | bonens bbox ≥ 35 % af billedet, lang side ≥ 60 % af billedets lange side, og bonen rører **ikke** billedets kant foroven/forneden | 35 % / 60 % / 1,5 % margen | **Kan ikke se, om nummeret og tiderne rent faktisk er med.** Det er en stedfortræder: papirkanten skal være synlig øverst og nederst |
| Sløret | varians af Laplace-filter på bonen skaleret til fast bredde (640 px), så tallet er sammenligneligt på tværs af opløsninger; ekstra mål: 90-percentilen af gradienten | fastsættes | tekstmængden ændrer tallet; skal måles på bonen og ikke hele billedet |
| For mørkt | median-luma og kontrast (P95−P5) inde i bonen | median ≥ 90, kontrast ≥ 60 | termopapir er gråt; blitz på mørk baggrund |
| Genskin | sammenhængende område af (næsten) hvide pixel (luma ≥ 245) på bonen, der er ≥ 4 % af bonen og uden tekstkanter; eller ≥ 35 % overeksponeret i alt | fastsættes | hvidt papir i godt lys skal ikke regnes som genskin |
| Skæv bon | hovedaksens vinkel | kun en hint-tekst ("hold telefonen lige"), ikke afvisning, før målingen siger noget andet | |

Fejlsikkert: kan analysen ikke køre (fejl, for lidt hukommelse på en gammel telefon), **godkendes billedet** (så en fejl i testen aldrig spærrer en chauffør), og fejlen vises ikke for chaufføren.

### Hvad lag 1 ikke kan
- Det kan ikke læse tal. "Nummer øverst og vagttider nederst med" kan kun tjekkes indirekte (papiret er ikke skåret over/under). Et skarpt, godt oplyst billede, hvor tiderne er klippet af, vil kunne slippe igennem. Det fanger lag 2 (eller lag 1b, se målefasen).
- Det kan ikke se, om bonen er den rigtige, eller om tallene er rigtige.

### Låsning og flugtvej (beslutning D1)
Er Send låst uden udvej, kan en **falsk afvisning** (godt billede afvist) spærre en chauffør, og så mangler vagten på lønnen. Jeg anbefaler derfor en flugtvej: efter **2 afviste billeder i træk** vises en lille knap *"Send alligevel (bonen kontrolleres manuelt)"*, som sender som i dag (samme formular, ingen ekstra felter, Make røres ikke). Bliver det valgt fra, er flugtvejen kun i lag 2, som du beskrev.

### Udrulning (intet bygges direkte i drift)
1. Bygges og testes. Lægges bag `?scan=1`, så kun dit eget link bruger det; almindelige links er uændrede.
2. **Debug-tilstand** `?scan=debug`: viser målingerne og afgørelsen under billedet og har knappen "Kopiér målinger" (én linje til regneark). Så kan du måle med din egen telefon og rigtige bons uden at vente på mig.
3. Målefasen (nedenfor) sætter tærsklerne.
4. Først derefter gælder det alle links.

### Test (mobil-emulering)
Playwright med iPhone 13 og Pixel 7 (touch, mobil-viewport). Billederne er **syntetiske bon-lignende billeder tegnet i testen** (hvidt papir med sort tekst), som forringes kontrolleret: sløret, mørkt, genskin-plet, formindsket, afskåret, roteret, EXIF-roteret.
Testen beviser: godkendt billede → Send aktiv, og først ved klik sendes der netværkskald (præcis ét, til Make); afvist billede → præcis teksten, Send `disabled`, **nul** netværkskald; `send()`-værnet; flugtvejen efter 2 afvisninger; fejl i analysen godkender; ydelse (CPU-drosling 4×: under 1,5 s); ingen sidelæns rulning på 360 px; ingen JS-fejl.
Testen beviser **ikke**, at tærsklerne passer til rigtige bons. Det gør målefasen. Kun Chromium er installeret her (ikke WebKit/Safari). iOS-Safari-forskelle (canvas-grænser, kameraets EXIF) kræver, at du prøver på din iPhone/Android.

---

## Målefase (før tærsklerne låses)

### Testsættet: 20 gode og 10 dårlige billeder
- **Godt** = et menneske kan læse nummer, tider og beløb på telefonens skærm. **Dårligt** = mindst ét af dem kan ikke læses. Hvert billede mærkes af dig, før vi måler (ikke ud fra, hvad en OCR synes).
- De 10 dårlige bør spænde over fejltyperne: sløret (2–3), mørkt (2), genskin (2), meget lille/formindsket (2), afskåret top eller bund (2).
- Billederne er **personoplysninger** (chaufførnavne, løn) og **lægges ikke i repoet**. De ligger i en lokal mappe `maalesaet/god/` og `maalesaet/daarlig/` (i `.gitignore`).
- Hvordan billederne kommer til mig: du kører værktøjet selv og sender mig kun CSV-filen med tal (ingen billeder), eller du beskriver de billeder, det fejlklassificerer (beslutning D4).

### Værktøjet: `scripts/scan-maal/`
- Kører **præcis den samme `vurderBillede`-kode** som siden (hentet ud af `index.html`) på hvert billede i et skjult Chromium via Playwright. Intet netværk.
- Udskriver én CSV med alle målinger pr. billede og en tabel over, hvad hver tærskel giver: falske afvisninger, falske godkendelser, og hvilke filer det er (så du kan se dem).
- **Udvidelse af sættet:** de 20 gode billeder forringes automatisk (sløring, mørklægning, genskin-plet, formindskelse, beskæring) til flere hundrede dårlige varianter; og forbedres/forstyrres mildt (genkomprimering, ±3° drejning, lysstyrke) til flere gode varianter. Det giver et mere stabilt tal for falske afvisninger. **Syntetiske dårlige billeder er lettere at fange end rigtige**, så falske godkendelser regnes primært på de 10 rigtige.

### Mål (forslag, beslutning D2)
- Falske afvisninger: højst **1 af 20** rigtige gode billeder og højst **5 %** af de forstyrrede gode varianter. (En falsk afvisning koster en chauffør tid; derfor strammest her.)
- Falske godkendelser: højst **2 af 10** rigtige dårlige billeder for lag 1 alene, fordi lag 2 og dashboardet fanger resten.
- **Statistisk ærlighed:** 30 billeder er få. 0 falske afvisninger ud af 20 betyder kun, at den sande rate kan være op til ca. 14 %. Vi bruger målingen til at sætte tærsklerne og til at se, om en tilgang overhovedet virker. Den rigtige dom kommer af 1–2 ugers *skyggetilstand* (lag 1 kører og logger, men blokerer ikke), sammenlignet med hvilke uploads der senere fejlede i OCR. Det kræver, at målingerne gemmes et sted; det bygger jeg først, når du har set resultatet af de 30.

### Beslutningsregel for lag 1b (lokal OCR af nummeret, fx Tesseract i browseren)
Bestemmes af målingen, ikke på forhånd. Lag 1b tilføjes **kun hvis alle fire gælder**:
1. Lag 1 alene har efter tuning stadig for mange falske godkendelser, især "nummer eller tider ikke læsbare trods skarpt billede".
2. En lokal OCR læser nummeret rigtigt på ≥ 90 % af de gode billeder **og** afviser ≥ 70 % af de billeder, hvor nummeret ikke kan læses (målt på de 30 + varianter).
3. Tilføjelsen koster højst ca. 3 s ekstra på en mellemklasse-telefon og et rimeligt antal MB (JS/wasm og sprogdata skal ligge lokalt på siden, ingen CDN; mobildata tæller).
4. Lag 2 er **ikke** tæt på at være i drift (ellers er 1b overflødig, for lag 2 læser nummeret bedre og kontrollerer det).
Min forventning: lag 2 gør 1b overflødig, men det afgøres af målingen.

---

## Lag 2: `/analyser` (del af trin 4–5 i plan-indlaesning)

### Flow
```
index.html (?ny=1) ── billede + chaufførens link ──► Edge Function /analyser
        ▲                                               │ 1) gem billedet (privat bucket, fingeraftryk)
        │                                               │ 2) OpenAI structured outputs (strict skema) læser bonen
        │                                               │ 3) bonens egne kontroller (ren kode, samme som i kontroller.js)
        └──── de læste tal + hvilke kontroller der er ok ◄┘
index.html viser tallene stort → chaufføren bekræfter → /bekraeft gemmer og kører resten af kontrollerne
```
Make er uberørt. `?ny=1` holder lag 2 væk fra almindelige links, til skyggedriften er godkendt (trin 7).

### Hvad /analyser læser og kontrollerer
Strict skema (udvider det, `scripts/omsaetning-bagud/lib.mjs` allerede bruger): kilde (overskrift), bontype, taxi_nr, slutrapport_nr, dato, vagt_start/slut, FØRER, CHAUFFØR-nr, **konto, kreditkort, kredit ekstra, overført, indkørt, bro, afregn**, TOTAL DKK, ANTAL TURE (kumulativt), taxameter, fastpris, sikkerhed. Instruktionen (`PROMPT`) valideres først med `--proeve 20` fra bagudkørslen, så vi ikke skriver den to gange.

**Bonens egne kontroller (spærrer Send, indtil de er ok):**
1. Nummeret er læst (3–5 cifre, ikke 0 først).
2. konto + kreditkort + kredit ekstra = overført.
3. indkørt − overført − bro = afregn.
4. Datoer: dato læses af datoparseren (tvetydig dato = ikke ok), inden for 60 dage, slut = start eller +1 dag.
5. **CHAUFFØR-nr (`chauffor_id`) = den chauffør, der uploader** (via `chauffoer_kilder`); FØRER-navn mod chaufføren, hvis det står der.
6. Bontype er endelig (en foreløbig bon afvises med tydelig besked). Kilde passer til chaufførens kilde.

**Kontrollerne, der ikke spærrer** (dublet, nummerrække, overlap, hul, VDT osv.) kører efter afsendelse og sender højst bonen til "Til godkendelse". Så spærrer vi ikke chaufføren for ting, han ikke kan rette.

### Skærmen
Efter lag 1: *"Læser bonen…"*, derefter de læste tal i stor skrift ("Nr 1683 · 28/9 · 06:00–14:00 · Indkørt 5.046 · Overført 4.931 · Afregn 115") med ✓/✗ pr. kontrol. Knapper: **"Ja, det er rigtigt – send"** (aktiv, kun når alle seks kontroller er ok), **"Nej, tag nyt billede"**. Chaufføren kan **ikke selv rette tal** (så et tal aldrig bliver indtastet frem til noget, der går op). Efter **2 mislykkede forsøg** (kontrol fejler, eller chaufføren siger nej) vises *"Send til godkendelse alligevel"*: bonen gemmes med status `til_godkendelse` og de læste tal som forslag. Intet godkendes automatisk, når en kontrol har fejlet.

### Forudsætninger (det her blokerer lag 2)
- **Test-projektet** (punkt 1.0) findes ikke endnu. Du vil have mig til at guide dig klik for klik.
- **Databaseudvidelsen** (1.1) med `chauffoer_kilder` (chauffør, kilde, CHAUFFØR-nr), `indlaesninger`, privat bucket.
- **Hver chaufførs CHAUFFØR-nr, som det står på bonen** (beslutning D7). `DRIVERS` i `index.html` har et felt `nr`, men jeg ved ikke, om det er CHAUFFØR-nr eller et telefonnummer (Faysal har ingen).
- En **ny OpenAI-nøgle** som secret i funktionen (aldrig i siden). Du deployer funktionen (🟨).
- En chaufførs identitet: i dag er `?driver=fuad` ikke hemmelig. /analyser bør bruge chaufførens personlige kvitterings-token (0.2), ellers kan hvem som helst bruge funktionen. Så punkt 0.2 bør være gjort først.

### Sikkerhed og drift
- Nøglen kun som secret. **Grænse pr. chauffør pr. døgn** på antal analyser (ellers kan et gæt på adressen give uendelige OpenAI-kald på din regning).
- Billederne er personoplysninger: privat bucket, tidsbegrænsede links (planen for salgsversionen).
- Omkostning: ét OpenAI-kald pr. forsøg. Lag 1 sparer de kald, hvor billedet er dårligt.

### Test
Funktionen testes med en falsk OpenAI (som bagudkørslen) og enhedstests af de seks kontroller (genbrug af `kontroller.js` og datoparseren). Skærmen testes på mobil-emulering med falsk /analyser: spærret til alle seks er ok; "Send alligevel" kommer efter præcis 2 forsøg; intet kald til Make med `?ny=1`. Nøjagtigheden af selve OCR'en måles på rigtige boner (trin 1.6, krav: 0 forkerte auto-godkendelser), ikke her.

---

## Rækkefølge efter godkendelse
1. **Lag 1** bygges med debug-tilstand og tests (kun `index.html` + tests).
2. **Målefasen:** værktøjet + testsæt-protokol. Du måler (med telefonen og/eller værktøjet) og sender CSV'en.
3. Tærskler låses; **beslutning om lag 1b** efter reglen ovenfor; udrulning til alle links (efter D1).
4. **Lag 2** i samme rækkefølge som trin 1.0 → 1.1 → 3 → 4 → 5; først den rene kode og skærmen mod en falsk funktion, så den rigtige funktion i test-projektet.

## Beslutninger, jeg skal bruge
| # | Spørgsmål | Min anbefaling |
|---|---|---|
| D1 | Flugtvej i lag 1: "Send alligevel" efter 2 afviste billeder? | Ja (sender som i dag, Make uberørt) |
| D2 | Mål: ≤ 1 af 20 falske afvisninger (og ≤ 5 % på varianter); ≤ 2 af 10 falske godkendelser for lag 1 alene | Ja |
| D3 | Kode inline i `index.html` (ikke en separat fil) | Inline |
| D4 | Testsættet: du kører værktøjet lokalt og sender kun CSV (billederne forlader aldrig din computer) | Ja |
| D5 | Udrulning bag `?scan=1` → debug → alle | Ja |
| D6 | Lag 2: chaufføren kan ikke selv rette tal | Ja |
| D7 | Hver chaufførs CHAUFFØR-nr som på bonen (og hvad `nr` i `DRIVERS` er) | Du leverer |
| D8 | Rækkefølge: lag 2 afventer test-projektet (1.0) og nye tokens (0.2) | Ja |

## Risici
- **Falske afvisninger** er den største risiko ved lag 1 (spærrer vagter). Derfor: fejlsikker analyse, flugtvej (D1) og skyggetilstand, før det gælder alle.
- Tærskler fra få billeder generaliserer dårligt (derfor varianter og skyggetilstand).
- Telefonernes kamera og EXIF opfører sig forskelligt (især iOS): kræver test på dine egne telefoner.
- Lag 2 afhænger af OCR-kvalitet (trin 1.6) og af, at CHAUFFØR-nr er rigtigt registreret; ellers spærres chauffører for tit, og flugtvejen bruges meget.

---

## Svar fra ejeren 3/10-2026 og hvad der er bygget

**D1–D6 og D8: ja.** Lag 1 er bygget (kun `site/index.html`, tests i `tests/enhed/scan.test.js` og `tests/browser/scan.test.js`, hjælper `tests/hjaelpere/scan_billeder.cjs`). Intet er rullet ud til almindelige links.

**D7 – CHAUFFØR-nr:**
- Qaalid, Faysal, Fuad og Adan har hvert et nummer, som ejeren har aflæst på bonerne; Abdikarin har intet. **Selve numrene står ikke i repoet** (de lægges i databasen i 1.1 med SQL, der vises først).
- **Adan og Fuad er kun set på én bon:** de lægges ind som **"ikke bekræftet"** (egen kolonne i `chauffoer_kilder`). En afvigelse på et ikke bekræftet nummer giver **kun `til_godkendelse`, aldrig afvisning og aldrig spærret Send**. (Min læsning, til bekræftelse: for de to bekræftede numre følger kontrollen de seks spærrende kontroller i lag 2 som planlagt; for de to ikke bekræftede er den kun en markering til ejeren.)
- Numrene ligger **ikke** i `index.html` og kontrolleres **kun på serveren** (i `/analyser`/`/bekraeft`). Siden får aldrig facit at se.
- **`nr` i `DRIVERS` i dag:** feltet bliver sendt som `driver_nr` i formularen til Make (`index.html`, `form.append("driver_nr", currentDriver.nr)`). Værdierne ligner telefonnumre (otte cifre, Faysal tom, Abdikarin med landekode), ikke sekscifrede CHAUFFØR-nr. Det er **ikke** CHAUFFØR-nr og bruges ikke af scanningen. Ejeren bekræfter, hvad Make bruger det til, før feltet røres.

**Lag 1, som det er bygget (startværdier, målefasen sætter de endelige):**
- Tændes kun af `?scan=1` (afvisning + låst Send) eller `?scan=debug` (samme + målinger og "Kopiér målinger"). Uden dem er siden uændret (testet).
- Ni målinger i `SCAN_GRAENSER` (størrelse, bon fundet, fylder, rører kant, sløring, lys, kontrast, genskin, hældning). Genskin tæller kun som en **plet** (dens boks dækker under 80 % af bonen), så helt lyst papir ikke afvises.
- Flugtvej efter 2 afviste billeder i træk ("Send alligevel (bonen kontrolleres manuelt)"); `send()` har et værn; fejl i analysen godkender billedet.
- **Kendte svagheder:** hvid bon på hvidt bord afvises (testet som kendt svaghed); intet tal læses; Safari/iOS er ikke afprøvet (kun Chromium her); tærsklerne er sat ud fra syntetiske billeder.
