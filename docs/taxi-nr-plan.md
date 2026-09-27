# Plan: taxi_nr som nøgle (ikke påbegyndt)

Slutrapport-nummeret tæller pr. **bil** (taxameter), ikke pr. chauffør. De 3 biler deles af 5 chauffører,
så (chauffor, slutrapport_nr) er ikke en præcis nøgle, og nummer-kontrollen i dashboardet må i dag
sammenligne med alle chaufførers vagter.

## Bil-fordeling (bekræftet af ejeren 28/9-2026)

| Taxi nr.  | Slutrapport-nr. | Fast chauffør |
|-----------|-----------------|---------------|
| 001-7144  | 11xx            | Adan          |
| 001-8208  | 18xx            | Qaalid        |
| 001-8646  | 16xx            | –             |

## Trin
1. **Make:** OCR-prompten læser også "TAXI NR." og sender `taxi_nr` (fx `"001-8208"`) i JSON'en.
2. **Database:** kolonnen `taxi_nr text` på `slutrapporter` og et unikt indeks på `(taxi_nr, slutrapport_nr)`
   `where taxi_nr is not null`. Det gamle indeks `ux_slutrapport (chauffor, slutrapport_nr)` bevares,
   indtil de gamle rækker har fået taxi_nr.
3. **Backfill** af gamle rækker ud fra nummerområdet i tabellen ovenfor. Listen vises for ejeren og
   godkendes, før den køres. Numre uden for områderne (fx 2303, 1337, 19xx) rettes manuelt.
4. **Dashboard:** nummer-kontrol præcist pr. `taxi_nr`, en taxi-kolonne i tabellen, og billedfilnavn
   `{taxi}_{nr}_{driver}_{tidsstempel}.jpg` (så `hent_billeder` kan matche på bil + nummer).

Lønberegningen (`v_lonseddel`, `v_afregning`, `v_data`, `satser`) berøres ikke.
