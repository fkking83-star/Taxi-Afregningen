// Engangsjob: læs TOTAL DKK og ANTAL TURE fra alle bon-billeder i Storage, og kør omsætningskontrollen bagud.
// KUN LÆSNING: intet skrives til databasen eller Storage. Billederne hentes fra de offentlige URL'er; listen over filer kommer fra
// RPC'en hent_billedliste (kræver ejer-koden). Bon-aflæsningen sker hos OpenAI (som i Make i dag). Ingen nøgler gemmes eller skrives i filer.
// Funktionerne tager fetch og OCR som parametre, så alt kan testes uden netværk.
import { createRequire } from 'module';
const Kontroller = createRequire(import.meta.url)('../../site/kontroller.js');

// ---------- Tal og datoer, som de står på bonen ----------
/** "12.345,50", "12345,5", "12 345.50", "1.234", "-5", 3440 -> tal. Ukendt/tomt -> null. Punktum alene med præcis 3 cifre efter er tusindtalsskilletegn. */
export function tal(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  let t = String(v).trim().replace(/\s|kr\.?|dkk/gi, '');
  if (!/^[-+]?[0-9.,]+$/.test(t)) return null;
  const ko = t.lastIndexOf(','), pu = t.lastIndexOf('.');
  if (ko >= 0 && pu >= 0) t = ko > pu ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '');
  else if (ko >= 0) t = (t.match(/,/g).length > 1) ? t.replace(/,/g, '') : t.replace(',', '.');   // ét komma = decimalkomma (dansk); flere = tusindtalsskilletegn
  else if (pu >= 0 && (t.match(/\./g).length > 1 || /^[-+]?\d{1,3}\.\d{3}$/.test(t))) t = t.replace(/\./g, '');
  const n = Number(t);
  return isFinite(n) ? n : null;
}

/** Dato som på bonen -> { iso, tvetydig } eller null. åååå-mm-dd, dd-mm-åååå, dd.mm.åååå, dd/mm/åå(åå). åååå-dd-mm kan ikke skelnes fra åååå-mm-dd, når begge ≤ 12 (tvetydig). */
export function parseDato(s) {
  const t = String(s ?? '').trim();
  let m = /^(\d{4})[-./](\d{1,2})[-./](\d{1,2})$/.exec(t);
  const lav = (y, mm, d) => (mm >= 1 && mm <= 12 && d >= 1 && d <= 31 && new Date(Date.UTC(y, mm - 1, d)).getUTCMonth() === mm - 1) ? `${y}-${String(mm).padStart(2, '0')}-${String(d).padStart(2, '0')}` : null;
  if (m) {
    const y = +m[1], a = +m[2], b = +m[3];
    const iso = lav(y, a, b), omv = lav(y, b, a);
    if (iso && omv && a !== b) return { iso, tvetydig: true };
    return iso ? { iso, tvetydig: false } : omv ? { iso: omv, tvetydig: false } : null;
  }
  m = /^(\d{1,2})[-./](\d{1,2})[-./](\d{2}|\d{4})$/.exec(t);
  if (m) { const y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; const iso = lav(y, +m[2], +m[1]); return iso ? { iso, tvetydig: false } : null; }
  return null;
}
/** Regnskabsmåned (28.–27.): dag 28 og frem tæller til næste måned. */
export function regnskabsmaaned(iso) {
  const [y, m, d] = String(iso).split('-').map(Number); if (!y) return '';
  const t = d >= 28 ? new Date(Date.UTC(y, m, 1)) : new Date(Date.UTC(y, m - 1, 1));
  return t.getUTCFullYear() + '-' + String(t.getUTCMonth() + 1).padStart(2, '0');
}

// ---------- Aflæsning (OCR) ----------
export const FELTER = ['kilde_overskrift', 'bontype', 'taxi_nr', 'slutrapport_nr', 'dato', 'vagt_start', 'vagt_slut', 'forer', 'chauffor_nr',
  'total_dkk', 'antal_ture_kumulativt', 'taxameter_dkk', 'fastpris_dkk', 'ture_i_vagten', 'indkort', 'overfort', 'sikkerhed', 'bemaerkning'];
