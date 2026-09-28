// Billedviser (zoom/pan/rotér) + to buckets + billeder i "Fejlede uploads".
// Mobil med touch-emulering (knib via CDP-touch, dobbelttryk, træk) og desktop med mus/hjul/taster.
const { chromium } = require('playwright');
const path = require('path');

const BASE = 'https://vehgabygvxnkrqsoazfs.supabase.co';
const PUB = `${BASE}/storage/v1/object/public/`;
const url = (bucket, navn) => PUB + encodeURIComponent(bucket) + '/' + encodeURIComponent(navn);
const BON = url('slutrapport-billeder', '1863_qaalid_1790439824.jpg');   // fra hent_billeder (ny bucket)
const FEJL = url('fejlede-billeder', '_qaalid_1790439628.jpg');          // fra hent_fejl_billeder (uden nummer)

const lon = (chauffor, udb) => ({ chauffor, regnskabsmaaned: '2026-09', antal_ture: 2, indkort_i_alt: 7035,
  overfort_i_alt: 6334, afregn_difference: 701, kontant_i_alt: 0, bro_faerge_i_alt: 0, model: '45%', andel_brutto: 3165.75, til_udbetaling: udb });
const ALLE = [lon('Fuad', 45170.00), lon('Qaalid', 3165.75)];
const t = (id, nr, dato) => ({ id, dato, slutrapport_nr: nr, chauffor: 'Qaalid', indkort: 3710, overfort: 3569, kontant: 0,
  vagt_start: '15:44', vagt_slut: '07:20', billede_url: null, bekraeftet: false });
const TURE = [t('q1', '1862', '2026-09-24'), t('q2', '1863', '2026-09-25')];
const FEJLEDE = [
  { id: 'f-1', status: 'ny', chauffor: 'Qaalid', driver_id: 'qaalid', modtaget: '2026-09-26T16:20:31Z', fejl_besked: 'Ikke læsbar', billede_url: null, filename: 'slutrapport_qaalid_1790439631000.jpg' },
  { id: 'f-2', status: 'ny', chauffor: 'Adan', driver_id: 'adan', modtaget: '2026-09-26T12:00:00Z', fejl_besked: 'Ikke læsbar', billede_url: null },
  { id: 'f-3', status: 'rettet', chauffor: 'Fuad', modtaget: '2026-09-20T12:00:00Z', fejl_besked: 'x', billede_url: null },
];

let fails = 0;
const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const near = (a, b, tol) => Math.abs(a - b) <= tol;

async function setup(browser, opts, BILLEDE) {
  const ctx = await browser.newContext(opts);
  const page = await ctx.newPage();
  const errs = [], ikkeGet = [], kald = [];
  page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) errs.push(m.text()); });
  page.on('pageerror', e => errs.push(e.message));
  page.on('request', r => { if (r.url().includes('/storage/') && r.method() !== 'GET') ikkeGet.push(r.method() + ' ' + r.url()); });
  await page.route('**/*', async route => {
    const u = route.request().url();
    if (u.startsWith(`${BASE}/rest/v1/rpc/`)) {
      const fn = u.split('/rpc/')[1];
      const body = JSON.parse(route.request().postData() || '{}');
      kald.push(fn);
      if (fn === 'hent_alle') return route.fulfill({ json: ALLE });
      if (fn === 'hent_ture') return route.fulfill({ json: TURE });
      if (fn === 'hent_fejlede') return route.fulfill({ json: FEJLEDE });
      if (fn === 'hent_billeder') return route.fulfill({ json: (body.p_numre || []).includes('1863')
        ? [{ navn: '1863_qaalid_1790439824.jpg', slutrapport_nr: '1863', bucket: 'slutrapport-billeder' }] : [] });
      if (fn === 'hent_fejl_billeder') return route.fulfill({ json: [{ fejl_id: 'f-1', bucket: 'fejlede-billeder', navn: '_qaalid_1790439628.jpg' }] });
      return route.fulfill({ status: 204, body: '' });
    }
    if (u === BON || u === FEJL) return route.fulfill({ status: 200, contentType: 'image/png', body: BILLEDE });
    if (u.startsWith('file://')) return route.continue();
    return route.fulfill({ status: 404, body: '' });
  });
  await page.goto('file://' + path.join(__dirname, '..', '..', 'site', 'dashboard.html'));
  await page.selectOption('#driver', 'Qaalid');
  await page.waitForSelector('#row-q2');
  await page.waitForSelector('#row-q2 a[data-lightbox]');
  return { ctx, page, errs, ikkeGet, kald };
}
const state = page => page.evaluate(() => {
  const st = document.getElementById('lbStage').getBoundingClientRect();
  const im = document.getElementById('lightboxImg').getBoundingClientRect();
  return { s: LB.s, tx: LB.tx, ty: LB.ty, rot: LB.rot, zoom: document.getElementById('lbZoom').textContent,
    tf: document.getElementById('lightboxImg').style.transform,
    st: { x: st.x, y: st.y, w: st.width, h: st.height }, im: { x: im.x, y: im.y, w: im.width, h: im.height },
    scrollY: window.scrollY, bodyOverflow: getComputedStyle(document.body).overflow };
});
const waitImg = page => page.waitForFunction(() => { const i = document.getElementById('lightboxImg'); return i.complete && i.naturalWidth > 0 && LB.fit > 0 && i.style.width; });

