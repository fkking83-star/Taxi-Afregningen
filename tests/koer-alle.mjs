// Kører alle tests i tests/ (sql, enhed, browser) én ad gangen og giver en samlet oversigt.
// Brug: cd tests && npm test        (eller: node koer-alle.mjs sql  for kun én mappe)
import { readdirSync, mkdirSync, writeFileSync } from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';

const her = path.dirname(fileURLToPath(import.meta.url));
const mapper = process.argv.slice(2).length ? process.argv.slice(2) : ['sql', 'enhed', 'browser'];
const resultat = [];
for (const mappe of mapper) {
  for (const fil of readdirSync(path.join(her, mappe)).filter(f => /\.test\.(m?js|cjs)$/.test(f)).sort()) {
    const start = Date.now();
    const k = spawnSync(process.execPath, [path.join(her, mappe, fil)], { cwd: her, encoding: 'utf8', timeout: 240000 });
    const ud = (k.stdout || '') + (k.stderr || '');
    const bestaaet = (ud.match(/^PASS /gm) || []).length, fejlet = ud.match(/^FAIL .*$/gm) || [];
    const ok = k.status === 0;
    resultat.push({ test: `${mappe}/${fil}`, ok, bestaaet, fejlet, sek: ((Date.now() - start) / 1000).toFixed(1) });
    console.log(`${ok ? 'OK  ' : 'FEJL'}  ${mappe}/${fil}  (${bestaaet} tjek, ${((Date.now() - start) / 1000).toFixed(1)} s)`);
    if (!ok) {   // hele outputtet gemmes, så en fejl der kun kommer en gang (timing) kan findes bagefter; i CI uploades mappen som artefakt
      mkdirSync(path.join(her, 'fejllog'), { recursive: true });
      const logfil = path.join('fejllog', `${mappe}-${fil}.txt`);
      writeFileSync(path.join(her, logfil), `${new Date().toISOString()}  ${mappe}/${fil}  status=${k.status} signal=${k.signal}\n\n${ud}`);
      console.log(`      (fuld log: tests/${logfil.replace(/\\/g, '/')})`);
    }
    if (!ok) { (fejlet.length ? fejlet : [ud.trim().split('\n').slice(-8).join('\n')]).forEach(l => console.log('      ' + l)); }
  }
}
const fejl = resultat.filter(r => !r.ok);
console.log(`\n${resultat.length - fejl.length} af ${resultat.length} testfiler bestået, ${resultat.reduce((s, r) => s + r.bestaaet, 0)} tjek i alt.`);
process.exit(fejl.length ? 1 : 0);
