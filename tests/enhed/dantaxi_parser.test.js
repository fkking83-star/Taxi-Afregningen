// scripts/dantaxi/dantaxi_specifikation_parser.py på OPDIGTEDE linjer (ingen rigtige Dantaxi-data), og at ingen PDF/fakturadata ligger i repoet.
const { spawnSync } = require('child_process'); const fs = require('fs'), os = require('os'), path = require('path');
let fails = 0; const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const mappe = path.join(__dirname, '..', '..', 'scripts', 'dantaxi'), py = path.join(mappe, 'dantaxi_specifikation_parser.py');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'spec-')), fil = path.join(tmp, 'spec.txt');
fs.writeFileSync(fil, [
  'Vognbilag (opdigtet eksempel)', 'Vogn 9.001 1.111, ialt 12 ture. 3.456,70', 'Vogn 9.001 1.112, ialt 3 ture. 15,00 1.234,50',
  'Vogn 9.002 2.001, ialt 5 ture. -100,00', 'Vogn 9.001 1.111, ialt 99 ture. 7,00', 'en linje der ikke er en total', ''].join('\n'));
const kod = `import sys, json; sys.path.insert(0, ${JSON.stringify(mappe)}); import dantaxi_specifikation_parser as p
v = p.vagter(${JSON.stringify(fil)}); s = p.sum_pr_vogn(v)
print(json.dumps({'n': len(v), 'k': {'|'.join(k): d for k, d in v.items()}, 's': s}))`;
const r = spawnSync('python3', ['-c', kod], { encoding: 'utf8' });
check(r.status === 0, 'Parseren kan importeres og køres' + (r.status ? ': ' + r.stderr : ''));
const j = r.status === 0 ? JSON.parse(r.stdout) : {};
check(j.n === 3 && j.k['9001|1112'].gebyr === 15 && j.k['9001|1112'].beloeb === 1234.5 && j.k['9002|2001'].beloeb === -100 && j.k['9001|1111'].ture === 99, 'Linjer læses: punktum fjernes i vogn/vagt-nr, gebyr er valgfrit, negative beløb ok, samme (vogn, vagt) to gange: den sidste gælder');
check(j.s && j.s['9001'].ture === 102 && Math.abs(j.s['9001'].beloeb - 1241.5) < 1e-9 && j.s['9002'].beloeb === -100, 'Sum pr. vogn');
const u = spawnSync('python3', [py, fil], { encoding: 'utf8' });
check(u.status === 0 && /3 vagter/.test(u.stdout) && /vogn 9001: 102 ture, 1,241\.50 kr/.test(u.stdout) && /i alt: 1,141\.50 kr/.test(u.stdout), 'Kommandolinjen skriver antal vagter, sum pr. vogn og i alt (og ændrer intet)');
check(JSON.stringify(fs.readdirSync(tmp)) === '["spec.txt"]', 'Scriptet skriver ingen filer');
// Ingen konkrete beløb/vognsummer og ingen faktura-id'er i docstringen
const kilde = fs.readFileSync(py, 'utf8'), doc = kilde.split('"""')[1];
check(!/\d{2}\.\d{3}|\d{6,}|batch \d|Specifikation_\d/i.test(doc) && !/\b(7144|8208|8646)\b/.test(doc), 'Docstringen indeholder ingen vognsummer, fakturabeløb eller batch-/fakturanumre');
// Intet Dantaxi-materiale i repoet
const g = spawnSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' });
check(g.status === 0 && !g.stdout.split('\n').some(f => /\.pdf$/i.test(f) || /^scripts\/dantaxi\/.*\.txt$/.test(f)), 'Ingen PDF-filer og ingen udtrukne tekstfiler i repoet');
const gi = spawnSync('git', ['check-ignore', 'scripts/dantaxi/Specifikation_X.pdf', 'scripts/dantaxi/spec.txt'], { cwd: path.join(__dirname, '..', '..'), encoding: 'utf8' });
check(gi.stdout.trim().split('\n').length === 2, 'scripts/dantaxi/.gitignore afviser PDF og spec*.txt');
fs.rmSync(tmp, { recursive: true });
console.log(fails ? `\n${fails} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(fails ? 1 : 0);