export const SKEMA = {
  type: 'object', additionalProperties: false, required: ['laesbar', ...FELTER],
  properties: Object.fromEntries([['laesbar', { type: 'boolean' }], ...FELTER.map(f => [f, f === 'bontype' ? { type: 'string', enum: ['endelig', 'foreloebig', 'ukendt'] }
    : f === 'sikkerhed' ? { type: 'string', enum: ['hoej', 'middel', 'lav'] } : { type: ['string', 'null'] }])]),
};
export const PROMPT = `Du læser et billede af en dansk taxa-slutrapport (bon). Aflæs præcis det, der står. Gæt aldrig, regn aldrig, og udfyld aldrig et felt, du ikke kan se: brug null.
Tal og tekster returneres PRÆCIS som trykt (fx "12.345,50"), som tekst.
Felter:
- laesbar: false, hvis billedet ikke er en slutrapport eller er helt ulæseligt.
- kilde_overskrift: bonens overskrift (fx DANTAXI eller Taxi 4x27).
- bontype: "foreloebig" hvis bonen er mærket foreløbig, "endelig" hvis den er en afsluttet slutrapport, ellers "ukendt".
- taxi_nr: bilens taxi nr. (fx 001-8208). slutrapport_nr: slutrapportens nummer. dato: vagtens startdato. vagt_start, vagt_slut: tider. forer: navnet efter FØRER. chauffor_nr: nummeret efter CHAUFFØR.
- total_dkk: tællerens "TOTAL DKK" (kumulativ, løber fra bilens start). antal_ture_kumulativt: "ANTAL TURE" (kumulativ).
- taxameter_dkk og fastpris_dkk: vagtens egne beløb for taxameter og fastpris. ture_i_vagten: vagtens egne antal ture, hvis det står der.
- indkort og overfort: vagtens indkørte og overførte beløb.
- sikkerhed: "hoej" hvis alle tal er skarpe, "lav" hvis et tal er utydeligt eller du er i tvivl.
- bemaerkning: kort, på dansk, hvis noget er uklart, eller hvis bonen har andre navne for felterne.
Dette er en første udgave af instruktionen: den er endnu ikke afprøvet på rigtige boner.`;

