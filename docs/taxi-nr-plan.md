# Plan: taxi_nr som nøgle (ikke påbegyndt; udføres i trin 1.1)

Slutrapport-nummeret tæller pr. **bil** (taxameter), ikke pr. chauffør. Der er **ingen fast bil pr. chauffør**:
alle chauffører kan køre alle tre vogne (Abdikarin er afløser uden vagter i september). Derfor er
(chauffor, slutrapport_nr) ikke en præcis nøgle, og nummer-kontrollen sammenligner med alle chaufførers vagter.

## Biler og nummerområder (bekræftet af ejeren 28/9 og 30/9-2026)

| Taxi nr.  | Slutrapport-nr. |
|-----------|-----------------|
| 001-7144  | 11xx            |
| 001-8208  | 18xx            |
| 001-8646  | 16xx            |

Kobling mellem nummer og bil går **kun** på nummerområdet. Chaufføren bruges aldrig til at gætte bilen.

## Trin
1. **Make:** OCR-prompten læser også "TAXI NR." og sender `taxi_nr` (fx `"001-8208"`) i JSON'en.
2. **Database:** kolonnen `taxi_nr text` (og `kilde`) på `slutrapporter` og en unik nøgle på `(kilde, taxi_nr, slutrapport_nr)` **uden chauffør**,
   `where taxi_nr is not null`. Nøglen oprettes først, når der ikke er samme bon hos to chauffører (beslutning 16 nedenfor).
   Det gamle indeks `ux_slutrapport (chauffor, slutrapport_nr)` bevares, indtil de gamle rækker har fået taxi_nr.
3. **Backfill** af gamle rækker ud fra nummerområdet i tabellen ovenfor (ikke ud fra chaufføren). Først vises listen
   over rækker, hvor nummeret ligger uden for de tre områder (`supabase/forespoergsler/taxi_nr_2_uden_for_omraaderne.sql`),
   og den godkendes, før noget køres. Numre uden for områderne (fx 2303, 1337, 19xx, 10xx) rettes manuelt.
4. **Dashboard:** nummer-kontrol præcist pr. `taxi_nr`, en taxi-kolonne i tabellen, og billedfilnavn
   `{taxi}_{nr}_{driver}_{tidsstempel}.jpg` (så `hent_billeder` kan matche på bil + nummer).

## Beslutninger (samme ordlyd som docs/plan-indlaesning.md, beslutning 13–16)
13. Den unikke nøgle er (kilde, taxi_nr, slutrapport_nr) **uden chauffør**: samme bon kan ikke ligge hos to chauffører.
14. FØRER-navnet på bonen sammenlignes med chaufførens link (uploaderen). Afvigelse giver `til_godkendelse`.
15. Et nummer i 11xx, 16xx eller 18xx skal passe til bilens `taxi_nr` (11xx = 001-7144, 16xx = 001-8646, 18xx = 001-8208); ellers `til_godkendelse`.
16. Den unikke nøgle oprettes først, når der ikke er samme bon hos to chauffører. En læse-forespørgsel (`supabase/forespoergsler/taxi_nr_4_samme_bon_hos_flere_chauffoerer.sql`) viser alle par (samme bil, samme nr, forskellige chauffører), og migrationen starter med en vagt (`taxi_nr_5_vagt_foer_unik_noegle.sql`), der stopper med en tydelig fejl, hvis der stadig er nogen. Intet ændres da.

Lønberegningen (`v_lonseddel`, `v_afregning`, `v_data`, `satser`) berøres ikke.
