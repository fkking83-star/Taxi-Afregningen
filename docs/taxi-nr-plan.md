# Plan: taxi_nr som nøgle (ikke påbegyndt)

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
2. **Database:** kolonnen `taxi_nr text` på `slutrapporter` og et unikt indeks på `(taxi_nr, slutrapport_nr)`
   `where taxi_nr is not null`. Det gamle indeks `ux_slutrapport (chauffor, slutrapport_nr)` bevares,
   indtil de gamle rækker har fået taxi_nr.
3. **Backfill** af gamle rækker ud fra nummerområdet i tabellen ovenfor (ikke ud fra chaufføren). Først vises listen
   over rækker, hvor nummeret ligger uden for de tre områder (`supabase/forespoergsler/taxi_nr_2_uden_for_omraaderne.sql`),
   og den godkendes, før noget køres. Numre uden for områderne (fx 2303, 1337, 19xx, 10xx) rettes manuelt.
4. **Dashboard:** nummer-kontrol præcist pr. `taxi_nr`, en taxi-kolonne i tabellen, og billedfilnavn
   `{taxi}_{nr}_{driver}_{tidsstempel}.jpg` (så `hent_billeder` kan matche på bil + nummer).

Lønberegningen (`v_lonseddel`, `v_afregning`, `v_data`, `satser`) berøres ikke.