/** Ét kald til OpenAI (Chat Completions med strict json_schema). Returnerer den læste bon som objekt. Kaster ved fejl. */
export async function ocrBon({ fetchImpl = fetch, apiKey, model, bytes, mime = 'image/jpeg', url = 'https://api.openai.com/v1/chat/completions' }) {
  if (!apiKey || !model) throw new Error('OPENAI_API_KEY og OPENAI_MODEL skal være sat');
  const b64 = Buffer.from(bytes).toString('base64');
  const r = await fetchImpl(url, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model, temperature: 0,
      messages: [{ role: 'system', content: PROMPT }, { role: 'user', content: [{ type: 'text', text: 'Aflæs bonen.' }, { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}` } }] }],
      response_format: { type: 'json_schema', json_schema: { name: 'bon', strict: true, schema: SKEMA } },
    }),
  });
  if (!r.ok) { const e = new Error('OpenAI HTTP ' + r.status); e.status = r.status; throw e; }
  const j = await r.json();
  const m = j && j.choices && j.choices[0] && j.choices[0].message;
  if (!m || m.refusal || !m.content) throw new Error('OpenAI gav intet svar' + (m && m.refusal ? ' (afvist)' : ''));
  return JSON.parse(m.content);
}

// ---------- Supabase (kun læsning) ----------
export function lavSupabase({ url, anon, ownerToken, fetchImpl = fetch }) {
  const rpc = async (fn, args) => {
    const r = await fetchImpl(`${url}/rest/v1/rpc/${fn}`, { method: 'POST', headers: { apikey: anon, Authorization: `Bearer ${anon}`, 'Content-Type': 'application/json' }, body: JSON.stringify(args) });
    if (!r.ok) { const e = new Error(`${fn}: HTTP ${r.status}`); e.status = r.status; throw e; }
    const t = await r.text(); return t ? JSON.parse(t) : null;
  };
  const offentligUrl = (bucket, navn) => `${url}/storage/v1/object/public/${encodeURIComponent(bucket)}/${navn.split('/').map(encodeURIComponent).join('/')}`;
  return {
    liste: async () => (await rpc('hent_billedliste', { p_token: ownerToken })) || [],
    hent: async (bucket, navn) => {
      const r = await fetchImpl(offentligUrl(bucket, navn));
      if (!r.ok) { const e = new Error(`billede: HTTP ${r.status}`); e.status = r.status; throw e; }
      return { bytes: new Uint8Array(await r.arrayBuffer()), mime: r.headers.get('content-type') || 'image/jpeg' };
    },
    vagter: async (maaned) => (await rpc('hent_ture', { p_token: ownerToken, p_maaned: maaned })) || [],
    offentligUrl,
  };
}

// ---------- Aflæsning af alle billeder (genoptagelig) ----------
const nøgle = b => b.bucket + '/' + b.navn;
const ER_BILLEDE = n => /\.(jpe?g|png|webp|heic)$/i.test(n);
export function udvalg(liste, klaret) { return liste.filter(b => ER_BILLEDE(b.navn) && !klaret.has(nøgle(b))); }

/**
 * @param liste    [{bucket, navn, oprettet}]
 * @param cache    { has(nøgle), set(nøgle, post), alle() }  — poster: { bucket, navn, oprettet, ok, bon|fejl }
 * @param hent     (bucket, navn) -> { bytes, mime }
 * @param ocr      ({ bytes, mime }) -> bon
 */
export async function aflaesAlle({ liste, cache, hent, ocr, max = Infinity, samtidige = 2, forsoeg = 3, vent = ms => new Promise(r => setTimeout(r, ms)), log = () => {} }) {
  const klaret = new Set(cache.alle().map(nøgle));
  const todo = udvalg(liste, klaret).slice(0, max);
  let i = 0, ok = 0, fejl = 0;
  async function en(b) {
    let sidste;
    for (let t = 1; t <= forsoeg; t++) {
      try {
        const { bytes, mime } = await hent(b.bucket, b.navn);
        const bon = await ocr({ bytes, mime });
        cache.set(nøgle(b), { bucket: b.bucket, navn: b.navn, oprettet: b.oprettet, ok: true, bon }); ok++; return;
      } catch (e) { sidste = e; if (!(e.status === 429 || e.status >= 500 || !e.status)) break; await vent(500 * t * t); }
    }
    cache.set(nøgle(b), { bucket: b.bucket, navn: b.navn, oprettet: b.oprettet, ok: false, fejl: String(sidste && sidste.message || sidste).slice(0, 200) }); fejl++;
  }
  async function arbejder() { while (i < todo.length) { const b = todo[i++]; await en(b); log(`${ok + fejl}/${todo.length}`); } }
  await Promise.all(Array.from({ length: Math.max(1, samtidige) }, arbejder));
  return { aflaest: ok, fejlet: fejl, resterende: Math.max(0, udvalg(liste, new Set(cache.alle().map(nøgle))).length) };
}

// ---------- Rapport ----------
export const csv = (raekker, kolonner) => [kolonner.join(';'), ...raekker.map(r => kolonner.map(k => { const v = r[k] ?? ''; const t = String(v); return /[;"\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }).join(';'))].join('\n') + '\n';
const kr = n => (n === null || n === undefined) ? '' : String(Math.round(n * 100) / 100).replace('.', ',');   // til csv (regneark)
const krTekst = n => { const [h, d] = (Math.round(n * 100) / 100).toFixed(2).split('.'); return h.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (d === '00' ? '' : ',' + d); };   // til opsummeringen: 5.000

/** Bygger rapporten ud fra aflæste boner. dbVagter (valgfri): vagter fra databasen [{slutrapport_nr, indkort, ...}] til sammenligning. */
export function byggRapport({ poster, dbVagter = null }) {
  const laeste = poster.filter(p => p.ok && p.bon && p.bon.laesbar !== false);
  const uloeselige = poster.filter(p => !p.ok || (p.bon && p.bon.laesbar === false)).map(p => ({ fil: nøgle(p), aarsag: p.ok ? 'ikke en læsbar slutrapport' : p.fejl }));
  const foreloebige = laeste.filter(p => p.bon.bontype === 'foreloebig').map(p => ({ fil: nøgle(p), nr: p.bon.slutrapport_nr || '' }));
  // Dubletter: samme bil + nummer + TOTAL = samme bon uploadet flere gange; behold den ældste fil
  const set = new Map();
  laeste.filter(p => p.bon.bontype !== 'foreloebig').forEach(p => {
    const k = [p.bon.taxi_nr || '', String(p.bon.slutrapport_nr || '').trim(), tal(p.bon.total_dkk)].join('|');
    if (!set.has(k) || String(p.oprettet) < String(set.get(k).oprettet)) set.set(k, p);
  });
  const boner = [...set.values()].map(p => {
    const d = parseDato(p.bon.dato);
    return { id: nøgle(p), fil: nøgle(p), slutrapport_nr: String(p.bon.slutrapport_nr || '').trim(), taxi_nr: p.bon.taxi_nr ? String(p.bon.taxi_nr).trim() : undefined,
      dato: d ? d.iso : '', dato_tvetydig: !!(d && d.tvetydig), chauffor: p.bon.forer || '', total_dkk: tal(p.bon.total_dkk), ture_kum: tal(p.bon.antal_ture_kumulativt),
      taxameter: tal(p.bon.taxameter_dkk), fastpris: tal(p.bon.fastpris_dkk), ture: tal(p.bon.ture_i_vagten), indkort: tal(p.bon.indkort), sikkerhed: p.bon.sikkerhed };
  });
  const mangelfulde = boner.filter(b => b.total_dkk === null || b.taxameter === null).map(b => ({ fil: b.fil, nr: b.slutrapport_nr, mangler: [b.total_dkk === null ? 'TOTAL DKK' : '', b.taxameter === null ? 'taxameter' : ''].filter(Boolean).join(' + ') }));
  const lavSik = boner.filter(b => b.sikkerhed === 'lav').map(b => ({ fil: b.fil, nr: b.slutrapport_nr }));
  const { led } = Kontroller.omsaetningMellemBoner(boner);

  const raekker = led.map(l => ({ bil: l.bil, type: l.type, fra_nr: l.fra.slutrapport_nr, til_nr: l.til.slutrapport_nr, fra_dato: l.fra.dato, til_dato: l.til.dato,
    manglende_numre: l.numre.join(' '), diff_total: kr(l.diff), forventet: kr(l.forventet), mangler_kr: kr(l.mangler), mangler_ture: l.mangler_ture ?? '', fra_fil: l.fra.fil, til_fil: l.til.fil }));
  const vm = led.filter(l => l.type === 'vagt_mangler');
  const pr = {}; led.forEach(l => { pr[l.type] = (pr[l.type] || 0) + 1; });
  const perBil = {}, perMaaned = {};
  vm.forEach(l => { perBil[l.bil] = (perBil[l.bil] || 0) + l.mangler; const m = l.til.dato ? regnskabsmaaned(l.til.dato) : 'ukendt dato'; perMaaned[m] = (perMaaned[m] || 0) + l.mangler; });
  const sum = vm.reduce((s, l) => s + l.mangler, 0);
  const antalNumre = vm.reduce((s, l) => s + l.numre.length, 0);

  // Sammenligning med databasen: boner, der findes som billede, men ikke som vagt
  let ikkeIDb = null, afvigIndkort = null;
  if (dbVagter) {
    const db = new Map(dbVagter.map(v => [String(v.slutrapport_nr).trim(), v]));
    ikkeIDb = boner.filter(b => b.slutrapport_nr && !db.has(b.slutrapport_nr)).map(b => ({ fil: b.fil, nr: b.slutrapport_nr, dato: b.dato, forer: b.chauffor, indkort: kr(b.indkort), total_dkk: kr(b.total_dkk) }));
    afvigIndkort = boner.filter(b => db.has(b.slutrapport_nr) && b.indkort !== null && Math.abs(Number(db.get(b.slutrapport_nr).indkort) - b.indkort) > 1)
      .map(b => ({ nr: b.slutrapport_nr, fil: b.fil, bon_indkoert: kr(b.indkort), db_indkoert: kr(Number(db.get(b.slutrapport_nr).indkort)) }));
  }
  const resume = [
    `Omsætning mellem boner — bagudkørsel`,
    `Billeder læst: ${poster.length}. Læsbare boner (efter fjernelse af dubletter og foreløbige): ${boner.length}. Ulæselige: ${uloeselige.length}. Foreløbige: ${foreloebige.length}. Uden TOTAL/taxameter: ${mangelfulde.length}. Lav sikkerhed: ${lavSik.length}.`,
    `Sammenligninger mellem nabo-boner i samme bil: ${led.length} (${Object.entries(pr).map(([k, v]) => `${k}: ${v}`).join(', ') || 'ingen'}).`,
    `VAGTER, DER MANGLER: ${vm.length} huller i nummerrækken med kroner imellem, i alt ${antalNumre} manglende numre og MINDST ${krTekst(sum)} kr.`,
    ...Object.entries(perBil).map(([b, v]) => `  ${b}: ${krTekst(v)} kr`),
    ...Object.entries(perMaaned).sort().map(([m, v]) => `  regnskabsmåned ${m}: ${krTekst(v)} kr`),
    `Tomme vagter (hul i nummer med 0 kr imellem, ikke fejl): ${(pr.tom_vagt || 0)}.`,
    `Tallene passer ikke (omsaetning_passer_ikke / taeller_faldt): ${(pr.omsaetning_passer_ikke || 0) + (pr.taeller_faldt || 0)} — oftest en forlæst bon; tjek billederne.`,
    ...(ikkeIDb ? [`Boner med billede, men uden vagt i databasen: ${ikkeIDb.length}. Afvigende indkørt mellem bon og database: ${afvigIndkort.length}.`] : []),
    `OBS: beløbene er et MINDSTEBELØB ud fra tællerne, og hver kroneværdi bygger på OCR-aflæsning. Gå listen igennem mod billederne, før noget rettes.`,
  ].join('\n') + '\n';
  return { resume, led: raekker, mangler: raekker.filter(r => r.type === 'vagt_mangler'), uloeselige, foreloebige, mangelfulde, lavSik, ikkeIDb, afvigIndkort, boner, tal: { vagterMangler: vm.length, kr: sum, numre: antalNumre, perBil, perMaaned, perType: pr } };
}
