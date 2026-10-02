// "Scan før send", lag 1, i rigtig browser (Chromium med iPhone 13- og Pixel 7-emulering): syntetiske bon-billeder tegnes i en canvas og forringes kontrolleret.
// Bevis: godkendt billede -> Send aktiv og først ved klik ét kald til Make; afvist billede -> den aftalte tekst, Send låst, nul kald; værn i send(); flugtvej efter 2 afvisninger;
// fejl i analysen godkender; EXIF-rotation; debug-visning; ydelse med 4× langsommere CPU; ingen sidelæns rulning på 360 px; ingen JS-fejl; uden ?scan=1 er siden uændret.
// Beviser IKKE, at tærsklerne passer til rigtige bons (målefasen) eller opførslen i iOS-Safari (kun Chromium er installeret her).
const { chromium, devices } = require('playwright'); const path = require('path');
const { lav, medExif } = require('../hjaelpere/scan_billeder.cjs');
const SIDE = 'file://' + path.join(__dirname, '..', '..', 'site', 'index.html');
let fails = 0; const check = (c, m) => { console.log(`${c ? 'PASS' : 'FAIL'}  ${m}`); if (!c) fails++; };
const AFVIST_TEKST = 'Billedet kunne ikke læses. Tag et nyt og mere tydeligt billede';

