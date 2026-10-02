#!/usr/bin/env node
// Engangsjob: omsætningskontrollen bagud over alle billeder. KUN LÆSNING (intet skrives til databasen eller Storage).
// Brug (se README.md):  node koer.mjs --toer | --proeve 20 | --alle --bekraeft=<antal> | --rapport [--sammenlign-db]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { lavSupabase, ocrBon, aflaesAlle, udvalg, byggRapport, csv } from './lib.mjs';

const her = path.dirname(fileURLToPath(import.meta.url));
const ARB = process.env.BAGUD_ARBEJDSMAPPE || her;   // hvor cache/ og rapport/ ligger (kun ændret i tests)
const CACHE = path.join(ARB, 'cache', 'ocr.jsonl'), RAPPORT = path.join(ARB, 'rapport');
const arg = n => { const i = process.argv.indexOf('--' + n); return i < 0 ? null : (process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : true); };
const medVaerdi = n => { const a = process.argv.find(x => x.startsWith('--' + n + '=')); return a ? a.split('=')[1] : null; };
const env = n => { const v = process.env[n]; if (!v) { console.error(`Mangler miljøvariablen ${n} (se README.md)`); process.exit(2); } return v; };

function lavCache() {
  fs.mkdirSync(path.dirname(CACHE), { recursive: true });
  const m = new Map();
  if (fs.existsSync(CACHE)) fs.readFileSync(CACHE, 'utf8').split('\n').filter(Boolean).forEach(l => { try { const p = JSON.parse(l); m.set(p.bucket + '/' + p.navn, p); } catch (_) {} });
  return { has: k => m.has(k), alle: () => [...m.values()], set: (k, p) => { m.set(k, p); fs.appendFileSync(CACHE, JSON.stringify(p) + '\n'); } };
}
const sb = () => lavSupabase({ url: env('SUPABASE_URL'), anon: env('SUPABASE_ANON_KEY'), ownerToken: env('OWNER_TOKEN') });
const ocrFn = () => { const apiKey = env('OPENAI_API_KEY'), model = env('OPENAI_MODEL'), url = process.env.OPENAI_URL || undefined; return ({ bytes, mime }) => ocrBon({ apiKey, model, bytes, mime, url }); };

(async () => {
  if (arg('toer')) {
    const liste = await sb().liste(), cache = lavCache(), klaret = new Set(cache.alle().map(p => p.bucket + '/' + p.navn));
    const billeder = liste.filter(b => /\.(jpe?g|png|webp|heic)$/i.test(b.navn));
    console.log(`Filer i de to buckets: ${liste.length}, heraf billeder: ${billeder.length}. Allerede læst (cache): ${klaret.size}. Mangler: ${udvalg(liste, klaret).length}.`);
    console.log('Intet er hentet eller sendt til OpenAI. Næste skridt: node koer.mjs --proeve 20');
  } else if (arg('proeve')) {
    const n = Number(arg('proeve')) || 20, sup = sb(), cache = lavCache();
    const liste = (await sup.liste());
    const r = await aflaesAlle({ liste, cache, hent: sup.hent, ocr: ocrFn(), max: n, samtidige: 1, log: s => process.stdout.write(`\r${s}`) });
    console.log(`\nLæst ${r.aflaest}, fejlet ${r.fejlet}. Sammenlign nu hver linje med billedet:`);
    for (const p of cache.alle().slice(-n)) {
      const b = p.bon || {};
      console.log([p.navn, p.ok ? '' : 'FEJL ' + p.fejl, `nr=${b.slutrapport_nr}`, `taxi=${b.taxi_nr}`, `dato=${b.dato}`, `TOTAL=${b.total_dkk}`, `ture(kum)=${b.antal_ture_kumulativt}`, `taxameter=${b.taxameter_dkk}`, `fastpris=${b.fastpris_dkk}`, `sikkerhed=${b.sikkerhed}`, b.bemaerkning ? `bem=${b.bemaerkning}` : ''].filter(Boolean).join('  '));
    }
    console.log('Passer felterne ikke med billederne, så RET instruktionen i lib.mjs (PROMPT) før --alle.');
  } else if (arg('alle')) {
    const sup = sb(), cache = lavCache(), liste = await sup.liste();
    const mangler = udvalg(liste, new Set(cache.alle().map(p => p.bucket + '/' + p.navn))).length;
    if (medVaerdi('bekraeft') !== String(mangler)) { console.error(`Der er ${mangler} billeder at læse (hvert er ét kald til OpenAI mod din regning). Kør igen med --bekraeft=${mangler}, hvis det er i orden.`); process.exit(3); }
    const r = await aflaesAlle({ liste, cache, hent: sup.hent, ocr: ocrFn(), samtidige: Number(medVaerdi('samtidige')) || 2, log: s => process.stdout.write(`\r${s}`) });
    console.log(`\nLæst ${r.aflaest}, fejlet ${r.fejlet}, resterende ${r.resterende}. Kør derefter: node koer.mjs --rapport`);
  } else if (arg('rapport')) {
    const cache = lavCache(); let dbVagter = null;
    if (arg('sammenlign-db')) {
      const sup = sb(), maaneder = new Set();
      cache.alle().forEach(p => { const d = (p.bon && p.bon.dato) || ''; const m = /(\d{4})-(\d{2})/.exec(d); if (m) maaneder.add(m[1] + '-' + m[2]); });
      dbVagter = []; for (const m of [...maaneder].sort()) dbVagter.push(...await sup.vagter(m));
    }
    const rap = byggRapport({ poster: cache.alle(), dbVagter });
    fs.mkdirSync(RAPPORT, { recursive: true });
    fs.writeFileSync(path.join(RAPPORT, 'opsummering.txt'), rap.resume);
    fs.writeFileSync(path.join(RAPPORT, 'led.csv'), csv(rap.led, ['bil', 'type', 'fra_nr', 'til_nr', 'fra_dato', 'til_dato', 'manglende_numre', 'diff_total', 'forventet', 'mangler_kr', 'mangler_ture', 'fra_fil', 'til_fil']));
    fs.writeFileSync(path.join(RAPPORT, 'vagter_der_mangler.csv'), csv(rap.mangler, ['bil', 'fra_nr', 'til_nr', 'fra_dato', 'til_dato', 'manglende_numre', 'mangler_kr', 'mangler_ture', 'fra_fil', 'til_fil']));
    fs.writeFileSync(path.join(RAPPORT, 'uloeselige.csv'), csv(rap.uloeselige, ['fil', 'aarsag']));
    fs.writeFileSync(path.join(RAPPORT, 'mangelfulde_boner.csv'), csv(rap.mangelfulde, ['fil', 'nr', 'mangler']));
    if (rap.ikkeIDb) { fs.writeFileSync(path.join(RAPPORT, 'bon_uden_vagt_i_db.csv'), csv(rap.ikkeIDb, ['fil', 'nr', 'dato', 'forer', 'indkort', 'total_dkk'])); fs.writeFileSync(path.join(RAPPORT, 'afvigende_indkoert.csv'), csv(rap.afvigIndkort, ['nr', 'fil', 'bon_indkoert', 'db_indkoert'])); }
    console.log(rap.resume + `\nFiler skrevet i ${RAPPORT}`);
  } else {
    console.log('Brug: node koer.mjs --toer | --proeve 20 | --alle --bekraeft=<antal> [--samtidige=2] | --rapport [--sammenlign-db]');
  }
})().catch(e => { console.error('FEJL:', String(e && e.message || e).replace(/Bearer\s+\S+/g, 'Bearer ***')); process.exit(1); });