(async () => {
  const browser = await chromium.launch();
  // Testbillede: 600x1200 (højt som en bon)
  const tmp = await browser.newPage();
  const BILLEDE = Buffer.from((await tmp.evaluate(() => {
    const c = document.createElement('canvas'); c.width = 600; c.height = 1200; const g = c.getContext('2d');
    g.fillStyle = '#fff'; g.fillRect(0, 0, 600, 1200); g.fillStyle = '#000'; g.font = '40px sans-serif'; g.fillText('SLUTRAPPORT 1863', 40, 80);
    return c.toDataURL('image/png').split(',')[1];
  })), 'base64');
  await tmp.close();

  // ================= MOBIL (touch) =================
  {
    const { ctx, page, errs, ikkeGet, kald } = await setup(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 }, BILLEDE);
    check((await page.getAttribute('#row-q2 a[data-lightbox]', 'href')) === BON, 'Tabel: billede fra hent_billeder bygges med bucket "slutrapport-billeder"');
    await page.tap('#row-q2 a[data-lightbox]');
    await waitImg(page);
    let s = await state(page);
    check(near(s.st.w, 390, 1) && s.st.x === 0, 'Mobil (<900px): viseren fylder hele bredden');
    check(s.bodyOverflow === 'hidden', 'Mobil: siden bag viseren kan ikke scrolle');
    check(s.zoom === '100%' && s.im.w <= s.st.w + 1 && s.im.h <= s.st.h + 1 && (near(s.im.w, s.st.w, 1) || near(s.im.h, s.st.h, 1)), 'Billedet tilpasses fladen ved åbning');

    // Dobbelttryk ind / ud
    const cx = s.st.x + s.st.w / 2, cy = s.st.y + s.st.h / 2;
    await page.touchscreen.tap(cx, cy); await page.waitForTimeout(60); await page.touchscreen.tap(cx, cy);
    await page.waitForTimeout(50);
    check((await state(page)).zoom === '250%', 'Dobbelttryk zoomer ind (250 %)');
    await page.touchscreen.tap(cx, cy); await page.waitForTimeout(60); await page.touchscreen.tap(cx, cy);
    await page.waitForTimeout(50);
    check((await state(page)).zoom === '100%', 'Dobbelttryk igen zoomer ud (100 %)');
    await page.waitForTimeout(400);
    await page.touchscreen.tap(cx, cy); await page.waitForTimeout(500); await page.touchscreen.tap(cx, cy);
    check((await state(page)).zoom === '100%', 'To langsomme tryk er ikke et dobbelttryk');

    // Knib (pinch) med to fingre via CDP-touch
    const cdp = await ctx.newCDPSession(page);
    const pinch = async (fra, til, x0 = cx, y0 = cy) => {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x0 - fra / 2, y: y0, id: 1 }, { x: x0 + fra / 2, y: y0, id: 2 }] });
      for (let i = 1; i <= 10; i++) {
        const d = fra + (til - fra) * i / 10;
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x0 - d / 2, y: y0, id: 1 }, { x: x0 + d / 2, y: y0, id: 2 }] });
      }
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    };
    const scrollFoer = (await state(page)).scrollY;
    await pinch(80, 240);
    s = await state(page);
    check(near(s.s, 3, 0.15), `Knib med to fingre zoomer (80→240 px ≈ 300 %, fik ${s.zoom})`);
    check(s.scrollY === scrollFoer, 'Knib scroller ikke siden bagved');
    await pinch(240, 120);
    check(near((await state(page)).s, 1.5, 0.1), 'Knib sammen zoomer ud igen');

    // Træk/pan med én finger når der er zoomet ind
    await page.evaluate(() => lbZoomKnap(2));      // 300 %
    const f = await state(page);
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 3 }] });
    for (let i = 1; i <= 8; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + 10 * i, y: cy + 15 * i, id: 3 }] });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    s = await state(page);
    check(near(s.tx - f.tx, 80, 2) && near(s.ty - f.ty, 120, 2), 'Træk med én finger flytter billedet (80, 120 px)');
    for (let i = 0; i < 4; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: cx, y: cy, id: 4 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: cx + 5000, y: cy + 5000, id: 4 }] });
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    }
    s = await state(page);
    check(s.im.x <= s.st.x + 1 && s.im.y <= s.st.y + 1, 'Billedet kan ikke trækkes ud af fladen');

    // Knapper: Nulstil, +, −, Rotér.
    // NB: I headless Chromium mistes det første tryk efter en CDP-touch-sekvens med bevægelse — også på en
    // tom testside uden dashboard-kode (afprøvet). Et neutralt tryk på titlen "tømmer" det, før knapperne testes.
    await page.tap('#lightboxTitel');
    await page.tap('#lightbox button:has-text("Nulstil")');
    s = await state(page);
    check(s.zoom === '100%' && s.tx === 0 && s.ty === 0, '"Nulstil" går tilbage til 100 % og midten');
    await page.tap('#lightbox button[aria-label="Zoom ind"]');
    check((await state(page)).zoom === '150%', '"+" zoomer ind');
    await page.tap('#lightbox button[aria-label="Zoom ud"]');
    check((await state(page)).zoom === '100%', '"−" zoomer ud');
    const foerRot = await state(page);
    await page.tap('#lightbox button:has-text("Rotér 90°")');
    s = await state(page);
    check(s.rot === 90 && /rotate\(90deg\)/.test(s.tf), '"Rotér 90°" roterer visningen');
    check(s.im.w <= s.st.w + 1 && s.im.h <= s.st.h + 1 && near(s.im.w / s.im.h, foerRot.im.h / foerRot.im.w, 0.02), 'Roteret billede tilpasses fladen (bredde/højde byttet)');
    for (let i = 0; i < 3; i++) await page.tap('#lightbox button:has-text("Rotér 90°")');
    check((await state(page)).rot === 0, '4 × Rotér = tilbage til 0°');
    check(ikkeGet.length === 0, 'Rotation/zoom sender ingen skrivning til Storage (originalen ændres ikke)' + (ikkeGet.length ? ': ' + ikkeGet.join(', ') : ''));

    await page.tap('#lightbox button:has-text("Luk")');
    check(!(await page.isVisible('#lightbox')) && (await state(page)).bodyOverflow !== 'hidden', 'Luk: viseren lukker, siden kan scrolle igen');

    // Fejlede uploads: billede fundet via driver + tidspunkt
    const kort = await page.$$eval('#fejlListe > div', ds => ds.map(d => ({ tekst: d.textContent, a: d.querySelector('a[data-lightbox]')?.getAttribute('href') || null })));
    check(kort.length === 2, 'Fejlede uploads: kun rækker med status "ny" vises (2)');
    check(kort[0].a === FEJL, 'Fejl-række uden billede_url får billedet fra hent_fejl_billeder (📷 Se)');
    check(kort[1].a === null, 'Fejl-række uden fundet billede: intet 📷 Se');
    await page.tap('#fejlListe > div:first-child a[data-lightbox]');
    await waitImg(page);
    check((await page.getAttribute('#lightboxImg', 'src')) === FEJL && (await state(page)).zoom === '100%', '📷 Se i Fejlede uploads åbner samme zoom-viser, nulstillet');
    await page.touchscreen.tap(cx, cy); await page.waitForTimeout(60); await page.touchscreen.tap(cx, cy);
    check((await state(page)).zoom === '250%', 'Zoom virker også for fejl-billeder');
    check(kald.includes('hent_fejl_billeder'), 'Dashboardet kalder hent_fejl_billeder');
    check(errs.length === 0, 'Mobil: ingen JS-fejl' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  }

  // ================= DESKTOP (mus) =================
  {
    const { ctx, page, errs } = await setup(browser, { viewport: { width: 1440, height: 900 } }, BILLEDE);
    await page.click('#row-q2 a[data-lightbox]');
    await waitImg(page);
    let s = await state(page);
    check(near(s.st.w, 640, 1) && near(s.st.x, 800, 1), 'Desktop: sidepanel til højre (640 px), ikke fuld skærm');
    // Hjul-zoom om musen: punktet under musen bliver stående
    await page.evaluate(() => lbZoomKnap(2));   // billedet er nu bredere og højere end panelet
    s = await state(page);
    const mx = s.st.x + s.st.w * 0.3, my = s.st.y + s.st.h * 0.3;
    const relFoer = { x: (mx - s.im.x) / s.im.w, y: (my - s.im.y) / s.im.h };
    await page.mouse.move(mx, my);
    for (let i = 0; i < 3; i++) await page.mouse.wheel(0, -150);
    await page.waitForTimeout(100);
    s = await state(page);
    const relEfter = { x: (mx - s.im.x) / s.im.w, y: (my - s.im.y) / s.im.h };
    check(s.s > 3, `Musehjul zoomer ind (${s.zoom})`);
    check(near(relFoer.x, relEfter.x, 0.01) && near(relFoer.y, relEfter.y, 0.01), 'Hjul-zoom holder punktet under musen fast');
    for (let i = 0; i < 40; i++) await page.mouse.wheel(0, -400);
    check((await state(page)).zoom === '800%', 'Maks. zoom 800 %');
    for (let i = 0; i < 40; i++) await page.mouse.wheel(0, 400);
    check((await state(page)).zoom === '100%', 'Hjul ud stopper ved 100 %');
    // Træk med mus
    await page.evaluate(() => lbZoomKnap(3));
    const f = await state(page);
    await page.mouse.move(mx, my); await page.mouse.down(); await page.mouse.move(mx - 60, my - 40, { steps: 6 }); await page.mouse.up();
    s = await state(page);
    check(near(s.tx - f.tx, -60, 2) && near(s.ty - f.ty, -40, 2), 'Træk med musen flytter billedet');
    // Dobbeltklik ud/ind
    await page.dblclick('#lbStage');
    check((await state(page)).zoom === '100%', 'Dobbeltklik når zoomet: tilbage til 100 %');
    await page.dblclick('#lbStage');
    check((await state(page)).zoom === '250%', 'Dobbeltklik: zoom ind');
    // Taster
    await page.keyboard.press('0'); check((await state(page)).zoom === '100%', 'Tast 0 = Nulstil');
    await page.keyboard.press('r'); check((await state(page)).rot === 90, 'Tast r = Rotér');
    // Ret virker stadig med viseren åben (og taster zoomer ikke mens man skriver)
    await page.click('#row-q2 button:has-text("Ret")');
    await page.fill('#ret-ind-q2', '3710.50');
    await page.click('#ret-ind-q2'); await page.keyboard.press('End'); await page.keyboard.type('0');
    check((await state(page)).rot === 90 && (await page.inputValue('#ret-ind-q2')) === '3710.500', 'Ret-felt kan bruges med viseren åben; "0" i feltet nulstiller ikke viseren');
    check((await page.textContent('#lonBody')).includes('3.165,75'), 'Lønseddel uændret');
    await page.keyboard.press('Escape');
    check(!(await page.isVisible('#lightbox')), 'Escape lukker');
    check(errs.length === 0, 'Desktop: ingen JS-fejl' + (errs.length ? ': ' + errs.join(' | ') : ''));
    await ctx.close();
  }

  // Ældre database uden hent_fejl_billeder / uden bucket-kolonne: dashboardet virker stadig
  {
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 800 } });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.route('**/*', route => {
      const u = route.request().url();
      if (u.startsWith(`${BASE}/rest/v1/rpc/`)) {
        const fn = u.split('/rpc/')[1];
        if (fn === 'hent_alle') return route.fulfill({ json: ALLE });
        if (fn === 'hent_ture') return route.fulfill({ json: TURE });
        if (fn === 'hent_fejlede') return route.fulfill({ json: FEJLEDE.slice(0, 1) });
        if (fn === 'hent_billeder') return route.fulfill({ json: [{ navn: '1863__1790439824.jpg', slutrapport_nr: '1863' }] });
        return route.fulfill({ status: 404, body: '{"message":"not found"}' });
      }
      if (u.startsWith('file://')) return route.continue();
      return route.fulfill({ status: 404, body: '' });
    });
    await page.goto('file://' + path.join(__dirname, '..', '..', 'site', 'dashboard.html'));
    await page.selectOption('#driver', 'Qaalid');
    await page.waitForSelector('#row-q2');
    await page.waitForTimeout(300);
    check(await page.isVisible('#fejlCard') && (await page.$$('#fejlListe > div')).length === 1, 'Uden hent_fejl_billeder (404): Fejlede uploads vises stadig, bare uden billede');
    check(errs.length === 0, 'Ældre database: ingen JS-fejl');
    await ctx.close();
  }

  await browser.close();
  console.log(fails ? `\n${fails} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(fails ? 1 : 0);
})();
