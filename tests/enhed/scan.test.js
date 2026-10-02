// "Scan før send", lag 1: de rene målefunktioner i blokken SCAN-START … SCAN-SLUT i site/index.html (uden browser, på gråtone-arrays).
// Billedtest i rigtig browser (canvas, EXIF, knapper, netværk) ligger i browser/scan.test.js. Tærsklerne er STARTVÆRDIER; målefasen sætter de endelige.
const fs = require('fs'), path = require('path');
const side = fs.readFileSync(path.join(__dirname, '..', '..', 'site', 'index.html'), 'utf8');
const m = side.match(/\/\* SCAN-START[\s\S]*?\/\* SCAN-SLUT \*\//);
let fails = 0; const check = (c, t) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${t}`); if (!c) fails++; };
check(!!m && side.split('SCAN-START').length === 2 && side.split('SCAN-SLUT').length === 2, 'Scan-blokken findes én gang i index.html');
const blok = m[0];
const S = new Function('performance', 'document', blok + ';return {SCAN_GRAENSER,SCAN_TEKST,SCAN_KOLONNER,scanGraa,scanOtsu,scanHist,scanStoerste,scanFindBon,scanMaalRoi,scanAfgoer,scanRaekke};')(performance, {});
const G = S.SCAN_GRAENSER;

// --- Blokken er lokal: ingen netværk, ingen biblioteker, intet fra Make
check(!/\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|importScripts|\bimport\s*\(|https?:\/\/|MAKE_WEBHOOK_URL|FormData/.test(blok), 'Scan-blokken indeholder intet netværkskald, ingen adresser og rører ikke Make-formularen');

// --- Hjælpere: syntetiske gråtone-billeder
let seed = 5; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
const rect = (g, w, x0, y0, x1, y1, v) => { for (let y = y0; y < y1; y++) g.fill(v, y * w + x0, y * w + x1); };
function billede(w, h, o = {}) {              // mørkt bord, lys bon, sort tekst
  const g = new Uint8Array(w * h).fill(o.bord ?? 60);
  const b = o.bon || { x0: Math.round(w * 0.2), y0: Math.round(h * 0.05), x1: Math.round(w * 0.8), y1: Math.round(h * 0.95) };
  rect(g, w, b.x0, b.y0, b.x1, b.y1, o.papir ?? 235);
  for (let y = b.y0 + 15; y < b.y1 - 15; y += 18) for (let x = b.x0 + 15; x < b.x1 - 30; x += 9) if (rnd() < 0.7) rect(g, w, x, y, x + 5, y + 10, 30);
  return g;
}
function bredde(g, w, h, r) {                 // boks-sløring
  if (!r) return g; const t = new Float32Array(g.length), o = new Uint8Array(g.length), n = 2 * r + 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += g[y * w + Math.min(w - 1, Math.max(0, x + k))]; t[y * w + x] = s / n; }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let s = 0; for (let k = -r; k <= r; k++) s += t[Math.min(h - 1, Math.max(0, y + k)) * w + x]; o[y * w + x] = s / n; }
  return o;
}

// --- Otsu og sammenhængende områder
{
  const h = new Uint32Array(256); h[40] = 500; h[200] = 500;
  const t = S.scanOtsu(h, 1000); check(t >= 40 && t < 200, 'Otsu lægger tærsklen mellem to toppe (' + t + ')');
  const mask = new Uint8Array(6 * 4); [0, 1, 6, 7, 10, 11, 16, 17, 18].forEach(i => mask[i] = 1);   // 4 blokke øverst-venstre, 3 + 2 i andre grupper
  const k = S.scanStoerste(mask, 6, 4); check(k && k.antal === 4 && k.x0 === 0 && k.x1 === 1 && k.y0 === 0 && k.y1 === 1, 'Største sammenhængende område findes (4 blokke, boks 0–1 × 0–1)');
  check(S.scanStoerste(new Uint8Array(12), 4, 3) === null, 'Tom maske giver ingen område');
}

// --- Bonen findes og måles
{
  const w = 750, h = 1000, g = billede(w, h), b = S.scanFindBon(g, w, h, G);
  check(b.fundet && Math.abs(b.x0 - 150) <= 8 && Math.abs(b.x1 - 600) <= 8 && Math.abs(b.y0 - 50) <= 8 && Math.abs(b.y1 - 950) <= 8, 'Bonens boks findes inden for én blok');
  check(b.fyld > 0.5 && b.langside > 0.85 && !b.roererKant && b.vinkel !== null && b.vinkel < 2, 'God bon: fylder, rører ikke kanten, ingen hældning');
  const lille = S.scanFindBon(billede(w, h, { bon: { x0: 320, y0: 450, x1: 430, y1: 560 } }), w, h, G);
  check(lille.fyld < G.minBonFyld || lille.areal < G.minBonAreal, 'En lille bon midt i billedet fylder for lidt');
  const kant = S.scanFindBon(billede(w, h, { bon: { x0: 150, y0: 0, x1: 600, y1: 950 } }), w, h, G);
  check(kant.roererKant, 'Bon der er skåret af foroven rører billedets kant');
  const intet = S.scanFindBon(new Uint8Array(w * h).fill(128), w, h, G);
  check(!intet.fundet || (intet.fyld > 0.99 && intet.roererKant), 'Ensfarvet billede (eller bord og papir i samme farve): ingen bon, eller en "bon" der er hele billedet og rører kanten, så afgørelsen bliver "hele bonen skal med"');
}

// --- Målinger på bonen: skarp / sløret / mørk / genskin
{
  const w = 640, h = 900, skarp = billede(w, h, { bon: { x0: 0, y0: 0, x1: w, y1: h } });
  const ms = S.scanMaalRoi(skarp, w, h, G);
  check(ms.laplace >= G.minLaplace * 5 && ms.median >= 200 && ms.kontrast >= 150 && ms.genskinBlok === 0, 'Skarp bon: høj laplace, lys, god kontrast, intet genskin (laplace ' + Math.round(ms.laplace) + ')');
  const l = r => S.scanMaalRoi(bredde(skarp, w, h, r), w, h, G).laplace;
  check(l(1) > l(2) && l(2) > l(3) && l(3) > l(5), 'Laplace falder, jo mere sløret (' + [0, 1, 2, 3, 5].map(r => Math.round(r ? l(r) : ms.laplace)).join(' > ') + ')');
  check(l(1) >= G.minLaplace && l(4) < G.minLaplace, 'Let sløring (1) er over grænsen, kraftig (4) under');
  const mork = skarp.map(v => v * 0.3), mm = S.scanMaalRoi(mork, w, h, G);
  check(mm.median < G.minMedian && mm.kontrast < G.minKontrast + 20, 'Mørkt billede (30 % lys): median og kontrast ligger lavt (' + mm.median + '/' + mm.kontrast + ')');
  const gen = skarp.slice(); for (let y = 100; y < 400; y++) for (let x = 200; x < 500; x++) gen[y * w + x] = 255;
  const mg = S.scanMaalRoi(gen, w, h, G);
  check(mg.genskinBlok >= G.genskinBlokAndel && mg.genskinDaekning < G.genskinMaksDaekning, 'Hvid plet (300×300) måles som sammenhængende genskin');
  const lys = S.scanMaalRoi(billede(w, h, { bon: { x0: 0, y0: 0, x1: w, y1: h }, papir: 250 }), w, h, G);
  check(lys.genskinTotal > 0.5 && lys.genskinDaekning >= G.genskinMaksDaekning, 'Hele papiret er lyst: stort hvidt areal, men ikke en plet (dækning ' + lys.genskinDaekning.toFixed(2) + ')');
  const tom = S.scanMaalRoi(new Uint8Array(8 * 8).fill(100), 8, 8, G);
  check(tom.laplace === 0 && tom.median === 100, 'Meget lille udsnit giver tal og ingen undtagelse');
}

// --- Afgørelsen: hver årsag, grænser og kombinationer
{
  const god = () => ({ bredde: 1500, hoejde: 2000, bonBredde1600: 900, bon: { fundet: true, areal: 0.5, fyld: 0.5, langside: 0.9, roererKant: false, vinkel: 1 }, roi: { laplace: 1500, median: 220, kontrast: 180, genskinBlok: 0, genskinTotal: 0, genskinDaekning: 0 } });
  const a = o => S.scanAfgoer(o, G);
  check(a(god()).godkendt && a(god()).aarsager.length === 0, 'God måling: godkendt');
  let o = god(); o.hoejde = 999; o.bredde = 999; check(a(o).aarsager.join() === 'lille', 'Korteste side 999 px: for lille'); o = god(); o.bredde = 1000; o.hoejde = 1000; check(a(o).godkendt, 'Korteste side 1000 px: ok (grænsen er med)');
  o = god(); o.bonBredde1600 = 599; check(a(o).aarsager.join() === 'lille', 'Bon under 600 px bred ved 1600: for lille'); o.bonBredde1600 = 600; check(a(o).godkendt, 'Bon 600 px: ok');
  o = god(); o.bon.fundet = false; check(a(o).aarsager.join() === 'hele', 'Ingen bon fundet: hele bonen skal med');
  o = god(); o.bon.fyld = 0.34; check(a(o).aarsager.join() === 'hele', 'Bon fylder 34 %: hele bonen skal med'); o.bon.fyld = 0.35; check(a(o).godkendt, 'Bon fylder 35 %: ok');
  o = god(); o.bon.langside = 0.59; check(a(o).aarsager.join() === 'hele', 'Bons lange side 59 %: hele bonen skal med');
  o = god(); o.bon.roererKant = true; check(a(o).aarsager.join() === 'hele', 'Bon rører kanten: hele bonen skal med');
  o = god(); o.roi.laplace = G.minLaplace - 1; check(a(o).aarsager.join() === 'sloeret', 'Laplace under grænsen: for sløret'); o.roi.laplace = G.minLaplace; check(a(o).godkendt, 'Laplace præcis på grænsen: ok');
  o = god(); o.roi.median = G.minMedian - 1; check(a(o).aarsager.join() === 'moerkt', 'Median under grænsen: for mørkt'); o = god(); o.roi.kontrast = G.minKontrast - 1; check(a(o).aarsager.join() === 'moerkt', 'Kontrast under grænsen: for mørkt');
  o = god(); o.roi.genskinBlok = 0.04; o.roi.genskinDaekning = 0.3; check(a(o).aarsager.join() === 'genskin', 'Hvid plet på 4 %: genskin'); o.roi.genskinDaekning = 0.8; check(a(o).godkendt, 'Hvidt over hele papiret (dækning 80 %) er ikke genskin');
  o = god(); o.roi.genskinTotal = 0.35; o.roi.genskinDaekning = 0.5; check(a(o).aarsager.join() === 'genskin', '35 % hvide pixel i en plet: genskin');
  o = god(); o.roi.laplace = 1; o.roi.median = 10; o.bon.roererKant = true; check(a(o).aarsager.join() === 'hele,sloeret,moerkt', 'Flere årsager samles i fast rækkefølge');
  o = god(); o.bon.vinkel = 13; check(a(o).godkendt && /lige/.test(a(o).hint), 'Skæv bon (13°) giver kun et hint, ikke afvisning'); o.bon.vinkel = 12; check(a(o).hint === '', 'Hint først over 12°'); o.bon.vinkel = null; check(a(o).hint === '', 'Ukendt vinkel: intet hint');
  check(Object.keys(S.SCAN_TEKST).every(k => ['lille', 'hele', 'sloeret', 'moerkt', 'genskin'].includes(k)) && S.SCAN_TEKST.sloeret === 'for sløret' && S.SCAN_TEKST.hele === 'hele bonen skal med', 'Årsagsteksterne er de aftalte');
}

// --- Måle-linjen til regnearket
{
  const r = { bredde: 1500, hoejde: 2000, bonBredde1600: 717.4, bon: { fundet: true, areal: 0.5123, fyld: 0.54, langside: 0.9, roererKant: false, vinkel: null }, roi: { laplace: 1895.26, gradP90: 197, median: 231, kontrast: 197, genskinBlok: 0, genskinTotal: 0, genskinDaekning: 0 }, godkendt: false, aarsager: ['sloeret', 'moerkt'], ms: 88 };
  const felter = S.scanRaekke('bon 1.jpg', r).split('\t');
  check(felter.length === S.SCAN_KOLONNER.length && felter[0] === 'bon 1.jpg' && felter[S.SCAN_KOLONNER.indexOf('laplace')] === '1895,3' && felter[S.SCAN_KOLONNER.indexOf('vinkel')] === '' && felter[S.SCAN_KOLONNER.indexOf('aarsager')] === 'sloeret+moerkt', 'Målelinjen har én tabulator-adskilt kolonne pr. overskrift, danske decimaler og tom vinkel (' + felter.length + ' kolonner)');
}

console.log(fails ? `\n${fails} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(fails ? 1 : 0);
