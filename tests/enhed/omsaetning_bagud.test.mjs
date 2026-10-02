// scripts/omsaetning-bagud: tal og datoer fra bonen, aflæsning (med falsk OpenAI), genoptagelse, sikkerhed (kun læsning) og rapport.
import { tal, parseDato, regnskabsmaaned, ocrBon, lavSupabase, aflaesAlle, udvalg, byggRapport, csv, SKEMA, PROMPT, FELTER } from '../../scripts/omsaetning-bagud/lib.mjs';
import fs from 'fs';
let f = 0; const check = (ok, m) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${m}`); if (!ok) f++; };

// ---- tal ----
check(tal('12.345,50') === 12345.5 && tal('12345,5') === 12345.5 && tal('12 345.50') === 12345.5 && tal('1.234') === 1234 && tal('-5') === -5 && tal(3440) === 3440 && tal('3.440,00 kr') === 3440 && tal('1.234.567,89') === 1234567.89, 'tal(): danske og engelske formater, tusindtalsskilletegn, kr, negative');
check(tal('') === null && tal(null) === null && tal('abc') === null && tal('12,3,4') !== null && tal(NaN) === null && tal('12.5') === 12.5, 'tal(): tomt/ugyldigt giver null; 12.5 er decimal');
// ---- datoer ----
check(parseDato('2026-09-22').iso === '2026-09-22' && !parseDato('2026-09-22').tvetydig && parseDato('22.09.2026').iso === '2026-09-22' && parseDato('22/9/26').iso === '2026-09-22' && parseDato('22-09-2026').iso === '2026-09-22', 'parseDato: åååå-mm-dd, dd.mm.åååå, dd/m/åå, dd-mm-åååå');
check(parseDato('2026-09-06').tvetydig === true && parseDato('2026-22-09').iso === '2026-09-22' && parseDato('2026-22-09').tvetydig === false && parseDato('2026-09-09').tvetydig === false, 'parseDato: 2026-09-06 kan være åååå-dd-mm (tvetydig); 2026-22-09 kan kun være åååå-dd-mm; ens dag og måned er ikke tvetydig');
check(parseDato('31.02.2026') === null && parseDato('') === null && parseDato('i dag') === null, 'parseDato: ugyldige datoer giver null');
check(regnskabsmaaned('2026-08-28') === '2026-09' && regnskabsmaaned('2026-09-27') === '2026-09' && regnskabsmaaned('2026-12-30') === '2027-01', 'regnskabsmaaned: dag 28 og frem tæller til næste måned');

// ---- skema og prompt ----
check(SKEMA.additionalProperties === false && SKEMA.required.length === FELTER.length + 1 && SKEMA.required.includes('laesbar') && FELTER.includes('total_dkk') && FELTER.includes('antal_ture_kumulativt') && FELTER.includes('taxameter_dkk') && FELTER.includes('fastpris_dkk'), 'Skemaet er strict og indeholder TOTAL DKK, ANTAL TURE (kumulativt), taxameter og fastpris');
check(/TOTAL DKK/.test(PROMPT) && /ANTAL TURE/.test(PROMPT) && /Gæt aldrig/.test(PROMPT) && /endnu ikke afprøvet/.test(PROMPT), 'Instruktionen siger "gæt aldrig" og at den ikke er afprøvet på rigtige boner');

// ---- ocrBon med falsk OpenAI ----
const kald = [];
const fakeOpenAI = (svar, status = 200) => async (url, init) => { kald.push({ url, init }); return { ok: status === 200, status, json: async () => svar }; };
const bonSvar = o => ({ choices: [{ message: { content: JSON.stringify({ laesbar: true, bontype: 'endelig', sikkerhed: 'hoej', ...Object.fromEntries(FELTER.map(k => [k, null])), bontype2: undefined, ...o }) } }] });
let b = await ocrBon({ fetchImpl: fakeOpenAI(bonSvar({ slutrapport_nr: '1801', total_dkk: '100.000,50' })), apiKey: 'sk-test-HEMMELIG', model: 'm', bytes: new Uint8Array([1, 2, 3]) });
const body = JSON.parse(kald[0].init.body);
check(b.slutrapport_nr === '1801' && body.response_format.type === 'json_schema' && body.response_format.json_schema.strict === true && body.temperature === 0 && body.messages[1].content[1].image_url.url.startsWith('data:image/jpeg;base64,AQID') && kald[0].init.headers.Authorization === 'Bearer sk-test-HEMMELIG', 'ocrBon: strict json_schema, temperatur 0, billedet som base64, nøglen kun i Authorization');
check(await ocrBon({ fetchImpl: fakeOpenAI({}, 429), apiKey: 'k', model: 'm', bytes: [] }).then(() => false, e => e.status === 429), 'ocrBon: HTTP-fejl kastes med status');
check(await ocrBon({ fetchImpl: fakeOpenAI({ choices: [{ message: { refusal: 'nej' } }] }), apiKey: 'k', model: 'm', bytes: [] }).then(() => false, e => /afvist/.test(e.message)), 'ocrBon: afvisning kastes');
check(await ocrBon({ fetchImpl: fakeOpenAI({}), apiKey: '', model: '', bytes: [] }).then(() => false, e => /OPENAI_API_KEY/.test(e.message)), 'ocrBon: uden nøgle/model kastes en tydelig fejl');

// ---- Supabase: kun læsning ----
const sbKald = [];
const fakeSb = async (url, init = {}) => {
  sbKald.push({ url: String(url), method: init.method || 'GET', body: init.body });
  if (url.includes('/rpc/hent_billedliste')) return { ok: true, text: async () => JSON.stringify([{ bucket: 'slutrapport-billeder', navn: 'a/b æ.jpg', oprettet: '2026-09-01T00:00:00Z' }]) };
  if (url.includes('/rpc/hent_ture')) return { ok: true, text: async () => JSON.stringify([{ slutrapport_nr: '1101', indkort: 3000 }]) };
  if (url.includes('/storage/v1/object/public/')) return { ok: true, arrayBuffer: async () => new Uint8Array([9, 9]).buffer, headers: { get: () => 'image/jpeg' } };
  return { ok: false, status: 404, text: async () => '' };
};
const sup = lavSupabase({ url: 'https://x.supabase.co', anon: 'ANON-X', ownerToken: 'EJER-X', fetchImpl: fakeSb });
const liste = await sup.liste(); await sup.hent(liste[0].bucket, liste[0].navn); await sup.vagter('2026-09');
check(liste.length === 1 && sbKald[1].url === 'https://x.supabase.co/storage/v1/object/public/slutrapport-billeder/a/b%20%C3%A6.jpg', 'Billed-URL: offentlig URL med hvert mappenavn kodet');
check(sbKald.every(k => (k.method === 'POST' && /\/rest\/v1\/rpc\/(hent_billedliste|hent_ture)$/.test(k.url)) || (k.method === 'GET' && k.url.includes('/storage/v1/object/public/'))), 'Supabase: kun to læse-RPC\'er (POST) og offentlige GET af billeder; ingen skrivning, ingen sletning');

// ---- aflæsning, genoptagelse, genforsøg ----
const lav = () => { const m = new Map(); return { has: k => m.has(k), alle: () => [...m.values()], set: (k, p) => m.set(k, p) }; };
const lst = ['1100', '1101', '1102', '1103'].map((n, i) => ({ bucket: 'slutrapport-billeder', navn: `${n}_adan_x.jpg`, oprettet: `2026-09-0${i + 1}` })).concat([{ bucket: 'slutrapport-billeder', navn: 'noter.txt', oprettet: '2026-09-01' }]);
let n = 0; const ocrOk = async ({ bytes }) => ({ laesbar: true, slutrapport_nr: String(1100 + n++) });
const cache = lav();
let res = await aflaesAlle({ liste: lst, cache, hent: async () => ({ bytes: new Uint8Array([1]), mime: 'image/jpeg' }), ocr: ocrOk, max: 2, samtidige: 1 });
check(res.aflaest === 2 && res.resterende === 2 && cache.alle().length === 2, 'Aflæsning: --max 2 læser to; ikke-billeder (noter.txt) springes over; to er tilbage');
res = await aflaesAlle({ liste: lst, cache, hent: async () => ({ bytes: new Uint8Array([1]), mime: 'image/jpeg' }), ocr: ocrOk, samtidige: 2 });
check(res.aflaest === 2 && res.resterende === 0 && cache.alle().length === 4 && udvalg(lst, new Set(cache.alle().map(p => p.bucket + '/' + p.navn))).length === 0, 'Genoptagelse: kører igen og læser kun de to resterende');
let forsoeg = 0; const cache2 = lav();
res = await aflaesAlle({ liste: [lst[0]], cache: cache2, hent: async () => ({ bytes: new Uint8Array([1]) }), ocr: async () => { if (++forsoeg < 3) { const e = new Error('429'); e.status = 429; throw e; } return { laesbar: true }; }, vent: async () => {} });
check(forsoeg === 3 && res.aflaest === 1, 'Genforsøg: 429 gentages (op til 3 gange) og lykkes');
const cache3 = lav();
res = await aflaesAlle({ liste: [lst[0]], cache: cache3, hent: async () => ({ bytes: new Uint8Array([1]) }), ocr: async () => { const e = new Error('HTTP 400'); e.status = 400; throw e; }, vent: async () => {} });
check(res.fejlet === 1 && cache3.alle()[0].ok === false && /400/.test(cache3.alle()[0].fejl), 'En permanent fejl (400) gentages ikke og gemmes som fejl i cachen (jobbet fortsætter)');

// ---- rapport ----
const post = (nr, dato, total, tx, fp, ch, extra = {}, bontype = 'endelig') => ({ bucket: 'slutrapport-billeder', navn: `${nr}.jpg`, oprettet: dato, ok: true, bon: { laesbar: true, bontype, taxi_nr: null, slutrapport_nr: String(nr), dato, forer: ch, total_dkk: total, antal_ture_kumulativt: null,
  taxameter_dkk: tx, fastpris_dkk: fp, ture_i_vagten: null, indkort: String(tx), overfort: String(tx), sikkerhed: 'hoej', ...extra } });
const poster = [
  post(1100, '2026-09-01', '100.000,00', '2.500,00', '0', 'Adan'),
  post(1101, '2026-09-02', '103.000,00', '2.800,00', '200,00', 'Fuad'),                        // ok: 3.000 = 2.800 + 200
  post(1103, '2026-09-04', '110.000,00', '2.000,00', '0', 'Adan'),                              // 1102 mangler: diff 7.000, egen 2.000 -> 5.000 kr
  post(1106, '2026-09-07', '112.700,00', '2.500,00', '200,00', 'Fuad'),                         // 1104–1105 tomme: diff 2.700 = 2.500 + 200 -> tom vagt
  post(1107, '2026-09-08', '116.000,00', '2.000,00', '0', 'Adan'),                              // 1.300 kr passer ikke (diff 3.300 vs 2.000)
  post(1103, '2026-09-04', '110.000,00', '2.000,00', '0', 'Adan', {}),                          // dublet af 1103 (samme nr + TOTAL): tælles én gang
  { bucket: 'fejlede-billeder', navn: 'x.jpg', oprettet: '2026-09-05', ok: false, fejl: 'HTTP 400' },
  { bucket: 'fejlede-billeder', navn: 'y.jpg', oprettet: '2026-09-05', ok: true, bon: { laesbar: false } },
  post(1104, '2026-09-05', '999,00', '100,00', '0', 'Qaalid', {}, 'foreloebig'),                // foreløbig: tælles ikke med
  post(1120, '2026-09-20', null, null, null, 'Adan'),                                           // uden TOTAL/taxameter: kan ikke vurderes
];
poster[5].navn = 'dublet-1103.jpg';
let rap = byggRapport({ poster });
const mangler = rap.mangler;
check(rap.tal.vagterMangler === 1 && rap.tal.kr === 5000 && rap.tal.numre === 1 && mangler[0].manglende_numre === '1102' && mangler[0].mangler_kr === '5000', 'Rapport: én vagt mangler (nr 1102), 5.000 kr');
check(rap.tal.perType.tom_vagt === 1 && rap.tal.perType.omsaetning_passer_ikke === 1 && rap.tal.perType.ok === 1, 'Rapport: tom vagt (1104–1105, 0 kr), "passer ikke" (1.300 kr) og ok er hver talt for sig');
check(rap.led.find(l => l.type === 'tom_vagt').manglende_numre === '1104 1105' && rap.led.find(l => l.type === 'omsaetning_passer_ikke').mangler_kr === '1300', 'Rapport: de tomme numre og beløbet, der ikke passer, står i led.csv');
check(rap.uloeselige.length === 2 && rap.foreloebige.length === 1 && rap.mangelfulde.length === 1 && rap.boner.filter(x => x.slutrapport_nr === '1103').length === 1, 'Rapport: 2 ulæselige, 1 foreløbig (tælles ikke med), 1 uden TOTAL/taxameter og dubletten af 1103 er fjernet');
check(rap.tal.perMaaned['2026-09'] === 5000 && rap.tal.perBil['række 1'] === 5000 && /MINDST 5\.000 kr/.test(rap.resume) && /MINDSTEBELØB/.test(rap.resume), 'Rapport: beløb pr. regnskabsmåned og pr. bil; opsummeringen siger "mindst" og advarer om OCR');
rap = byggRapport({ poster, dbVagter: [{ slutrapport_nr: '1100', indkort: 2500 }, { slutrapport_nr: '1101', indkort: 2999 }, { slutrapport_nr: '1103', indkort: 2000 }] });
check(rap.ikkeIDb.map(x => x.nr).sort().join() === '1106,1107,1120' && rap.afvigIndkort.length === 1 && rap.afvigIndkort[0].nr === '1101', 'Sammenligning med databasen: 1106, 1107 og 1120 har billede men ingen vagt; 1101 har anden indkørt (2.800 mod 2.999)');
check(csv([{ a: 'x;y', b: 'sige "hej"', c: 3 }], ['a', 'b', 'c']) === 'a;b;c\n"x;y";"sige ""hej""";3\n', 'csv: semikolon-skilt, citater og anførselstegn escapes');

// ---- Nøgler og kilde ----
const kilde = fs.readFileSync(new URL('../../scripts/omsaetning-bagud/lib.mjs', import.meta.url), 'utf8') + fs.readFileSync(new URL('../../scripts/omsaetning-bagud/koer.mjs', import.meta.url), 'utf8');
check(!/\b(PUT|PATCH|DELETE)\b/.test(kilde) && !/\.upload\(|\.remove\(|\.insert\(|\.update\(/.test(kilde) && !/service_role|SERVICE_KEY/i.test(kilde.replace(/\/\/.*$/gm, '')), 'Kildekoden har ingen skrive-metoder og bruger ingen service_role-nøgle');
check(!/eyJ[A-Za-z0-9_-]{20,}|sk-[A-Za-z0-9]{20,}|sbp_[A-Za-z0-9]{10,}/.test(kilde), 'Ingen nøgler i kildekoden');
const gi = fs.readFileSync(new URL('../../scripts/omsaetning-bagud/.gitignore', import.meta.url), 'utf8');
check(/cache\//.test(gi) && /rapport\//.test(gi), 'cache/ og rapport/ (chaufførnavne og beløb) er i .gitignore');

// ---- Hele kommandolinjen mod en falsk server (ingen rigtig adgang): --toer, --proeve, --alle (med sikring), --rapport ----
import http from 'http';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
const arb = fs.mkdtempSync(path.join(os.tmpdir(), 'bagud-'));
const logg = [];
const bonPrNavn = { '1100.jpg': ['1100', '100.000,00', '2.500,00', '0'], '1101.jpg': ['1101', '103.000,00', '2.800,00', '200,00'], '1103.jpg': ['1103', '110.000,00', '2.000,00', '0'] };
const server = http.createServer((req, res) => {
  let body = ''; req.on('data', c => body += c); req.on('end', () => {
    logg.push({ m: req.method, u: req.url, auth: req.headers.authorization || '' });
    const json = (o) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(o)); };
    if (req.url === '/rest/v1/rpc/hent_billedliste') return json(Object.keys(bonPrNavn).map((n, i) => ({ bucket: 'slutrapport-billeder', navn: n, oprettet: `2026-09-0${i + 1}T00:00:00Z` })));
    if (req.url === '/rest/v1/rpc/hent_ture') return json([{ slutrapport_nr: '1100', indkort: 2500 }, { slutrapport_nr: '1101', indkort: 2800 }]);
    if (req.url.startsWith('/storage/v1/object/public/slutrapport-billeder/')) { res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(Buffer.from(decodeURIComponent(req.url.split('/').pop()))); }
    if (req.url === '/openai') {
      const navn = Buffer.from(JSON.parse(body).messages[1].content[1].image_url.url.split(',')[1], 'base64').toString();
      const [nr, total, tx, fp] = bonPrNavn[navn];
      return json({ choices: [{ message: { content: JSON.stringify({ laesbar: true, bontype: 'endelig', sikkerhed: 'hoej', ...Object.fromEntries(FELTER.map(k => [k, null])), bontype: 'endelig', slutrapport_nr: nr, dato: '2026-09-02', forer: 'Adan', total_dkk: total, taxameter_dkk: tx, fastpris_dkk: fp, indkort: tx, overfort: tx }) } }] });
    }
    res.writeHead(404); res.end();
  });
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
const koer = (args) => new Promise(resolve => {
  const p = spawn(process.execPath, [new URL('../../scripts/omsaetning-bagud/koer.mjs', import.meta.url).pathname, ...args], {
    env: { PATH: process.env.PATH, SUPABASE_URL: `http://127.0.0.1:${port}`, SUPABASE_ANON_KEY: 'ANON-HEMMELIG', OWNER_TOKEN: 'EJER-HEMMELIG', OPENAI_API_KEY: 'OPENAI-HEMMELIG', OPENAI_MODEL: 'test', OPENAI_URL: `http://127.0.0.1:${port}/openai`, BAGUD_ARBEJDSMAPPE: arb } });
  let ud = ''; p.stdout.on('data', d => ud += d); p.stderr.on('data', d => ud += d); p.on('close', kode => resolve({ kode, ud }));
});
let c = await koer([]);
check(c.kode === 0 && /Brug:/.test(c.ud), 'Kommandolinjen: uden argumenter vises brugen');
c = await koer(['--toer']);
check(c.kode === 0 && /billeder: 3/.test(c.ud) && /Mangler: 3/.test(c.ud) && !logg.some(l => l.u === '/openai'), '--toer: tæller 3 billeder og sender intet til OpenAI');
c = await koer(['--proeve', '2']);
check(c.kode === 0 && /Læst 2, fejlet 0/.test(c.ud) && /nr=1100/.test(c.ud) && /TOTAL=100\.000,00/.test(c.ud) && logg.filter(l => l.u === '/openai').length === 2, '--proeve 2: læser 2 billeder og viser felterne til sammenligning med billedet');
c = await koer(['--alle']);
check(c.kode === 3 && /--bekraeft=1/.test(c.ud) && logg.filter(l => l.u === '/openai').length === 2, '--alle uden --bekraeft: stopper og siger antallet (1 tilbage); intet sendt');
c = await koer(['--alle', '--bekraeft=1']);
check(c.kode === 0 && /Læst 1, fejlet 0, resterende 0/.test(c.ud) && logg.filter(l => l.u === '/openai').length === 3, '--alle --bekraeft=1: læser det sidste billede (genoptager efter prøven)');
c = await koer(['--rapport', '--sammenlign-db']);
const opsum = fs.readFileSync(path.join(arb, 'rapport', 'opsummering.txt'), 'utf8');
check(c.kode === 0 && /MINDST 5\.000 kr/.test(opsum) && fs.existsSync(path.join(arb, 'rapport', 'vagter_der_mangler.csv')) && /1102/.test(fs.readFileSync(path.join(arb, 'rapport', 'vagter_der_mangler.csv'), 'utf8')), '--rapport: opsummering og vagter_der_mangler.csv (nr 1102, 5.000 kr)');
check(/1103/.test(fs.readFileSync(path.join(arb, 'rapport', 'bon_uden_vagt_i_db.csv'), 'utf8')), '--rapport --sammenlign-db: nr 1103 har billede men ingen vagt i databasen');
check(logg.every(l => (l.m === 'POST' && /^\/(rest\/v1\/rpc\/(hent_billedliste|hent_ture)|openai)$/.test(l.u)) || (l.m === 'GET' && l.u.startsWith('/storage/v1/object/public/'))), 'Alle kald mod serveren er læsning (to RPC\'er, offentlige billeder) eller OpenAI; intet andet');
check(!c.ud.includes('HEMMELIG') && !fs.readFileSync(path.join(arb, 'cache', 'ocr.jsonl'), 'utf8').includes('HEMMELIG') && !opsum.includes('HEMMELIG'), 'Ingen nøgler i output, cache eller rapport');
c = await koer(['--toer']).then(x => x);   // med manglende miljø
const udenMiljoe = await new Promise(resolve => { const p = spawn(process.execPath, [new URL('../../scripts/omsaetning-bagud/koer.mjs', import.meta.url).pathname, '--toer'], { env: { PATH: process.env.PATH } }); let ud = ''; p.stderr.on('data', d => ud += d); p.on('close', kode => resolve({ kode, ud })); });
check(udenMiljoe.kode === 2 && /SUPABASE_URL/.test(udenMiljoe.ud), 'Uden miljøvariabler: tydelig fejl (kode 2), ingen kald');
server.close(); fs.rmSync(arb, { recursive: true, force: true });
console.log(f ? `\n${f} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(f ? 1 : 0);
