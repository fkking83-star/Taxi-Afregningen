// Syntetiske bon-lignende billeder til scan-testene: hvidt papir med sort tekst på mørkt bord, tegnet i en canvas og forringet kontrolleret.
// Intet rigtigt billede bruges. Returnerer JPEG som Buffer. Valgfri EXIF-orientering indsættes i JPEG'en (til test af kameraets rotation).
const TEGN = String.raw`(o) => {
  let seed = o.seed || 11; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  const W = o.w, H = o.h, c = document.createElement('canvas'); c.width = W; c.height = H; const x = c.getContext('2d');
  x.fillStyle = o.bord || '#33363d'; x.fillRect(0, 0, W, H);
  x.save();
  if (o.blur) x.filter = 'blur(' + o.blur + 'px)';
  x.translate(W / 2, H / 2); if (o.rot) x.rotate(o.rot * Math.PI / 180);
  const bw = Math.round(W * (o.bonB || 0.6)), bh = Math.round(H * (o.bonH || 0.9));
  x.fillStyle = o.papir || '#ebe8e0'; x.fillRect(-bw / 2, -bh / 2, bw, bh);
  x.fillStyle = o.blæk || '#16181c'; const fs = Math.round(bw / 22); x.font = 'bold ' + fs + 'px monospace'; x.textBaseline = 'top';
  const linjer = Math.floor(bh / (fs * 1.5)) - 1;
  for (let i = 0; i < linjer; i++) { let t = ''; const n = 6 + Math.floor(rnd() * 14); for (let k = 0; k < n; k++) t += '0123456789.,ABKNRTVD '[Math.floor(rnd() * 21)]; x.fillText(t, -bw / 2 + fs, -bh / 2 + fs + i * fs * 1.5); }
  x.restore();
  if (o.moerk) { x.fillStyle = 'rgba(0,0,0,' + o.moerk + ')'; x.fillRect(0, 0, W, H); }
  if (o.genskin) { const g = x.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, W * o.genskin); g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.7, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = g; x.fillRect(0, 0, W, H); }
  return c.toDataURL('image/jpeg', o.q || 0.9).split(',')[1];
}`;
async function lav(page, o) { return Buffer.from(await page.evaluate(`(${TEGN})(${JSON.stringify(o)})`), 'base64'); }
// Indsætter en EXIF-blok med Orientation i en JPEG (1..8)
function medExif(jpg, orient) {
  const app1 = Buffer.from([0xFF, 0xE1, 0x00, 0x22, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00, 0x4D, 0x4D, 0x00, 0x2A, 0x00, 0x00, 0x00, 0x08, 0x00, 0x01, 0x01, 0x12, 0x00, 0x03, 0x00, 0x00, 0x00, 0x01, 0x00, orient, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  return Buffer.concat([jpg.subarray(0, 2), app1, jpg.subarray(2)]);
}
module.exports = { lav, medExif };