(async () => {
  const b = await chromium.launch();
  const tegneside = await b.newPage(); await tegneside.goto('file://' + path.join(__dirname, '..', '..', 'site', 'index.html'));
  const B = {                                         // billederne laves én gang og bruges af begge enheder
    god:      await lav(tegneside, { w: 1500, h: 2000 }),
    god2:     await lav(tegneside, { w: 1500, h: 2000, seed: 99 }),
    slor:     await lav(tegneside, { w: 1500, h: 2000, blur: 6 }),
    moerk:    await lav(tegneside, { w: 1500, h: 2000, moerk: 0.7 }),
    genskin:  await lav(tegneside, { w: 1500, h: 2000, genskin: 0.3 }),
    lille:    await lav(tegneside, { w: 600, h: 800 }),
    afskaaret:await lav(tegneside, { w: 1500, h: 2000, bonH: 1.15 }),
    smaa:     await lav(tegneside, { w: 1500, h: 2000, bonB: 0.3, bonH: 0.4 }),
    skaev:    await lav(tegneside, { w: 1500, h: 2000, rot: 20, bonB: 0.45, bonH: 0.6 }),
    lysPapir: await lav(tegneside, { w: 1500, h: 2000, papir: '#f6f6f6' }),
    letSlor:  await lav(tegneside, { w: 1500, h: 2000, blur: 1 }),
    hvidtBord:await lav(tegneside, { w: 1500, h: 2000, bord: '#e8e5de' }),
    // ligger ned (2000×1500) med bonen drejet 90°, og EXIF-orientering 6 (skal drejes 90° med uret): vises som en opretstående bon
    ligger:   medExif(await lav(tegneside, { w: 2000, h: 1500, rot: 90, bonB: 0.9, bonH: 0.6 }), 6),
    stor:     await lav(tegneside, { w: 3000, h: 4000 }),
  };
  await tegneside.close();

  async function ny(navn, parametre, opts = {}) {
    const ctx = await b.newContext(opts.viewport ? { viewport: opts.viewport, hasTouch: true, isMobile: true } : devices[navn]);
    const page = await ctx.newPage(), fejl = [], poster = [];
    page.on('pageerror', e => fejl.push(e.message)); page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text())) fejl.push(m.text()); });
    await page.route('**/*', r => {
      const req = r.request(), u = req.url();
      if (u.startsWith('file://')) return r.continue();
      if (req.method() === 'POST') { const d = req.postDataBuffer() || Buffer.alloc(0); poster.push({ url: u, felter: [...new Set([...d.toString('latin1').matchAll(/name="([a-z_]+)"/g)].map(x => x[1]))] }); return r.fulfill({ status: 200, body: '1683' }); }
      poster.push({ url: u, metode: req.method() }); return r.fulfill({ status: 404, body: '' });
    });
    await page.goto(SIDE + parametre);
    return { page, ctx, fejl, poster, parametre };
  }
  const vaelg = async (t, buf, navn = 'bon.jpg') => {
    const scanTil = /scan=(1|debug)/.test(t.parametre), foer = scanTil ? await t.page.evaluate(() => scanLob) : 0;
    await t.page.setInputFiles('#galleryInput', { name: navn, mimeType: 'image/jpeg', buffer: buf });
    await t.page.waitForSelector('#previewArea:not(.hidden)');
    if (scanTil) await t.page.waitForFunction(f => scanLob > f && scanTilstand !== 'tjekker', foer, { timeout: 15000 });   // et NYT billede er analyseret (ikke det forrige)
  };
  const vis = (t, sel) => t.page.$eval(sel, e => !e.classList.contains('hidden') && getComputedStyle(e).display !== 'none');
  const sendLaast = t => t.page.$eval('#sendBtn', e => e.disabled);
  const tekst = (t, sel) => t.page.$eval(sel, e => e.textContent.trim());
  const nulstil = async t => { await t.page.reload(); };
  const makePoster = t => t.poster.filter(p => /make\.com/.test(p.url));

  for (const navn of ['iPhone 13', 'Pixel 7']) {
    console.log('\n— ' + navn);
    // --- 1) Uden ?scan: siden er uændret
    for (const par of ['?driver=fuad', '?driver=fuad&scan=0', '?driver=fuad&scan=2']) {
      const t = await ny(navn, par); await vaelg(t, B.slor);
      check(!(await sendLaast(t)) && !(await vis(t, '#scanAfvist')) && !(await vis(t, '#scanTjekker')) && !(await vis(t, '#scanDebug')), `${navn}: uden ?scan=1 ("${par}") er et sløret billede bare "klar til afsendelse", Send aktiv, intet scan-element synligt`);
      await t.ctx.close();
    }
    {
      const t = await ny(navn, '?driver=fuad'); await vaelg(t, B.slor);
      check(makePoster(t).length === 0, `${navn}: uden ?scan=1 sendes intet, før der klikkes`);
      await t.page.click('#sendBtn'); await t.page.waitForSelector('#okBlock:not(.hidden)');
      check(makePoster(t).length === 1 && t.poster.length === 1, `${navn}: uden ?scan=1 sendes som i dag: præcis ét kald, til Make (${t.poster.length} kald)`);
      const felter0 = makePoster(t)[0].felter.slice().sort().join();
      check(felter0 === 'driver,driver_id,driver_nr,file,filename,timestamp'.split(',').sort().join(), `${navn}: formularfelterne til Make er uændrede (${felter0})`);
      check(t.fejl.length === 0, `${navn}: ingen JS-fejl` + (t.fejl.length ? ': ' + t.fejl.join(' | ') : '')); await t.ctx.close();
    }

    // --- 2) Godkendt billede
    {
      const t = await ny(navn, '?driver=fuad&scan=1'); await vaelg(t, B.god);
      check(await tekst(t, '#whoName') === 'Fuad', `${navn}: ?scan=1 ændrer ikke chauffør-opsætningen`);
      check(!(await sendLaast(t)) && !(await vis(t, '#scanAfvist')) && !(await vis(t, '#scanTjekker')) && !(await vis(t, '#scanDebug')), `${navn}: godt billede: Send aktiv, ingen afvisning, ingen debug-visning`);
      check(t.poster.length === 0, `${navn}: godt billede: intet sendes, før der klikkes (${t.poster.length} kald)`);
      await t.page.click('#sendBtn'); await t.page.waitForSelector('#okBlock:not(.hidden)');
      check(makePoster(t).length === 1 && t.poster.length === 1, `${navn}: godt billede: ved klik præcis ét kald, til Make`);
      check(makePoster(t)[0].felter.slice().sort().join() === 'driver,driver_id,driver_nr,file,filename,timestamp'.split(',').sort().join(), `${navn}: samme formularfelter som i dag`);
      check(t.fejl.length === 0, `${navn}: ingen JS-fejl` + (t.fejl.length ? ': ' + t.fejl.join(' | ') : '')); await t.ctx.close();
    }

    // --- 3) Afviste billeder: hver årsag, præcis tekst, Send låst, nul netværkskald
    const afvist = [['slor', 'for sløret'], ['moerk', 'for mørkt'], ['genskin', 'genskin'], ['lille', 'for lille'], ['afskaaret', 'hele bonen skal med'], ['smaa', 'hele bonen skal med']];
    for (const [nøgle, aarsag] of afvist) {
      const t = await ny(navn, '?driver=fuad&scan=1'); await vaelg(t, B[nøgle]);
      const txt = await tekst(t, '#scanAfvist');
      check(txt.startsWith(AFVIST_TEKST) && txt.includes(aarsag), `${navn}: ${nøgle}: teksten er "${AFVIST_TEKST}" + "${aarsag}" (fik: ${txt.replace(/\s+/g, ' ')})`);
      check(await sendLaast(t) && await tekst(t, '#retakeBtn') === '📷 Tag nyt billede' && (await t.page.$eval('#retakeBtn', e => e.classList.contains('btn-primary'))), `${navn}: ${nøgle}: Send er låst, og "Tag nyt billede" er den store knap`);
      await t.page.click('#sendBtn', { force: true, timeout: 2000 }).catch(() => {});
      await t.page.evaluate(() => send());
      await t.page.waitForTimeout(300);
      check(t.poster.length === 0 && !(await vis(t, '#sendingBlock')) && !(await vis(t, '#okBlock')), `${navn}: ${nøgle}: hverken klik på den låste knap eller et direkte kald af send() sender noget (nul netværkskald)`);
      await t.ctx.close();
    }

    // --- 4) Billeder der ikke må afvises
    for (const [nøgle, hvad] of [['lysPapir', 'meget lyst papir'], ['letSlor', 'let uskarpt (1 px)'], ['skaev', 'bon drejet 20°'], ['ligger', 'billede taget liggende med EXIF-rotation']]) {
      const t = await ny(navn, '?driver=fuad&scan=1'); await vaelg(t, B[nøgle]);
      check(!(await sendLaast(t)) && !(await vis(t, '#scanAfvist')), `${navn}: ${hvad} godkendes (ingen falsk afvisning)`);
      if (nøgle === 'skaev') check((await tekst(t, '#scanHint')).includes('lige') && !(await sendLaast(t)), `${navn}: skæv bon giver kun hintet "Hold telefonen lige", ikke en afvisning`);
      await t.ctx.close();
    }
    {
      const t = await ny(navn, '?driver=fuad&scan=1'); await vaelg(t, B.hvidtBord);
      check(await vis(t, '#scanAfvist') && await sendLaast(t), `${navn}: KENDT SVAGHED: hvid bon på hvidt bord afvises (bonen kan ikke skilles fra bordet). Flugtvejen og målefasen skal håndtere det`);
      await t.ctx.close();
    }

    // --- 5) Flugtvej: først efter 2 afviste billeder i træk
    {
      const t = await ny(navn, '?driver=fuad&scan=1'); await vaelg(t, B.slor);
      check(!(await vis(t, '#sendAlligevelBtn')), `${navn}: efter ét afvist billede er der ingen "Send alligevel"`);
      await vaelg(t, B.moerk);
      check(await vis(t, '#sendAlligevelBtn') && (await tekst(t, '#sendAlligevelBtn')) === 'Send alligevel (bonen kontrolleres manuelt)' && await sendLaast(t), `${navn}: efter to afviste billeder i træk vises "Send alligevel (bonen kontrolleres manuelt)", mens Send stadig er låst`);
      check(t.poster.length === 0, `${navn}: flugtvejen sender ikke af sig selv`);
      await t.page.click('#sendAlligevelBtn'); await t.page.waitForSelector('#okBlock:not(.hidden)');
      check(makePoster(t).length === 1 && t.poster.length === 1 && makePoster(t)[0].felter.slice().sort().join() === 'driver,driver_id,driver_nr,file,filename,timestamp'.split(',').sort().join(), `${navn}: "Send alligevel" sender som i dag: ét kald til Make, samme formularfelter`);
      // tælleren er nulstillet efter afsendelsen
      await t.page.click('#nextBtn'); await vaelg(t, B.slor);
      check(!(await vis(t, '#sendAlligevelBtn')), `${navn}: efter afsendelsen starter tællingen forfra (ét afvist billede: ingen flugtvej)`);
      await t.ctx.close();
    }
    {
      const t = await ny(navn, '?driver=fuad&scan=1'); await vaelg(t, B.slor); await vaelg(t, B.god);
      check(!(await sendLaast(t)) && !(await vis(t, '#sendAlligevelBtn')) && !(await vis(t, '#scanAfvist')), `${navn}: et godt billede efter et afvist fjerner afvisningen og låsen`);
      await vaelg(t, B.slor); await vaelg(t, B.moerk);
      check(await vis(t, '#sendAlligevelBtn'), `${navn}: godt billede nulstiller tælleren: to nye afvisninger i træk giver flugtvejen igen`);
      await t.ctx.close();
    }
    {
      const t = await ny(navn, '?driver=fuad&scan=1'); await vaelg(t, B.slor); await vaelg(t, B.god); await vaelg(t, B.slor);
      check(!(await vis(t, '#sendAlligevelBtn')), `${navn}: afvist, godt, afvist er ikke "to i træk": ingen flugtvej`);
      await t.ctx.close();
    }

    // --- 6) "Tag nyt billede" åbner kameraet; et nyere valg gør en gammel analyse ugyldig
    {
      const t = await ny(navn, '?driver=fuad&scan=1'); await vaelg(t, B.slor);
      const [fc] = await Promise.all([t.page.waitForEvent('filechooser', { timeout: 5000 }).catch(() => null), t.page.click('#retakeBtn')]);
      check(!!fc && await vis(t, '#captureArea') && !(await vis(t, '#previewArea')), `${navn}: "Tag nyt billede" åbner kameraets filvælger og nulstiller visningen`);
      await t.ctx.close();
    }
    {
      const t = await ny(navn, '?driver=fuad&scan=1');
      await t.page.setInputFiles('#galleryInput', { name: 'a.jpg', mimeType: 'image/jpeg', buffer: B.slor });
      await t.page.setInputFiles('#galleryInput', { name: 'b.jpg', mimeType: 'image/jpeg', buffer: B.god2 });
      await t.page.waitForFunction(() => scanTilstand === 'godkendt' || scanTilstand === 'afvist'); await t.page.waitForTimeout(800);
      check(await t.page.evaluate(() => scanTilstand) === 'godkendt' && !(await sendLaast(t)) && !(await vis(t, '#scanAfvist')), `${navn}: vælges et nyt billede under analysen, gælder kun det nyeste (ingen gammel afvisning på et nyt billede)`);
      await t.ctx.close();
    }

    // --- 7) Fejlsikkert: kan analysen ikke køre, godkendes billedet, og chaufføren ser intet
    {
      const t = await ny(navn, '?driver=fuad&scan=1');
      await t.page.evaluate(() => { window.vurderBillede = async () => { throw new Error('canvas fejlede'); }; });
      await vaelg(t, B.slor);
      check(!(await sendLaast(t)) && !(await vis(t, '#scanAfvist')) && !(await vis(t, '#scanDebug')) && await t.page.evaluate(() => scanTilstand) === 'fejlsikker', `${navn}: fejl i analysen: billedet godkendes, Send er aktiv, intet vises for chaufføren`);
      await t.page.click('#sendBtn'); await t.page.waitForSelector('#okBlock:not(.hidden)');
      check(makePoster(t).length === 1, `${navn}: fejlsikkert billede kan sendes (ét kald)`);
      await t.ctx.close();
    }
    {
      const t = await ny(navn, '?driver=fuad&scan=debug');
      await t.page.evaluate(() => { window.vurderBillede = async () => { throw new Error('canvas fejlede'); }; });
      await vaelg(t, B.god);
      check((await tekst(t, '#scanDebugTxt')).includes('canvas fejlede') && !(await sendLaast(t)), `${navn}: i debug-tilstand vises fejlen, men billedet godkendes stadig`);
      await t.ctx.close();
    }

    // --- 8) Debug-tilstand
    {
      const t = await ny(navn, '?driver=fuad&scan=debug'); await vaelg(t, B.slor, 'bon 7.jpg');
      const dbg = await tekst(t, '#scanDebugTxt');
      check(await vis(t, '#scanDebug') && /AFVIST: for sløret/.test(dbg) && /laplace \d+ \(min 100\)/.test(dbg) && /genskin: blok/.test(dbg) && /bon: fundet true/.test(dbg), `${navn}: ?scan=debug viser afgørelse og målinger med grænserne`);
      const raekke = await t.page.$eval('#scanDebug', e => e.dataset.raekke), antal = await t.page.evaluate(() => SCAN_KOLONNER.length);
      check(raekke.split('\t').length === antal && raekke.startsWith('bon 7.jpg\t'), `${navn}: målelinjen har ${antal} tabulator-adskilte kolonner og filnavnet først`);
      await t.page.click('#scanKopi'); await t.page.waitForFunction(() => /Kopieret|Kunne ikke/.test(document.getElementById('scanKopiSvar').textContent));
      check(await tekst(t, '#scanKopiSvar') === 'Kopieret', `${navn}: "Kopiér målinger" virker`);
      check(await sendLaast(t) && await vis(t, '#scanAfvist'), `${navn}: debug ændrer ikke afgørelsen (afvist billede: stadig låst)`);
      await t.ctx.close();
    }
    {
      const t = await ny(navn, '?driver=fuad&scan=debug'); await vaelg(t, B.god);
      check((await tekst(t, '#scanDebugTxt')).startsWith('GODKENDT') && !(await sendLaast(t)), `${navn}: debug viser også godkendte billeder`);
      await t.ctx.close();
    }

    // --- 9) Ydelse med 4× langsommere CPU (stort 12-megapixel-billede)
    {
      const t = await ny(navn, '?driver=fuad&scan=debug'); const cdp = await t.ctx.newCDPSession(t.page); await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
      const t0 = Date.now(); await vaelg(t, B.stor); const samlet = Date.now() - t0;
      const ms = Number((await tekst(t, '#scanDebugTxt')).match(/\((\d+) ms\)/)[1]);
      check(ms < 1500, `${navn}: analysen af et 12 MP-billede tager ${ms} ms med 4× langsommere CPU (grænse 1500 ms; hele valget inkl. indlæsning ${samlet} ms)`);
      check(!(await sendLaast(t)), `${navn}: det store, gode billede godkendes`);
      await t.ctx.close();
    }
  }

  // --- 10) Smal skærm (360 px): ingen sidelæns rulning, heller ikke med afvisning og debug
  {
    const t = await ny(null, '?driver=fuad&scan=debug', { viewport: { width: 360, height: 740 } });
    await vaelg(t, B.slor); await vaelg(t, B.moerk);
    const m = await t.page.evaluate(() => ({ sw: document.documentElement.scrollWidth, iw: window.innerWidth }));
    check(m.sw <= m.iw && await vis(t, '#sendAlligevelBtn'), `360 px: afvist + flugtvej + debug uden sidelæns rulning (scrollWidth ${m.sw} ≤ ${m.iw})`);
    check(t.fejl.length === 0, `360 px: ingen JS-fejl` + (t.fejl.length ? ': ' + t.fejl.join(' | ') : '')); await t.ctx.close();
  }

  await b.close(); console.log(fails ? `\n${fails} FEJL` : '\nALLE TESTS BESTÅET'); process.exit(fails ? 1 : 0);
})();
