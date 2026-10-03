#!/usr/bin/env python3
"""
Læser Dantaxis "Vognbilag" / Specifikation (PDF med tekstlag) og udtrækker beløb pr. (vogn, vagt).

Brug:
    pdftotext -layout <specifikation>.pdf spec.txt
    python3 dantaxi_specifikation_parser.py spec.txt

PDF-filerne og de udtrukne tekstfiler må IKKE lægges i repoet (de indeholder fakturadata); scripts/dantaxi/.gitignore afviser dem.

Fund fra de første specifikationer (1/10-2026):
  * "Vagt Nr" hos Dantaxi = slutrapport-NR på bonen, pr. vogn. Nøglen er (vogn, vagt nr).
  * Summen af vagt-totalerne pr. vogn passer til krone med fakturaens "Kontoture + Kreditkortture" pr. vogn.
  * En vagt kan være afregnet i flere batches (konto/kort betales senere) -> summér over alle batches.
  * Dantaxi afregner kun konto- og kredit-ture, aldrig kontanter. Sammenlign derfor med bonens OVERFØRT, ikke INDKØRT.
  * Importen bør altid kontrollere: sum af vagter pr. vogn = fakturaens sum, og antal ture = "Ture ialt".
Kontrol, ikke gæt: scriptet skriver kun ud; det ændrer intet.
"""
import re
import sys
import collections

TOTAL = re.compile(
    r'\s*Vogn\s+([\d.]+)\s+([\d.]+),\s+ialt\s+(\d+)\s+ture\.\s+(?:(-?[\d.]+,\d\d)\s+)?(-?[\d.]+,\d\d)\s*$')


def dk(tal: str) -> float:
    """'1.234,50' -> 1234.5"""
    return float(tal.replace('.', '').replace(',', '.'))


def vagter(sti: str) -> dict:
    """Returnerer {(vogn, vagt_nr): {'ture': int, 'gebyr': float, 'beloeb': float}}"""
    ud = {}
    with open(sti, encoding='utf-8') as f:
        for linje in f:
            m = TOTAL.match(linje)
            if m:
                ud[(m.group(1).replace('.', ''), m.group(2).replace('.', ''))] = {
                    'ture': int(m.group(3)),
                    'gebyr': dk(m.group(4)) if m.group(4) else 0.0,
                    'beloeb': dk(m.group(5)),
                }
    return ud


def sum_pr_vogn(v: dict) -> dict:
    s = collections.defaultdict(lambda: {'ture': 0, 'beloeb': 0.0})
    for (vogn, _), d in v.items():
        s[vogn]['ture'] += d['ture']
        s[vogn]['beloeb'] += d['beloeb']
    return dict(s)


if __name__ == '__main__':
    for sti in sys.argv[1:]:
        v = vagter(sti)
        s = sum_pr_vogn(v)
        print(f'{sti}: {len(v)} vagter')
        for vogn, d in sorted(s.items()):
            print(f'  vogn {vogn}: {d["ture"]} ture, {d["beloeb"]:,.2f} kr')
        print(f'  i alt: {sum(d["beloeb"] for d in s.values()):,.2f} kr')
