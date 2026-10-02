/* Kontroller af slutrapporter — ren kode uden adgang til database eller side.
 *
 * Bruges af dashboardets "Kontrol af måneden" (en <script>-tag) og af enhedstests (require).
 * Er også første udgave af kontrollerne i den nye indlæsning: den samme logik køres på en NY vagt med
 * Kontroller.tjekNy(ny, eksisterende). Intet her ændrer data; funktionerne returnerer kun fund og forslag.
 *
 * Samme kontroller findes som SQL i supabase/forespoergsler/kontrol_maaned.sql. En test kører begge på de samme data
 * og kræver ens fund, og at parametrene i SQL'en er de samme som STANDARD nedenfor.
 *
 * En række ("vagt") ser ud som hent_ture leverer den:
 *   { id, dato: "2026-09-11", slutrapport_nr, chauffor, indkort, overfort, vagt_start: "02:13", vagt_slut: "13:31", maaned: "2026-09" }
 * `maaned` er regnskabsmåneden (28.–27.) og bruges til at afgøre, hvilke fund der hører til den valgte måned.
 * Valgfrit (den nye indlæsning): `taxi_nr` (bilen fra bonen; så sammenlignes kun inden for samme bil) og `vdt_tk` (VDT(Tk)-tallet fra bonen).
 *
 * Bilen/rækken findes ud fra NABOER: to numre er i samme række, når de højst er NR_AFSTAND (50) fra hinanden. Der bruges ingen faste 100-blokke.
 */
(function (root, factory) {
  const k = factory();
  if (typeof module === "object" && module.exports) module.exports = k;
  else root.Kontroller = k;
})(typeof self !== "undefined" ? self : this, function () {

  // Parametre. Samme tal står i kontrol_maaned.sql (testen sammenligner).
  const STANDARD = {
    // Nummer-rækkerne findes ud fra NABOER, ikke ud fra faste 100-blokke: to numre hører til samme række (samme bil), når de er højst
    // NR_AFSTAND fra hinanden (kæde af naboer). Et nummer uden nogen anden vagt inden for NR_AFSTAND er "uden for bilernes rækker".
    NR_AFSTAND: 50,
    // Slutrapport-nummeret forveksles med VDT(Tk)-tallet på bonen (kendte eksempler: 2285 og 2303). Et ensomt nummer i dette interval
    // markeres som den kendte OCR-fejl. Intervallet er et skøn ud fra de to eksempler og rettes her, når det rigtige kendes.
    VDT_FRA: 2200,
    VDT_TIL: 2399,
    // KUN til at udfylde taxi_nr på gamle rækker og til kontrollen mod taxi_nr fra bonen (bilFraNr). Bruges IKKE af områdetjekket.
    OMRAADER: [
      { taxi_nr: "001-7144", fra: 1100, til: 1199 },
      { taxi_nr: "001-8646", fra: 1600, til: 1699 },
      { taxi_nr: "001-8208", fra: 1800, til: 1899 },
    ],
    STOR_DIFF_KR: 500,        // difference (indkørt − overført) på mindst så mange kr er stor …
    STOR_DIFF_PCT: 0.2,       // … eller mindst 20 % af indkørt, når den samtidig er mindst STOR_DIFF_MIN_KR
    STOR_DIFF_MIN_KR: 100,
    VAGT_MIN_MIN: 180,        // vagt kortere end 3 t er mistænkelig
    VAGT_MAX_MIN: 960,        // vagt længere end 16 t er mistænkelig
    OVERLAP_TOLERANCE_MIN: 5, // overlap på op til 5 min ignoreres (vagtskifte, afrundede tider)
  };

  const TYPER = {
    nr_flere_chauffoerer: { rang: 1, titel: "Samme nr hos flere chauffører" },
    nr_er_vdt:            { rang: 2, titel: "Nummer er VDT(Tk)-tallet" },
    nr_uden_for_omraade:  { rang: 3, titel: "Nummer uden for bilernes områder" },
    overlap:              { rang: 4, titel: "Overlappende vagter" },
    samme_dato_beloeb:    { rang: 5, titel: "Samme dato og beløb" },
    stor_difference:      { rang: 6, titel: "Stor difference" },
    vagtlaengde:          { rang: 7, titel: "Mistænkelig vagtlængde" },
    hul_i_raekken:        { rang: 8, titel: "Hul i nummerrækken" },
  };

  const FORSLAG = {
    nr_flere_chauffoerer: "Tjek billederne. Er den ene en dublet, skal den fjernes i Supabase (der slettes ikke her). Er nummeret forlæst, rettes det med Ret.",
    nr_er_vdt:            "Nummeret ligner VDT(Tk)-tallet på bonen, ikke slutrapport-nummeret (en kendt OCR-fejl). Find det rigtige slutrapport-nummer på billedet, og ret det med Ret.",
    nr_uden_for_omraade:  "Tjek nummeret på billedet (fx 18/19-forveksling), og ret det med Ret. Er det et rigtigt nummer, fx til en ny bil uden andre vagter, så markér OK.",
    overlap:              "To vagter kan ikke køre samtidigt. Tjek tider og nummer på begge billeder, og ret med Ret.",
    samme_dato_beloeb:    "Samme dato og samme indkørte beløb ligner den samme bon indlæst to gange. Tjek billederne.",
    stor_difference:      "Tjek indkørt og overført på billedet (OCR-fejl er almindelige), og ret med Ret.",
    vagtlaengde:          "Tjek start- og sluttid på billedet, og ret med Ret.",
    hul_i_raekken:        "Mangler der en bon, tilføjes den (Udfyld og godkend, eller chaufføren uploader den). Er hullet rigtigt, fx en vagt uden for systemet, så markér OK.",
  };

  // ---------- Hjælpere ----------
  const norm = s => String(s == null ? "" : s).trim();
  const nrTekst = r => norm(r.slutrapport_nr);
  const tal = v => (v === null || v === undefined || v === "" || !isFinite(Number(v))) ? null : Number(v);
  const heleKr = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const kortDato = d => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(norm(d)); return m ? `${Number(m[3])}/${Number(m[2])}` : norm(d); };
  const TID = /^([01]?[0-9]|2[0-3]):([0-5][0-9])$/;
  const minutterDoegn = t => { const m = TID.exec(norm(t)); return m ? Number(m[1]) * 60 + Number(m[2]) : null; };
  const dagNr = d => { const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(norm(d)); return m ? Math.floor(Date.UTC(+m[1], +m[2] - 1, +m[3]) / 864e5) : null; };
  const kortNavn = r => `${norm(r.chauffor)} nr ${nrTekst(r)} (${kortDato(r.dato)})`;
  const sorterId = ids => [...ids].sort();   // strengsammenligning, som SQL'ens collate "C"

  /**
   * Nummer-rækker ud fra naboer: sorterede, forskellige firecifrede numre, hvor to numre hører til samme række, når de højst er
   * `afstand` fra hinanden. Returnerer Map nr -> { id, fra, til, antal } (række-id, laveste og højeste nummer, antal forskellige numre).
   */
  function nummerSerier(numre, afstand) {
    const s = [...new Set(numre)].sort((a, b) => a - b), ud = new Map(), serier = [];
    s.forEach((n, i) => {
      if (i === 0 || n - s[i - 1] > afstand) serier.push({ id: serier.length + 1, fra: n, til: n, antal: 0 });
      const x = serier[serier.length - 1]; x.til = n; x.antal++; ud.set(n, x);
    });
    return ud;
  }

  /** Bilen ud fra nummeret i et fast 100-område. Bruges kun til at udfylde taxi_nr og til kontrol mod taxi_nr, ikke af områdetjekket. */
  function bilFraNr(nr, omraader) {
    const t = norm(nr);
    if (!/^[0-9]{4}$/.test(t)) return null;
    const n = Number(t);
    const o = (omraader || STANDARD.OMRAADER).find(x => n >= x.fra && n <= x.til);
    return o ? o.taxi_nr : null;
  }

  /** Vagtens tidsrum i minutter siden 1970 (start, slut). Slut før start = næste døgn. Mangler/ugyldige tider -> null. */
  function vagtInterval(r) {
    const d = dagNr(r.dato), a = minutterDoegn(r.vagt_start), b = minutterDoegn(r.vagt_slut);
    if (d === null || a === null || b === null) return null;
    const s = d * 1440 + a;
    return { s, e: d * 1440 + b + (b < a ? 1440 : 0) };
  }

  /** Antal minutter to vagter overlapper (0 eller negativt = intet overlap). null, hvis en af dem mangler tider. */
  function overlapMinutter(x, y) {
    const a = vagtInterval(x), b = vagtInterval(y);
    if (!a || !b) return null;
    return Math.min(a.e, b.e) - Math.max(a.s, b.s);
  }

  /** Er forskellen mellem indkørt og overført stor? Returnerer { diff, pct } eller null. */
  function storDifference(r, cfg) {
    cfg = cfg || STANDARD;
    const ind = tal(r.indkort), ovf = tal(r.overfort);
    if (ind === null || ovf === null) return null;
    const d = ind - ovf, a = Math.abs(d);
    const stor = a >= cfg.STOR_DIFF_KR || (a >= cfg.STOR_DIFF_MIN_KR && ind > 0 && a / ind >= cfg.STOR_DIFF_PCT);
    return stor ? { diff: d, pct: ind > 0 ? a / ind : null } : null;
  }

  /** Vagtlængde i minutter (brutto), eller null uden tider. */
  function vagtLaengdeMin(r) { const i = vagtInterval(r); return i ? i.e - i.s : null; }

  // Kort, stabil fingeraftryk af de værdier, et fund bygger på. Ændres en række (fx med Ret), får fundet ny nøgle,
  // så et gammelt "kontrolleret – OK" ikke dækker over en ny situation.
  function fingeraftryk(raekker) {
    const s = raekker.map(r => [r.id, r.dato, nrTekst(r), norm(r.chauffor), tal(r.indkort), tal(r.overfort), norm(r.vagt_start), norm(r.vagt_slut)].join("~")).join("|");
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return h.toString(36);
  }

  function lavFund(type, identitet, raekker, tekst, extra) {
    const dato = raekker.map(r => norm(r.dato)).filter(Boolean).sort()[0] || "";
    const ids = sorterId(raekker.map(r => r.id));
    const noegle = type === "hul_i_raekken" ? identitet : identitet + "|" + fingeraftryk(raekker.slice().sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)));
    return Object.assign({ type, titel: TYPER[type].titel, identitet, noegle, raekker: ids, dato, tekst, forslag: FORSLAG[type] }, extra || {});
  }

  // ---------- Hovedfunktion ----------
  /**
   * Alle kontroller for én regnskabsmåned.
   * @param raekker  vagter fra den valgte måned OG nabomånederne (så vagter og numre ved månedsskiftet kan sammenlignes)
   * @param valgt    den valgte regnskabsmåned, "2026-09". Kun fund, hvor en vagt i denne måned indgår, returneres.
   * @returns        { fund: [...], uden_tider: antal vagter i den valgte måned uden tider (kunne ikke tjekkes for overlap/længde) }
   */
  function kontrolMaaned(raekker, valgt, cfg) {
    cfg = Object.assign({}, STANDARD, cfg || {});
    const alle = (raekker || []).filter(r => r && r.id != null);
    const nrTalAf = r => /^[0-9]{4}$/.test(nrTekst(r)) ? Number(nrTekst(r)) : null;
    const serie = nummerSerier(alle.map(nrTalAf).filter(n => n !== null), cfg.NR_AFSTAND);
    const t = alle.map(r => {
      const nrTal = nrTalAf(r), s = nrTal !== null ? serie.get(nrTal) : null;
      // Bilen: taxi_nr fra bonen, når den findes; ellers rækken, som nummeret hører til (naboer ±NR_AFSTAND)
      const bil = r.taxi_nr ? norm(r.taxi_nr) : s ? "række " + s.id : null;
      return { r, bil, serie: s, gruppe: (bil || "ukendt") + "|" + nrTekst(r), ch: norm(r.chauffor).toLowerCase(), valgt: r.maaned === valgt,
               iv: vagtInterval(r), nrTal };
    });
    // Har nummeret en anden vagt (andet nummer) højst NR_AFSTAND væk? Med taxi_nr på begge sammenlignes kun inden for samme bil.
    const harNabo = x => x.nrTal !== null && t.some(u => u.nrTal !== null && u.nrTal !== x.nrTal && Math.abs(u.nrTal - x.nrTal) <= cfg.NR_AFSTAND
      && (!(x.r.taxi_nr && u.r.taxi_nr) || norm(x.r.taxi_nr) === norm(u.r.taxi_nr)));
    const raekkeTekst = x => x.serie ? `række ${x.serie.fra}–${x.serie.til}` : "ukendt række";
    const fund = [];

    // 1) Samme nr hos flere chauffører (samme bil; uden for områderne tæller bilen som "ukendt")
    const grupper = new Map();
    t.forEach(x => { if (!grupper.has(x.gruppe)) grupper.set(x.gruppe, []); grupper.get(x.gruppe).push(x); });
    for (const g of grupper.values()) {
      if (new Set(g.map(x => x.ch)).size > 1 && g.some(x => x.valgt)) {
        const rs = g.map(x => x.r), bil = g[0].r.taxi_nr ? norm(g[0].r.taxi_nr) : raekkeTekst(g[0]);
        const navne = [...new Set(rs.map(r => norm(r.chauffor)))].sort().join(" og ");
        fund.push(lavFund("nr_flere_chauffoerer", "nr_flere_chauffoerer|" + sorterId(rs.map(r => r.id)).join(","), rs,
          `Nr ${nrTekst(rs[0])} (${bil}) står hos ${navne}: ${rs.map(r => `${norm(r.chauffor)} ${kortDato(r.dato)}, indkørt ${heleKr(tal(r.indkort) || 0)}`).join(" / ")}.`));
      }
    }

    // 2) Nummer = VDT(Tk)-tallet (kendt OCR-fejl) og 2b) nummer uden for bilernes rækker. Begge ser på naboer (±NR_AFSTAND), ikke på faste blokke.
    t.filter(x => x.valgt).forEach(x => {
      const nr = nrTekst(x.r), erTal = x.nrTal !== null;
      const vdtOpgivet = x.r.vdt_tk != null && norm(x.r.vdt_tk) !== "" && norm(x.r.vdt_tk) === nr;     // bonens VDT(Tk) er læst og lig nummeret
      const vdtInterval = erTal && x.nrTal >= cfg.VDT_FRA && x.nrTal <= cfg.VDT_TIL && !harNabo(x);       // ellers: ensomt nummer i VDT-intervallet
      if (vdtOpgivet || vdtInterval) {
        fund.push(lavFund("nr_er_vdt", "nr_er_vdt|" + x.r.id, [x.r],
          `Nr ${nr} (${norm(x.r.chauffor)}, ${kortDato(x.r.dato)}) ligner VDT(Tk)-tallet på bonen, ikke slutrapport-nummeret`
          + (vdtOpgivet ? " (VDT(Tk) på bonen er læst som det samme tal)." : `: det ligger i ${cfg.VDT_FRA}–${cfg.VDT_TIL} og har ingen vagt inden for ${cfg.NR_AFSTAND} numre.`)));
      } else if (!erTal) {
        fund.push(lavFund("nr_uden_for_omraade", "nr_uden_for_omraade|" + x.r.id, [x.r],
          `Nr ${nr || "(tomt)"} (${norm(x.r.chauffor)}, ${kortDato(x.r.dato)}) er ikke et firecifret tal.`));
      } else if (!harNabo(x)) {
        fund.push(lavFund("nr_uden_for_omraade", "nr_uden_for_omraade|" + x.r.id, [x.r],
          `Nr ${nr} (${norm(x.r.chauffor)}, ${kortDato(x.r.dato)}) har ingen vagt inden for ${cfg.NR_AFSTAND} numre (hverken hos denne eller andre chauffører).`));
      }
    });

    // 3) Overlappende vagter (samme chauffør, eller samme bil). Samme nr i samme bil er en dublet (punkt 1), ikke et overlap.
    const med = t.filter(x => x.iv);
    for (let i = 0; i < med.length; i++) for (let j = i + 1; j < med.length; j++) {
      let x = med[i], y = med[j];
      if (x.r.id > y.r.id) [x, y] = [y, x];
      if (!(x.valgt || y.valgt) || x.gruppe === y.gruppe) continue;
      const sammeCh = x.ch === y.ch, sammeBil = x.bil !== null && x.bil === y.bil;
      if (!sammeCh && !sammeBil) continue;
      const min = Math.min(x.iv.e, y.iv.e) - Math.max(x.iv.s, y.iv.s);
      if (min > cfg.OVERLAP_TOLERANCE_MIN) {
        const hvorfor = sammeCh && sammeBil ? "samme chauffør og samme bil" : sammeCh ? "samme chauffør" : "samme bil (" + raekkeTekst(x) + ")";
        fund.push(lavFund("overlap", "overlap|" + x.r.id + "," + y.r.id, [x.r, y.r],
          `${kortNavn(x.r)} ${x.r.vagt_start}–${x.r.vagt_slut} og ${kortNavn(y.r)} ${y.r.vagt_start}–${y.r.vagt_slut} overlapper ${min} min (${hvorfor}).`));
      }
    }

    // 4) Samme dato og beløb (indkørt)
    const dg = new Map();
    t.forEach(x => { const ind = tal(x.r.indkort); if (ind !== null && ind > 0) { const k = norm(x.r.dato) + "|" + ind; if (!dg.has(k)) dg.set(k, []); dg.get(k).push(x); } });
    for (const g of dg.values()) {
      if (g.length > 1 && g.some(x => x.valgt)) {
        const rs = g.map(x => x.r);
        fund.push(lavFund("samme_dato_beloeb", "samme_dato_beloeb|" + sorterId(rs.map(r => r.id)).join(","), rs,
          `${rs.length} vagter den ${kortDato(rs[0].dato)} har samme indkørte beløb, ${heleKr(tal(rs[0].indkort))}: ${rs.map(r => `${norm(r.chauffor)} nr ${nrTekst(r)}`).join(" / ")}.`));
      }
    }

    // 5) Stor difference
    t.filter(x => x.valgt).forEach(x => {
      const d = storDifference(x.r, cfg);
      if (d) fund.push(lavFund("stor_difference", "stor_difference|" + x.r.id, [x.r],
        `${kortNavn(x.r)}: indkørt ${heleKr(tal(x.r.indkort))} − overført ${heleKr(tal(x.r.overfort))} = ${d.diff < 0 ? "−" : ""}${heleKr(Math.abs(d.diff))}`
        + (d.pct !== null ? ` (${Math.round(d.pct * 100)} % af indkørt)` : "") + (d.diff < 0 ? ". Overført er større end indkørt." : ".")));
    });

    // 6) Mistænkelig vagtlængde
    t.filter(x => x.valgt && x.iv).forEach(x => {
      const min = x.iv.e - x.iv.s;
      if (min < cfg.VAGT_MIN_MIN || min > cfg.VAGT_MAX_MIN) {
        const h = Math.floor(min / 60), m = min % 60;
        fund.push(lavFund("vagtlaengde", "vagtlaengde|" + x.r.id, [x.r],
          `${kortNavn(x.r)}: ${x.r.vagt_start}–${x.r.vagt_slut} er ${h} t ${m} min (grænser: ${cfg.VAGT_MIN_MIN / 60}–${cfg.VAGT_MAX_MIN / 60} t).`));
      }
    });

    // 7) Huller i nummerrækken, pr. række (naboer ±NR_AFSTAND, eller taxi_nr når den findes). Et hul rapporteres én gang: i måneden efter hullet.
    const pr = new Map();   // række/bil -> (nr -> lavest id)
    t.filter(x => x.bil && x.nrTal !== null).forEach(x => {
      if (!pr.has(x.bil)) pr.set(x.bil, new Map());
      const m = pr.get(x.bil), nu = m.get(x.nrTal);
      if (!nu || x.r.id < nu.r.id) m.set(x.nrTal, x);
    });
    for (const [bil, m] of pr) {
      const nr = [...m.keys()].sort((a, b) => a - b);
      for (let i = 1; i < nr.length; i++) {
        const a = nr[i - 1], b = nr[i];
        if (b - a > 1 && b - a <= cfg.NR_AFSTAND && m.get(b).valgt) {   // større spring er en anden række, ikke et hul
          const ra = m.get(a).r, rb = m.get(b).r, antal = b - a - 1;
          const mangler = antal === 1 ? `nr ${a + 1}` : antal <= 6 ? `nr ${Array.from({ length: antal }, (_, k) => a + 1 + k).join(", ")}` : `nr ${a + 1}–${b - 1} (${antal} numre)`;
          fund.push(lavFund("hul_i_raekken", `hul_i_raekken|${a}|${b}`, [ra, rb],
            `${raekkeTekst(m.get(b))}: ${mangler} mangler mellem nr ${a} (${norm(ra.chauffor)}, ${kortDato(ra.dato)}) og nr ${b} (${norm(rb.chauffor)}, ${kortDato(rb.dato)}).`, { bil, fra: a, til: b }));
        }
      }
    }

    fund.sort((p, q) => TYPER[p.type].rang - TYPER[q.type].rang || (p.dato < q.dato ? -1 : p.dato > q.dato ? 1 : 0) || (p.identitet < q.identitet ? -1 : p.identitet > q.identitet ? 1 : 0));
    return { fund, uden_tider: t.filter(x => x.valgt && !x.iv).length };
  }

  /**
   * Genbrug i den nye indlæsning: kør de samme kontroller på en NY vagt mod de vagter, der allerede findes (alle chauffører).
   * Returnerer kun de fund, hvor den nye vagt indgår. Intet gemmes.
   */
  function tjekNy(ny, eksisterende, cfg) {
    const NY = "__ny__";
    const alle = [Object.assign({}, ny, { id: ny.id != null ? ny.id : NY, maaned: NY })]
      .concat((eksisterende || []).map(r => Object.assign({}, r, { maaned: "__eksisterende__" })));
    return kontrolMaaned(alle, NY, cfg).fund.filter(f => f.raekker.includes(alle[0].id));
  }

  return { STANDARD, TYPER, FORSLAG, kontrolMaaned, tjekNy, nummerSerier, bilFraNr, vagtInterval, overlapMinutter, storDifference, vagtLaengdeMin, fingeraftryk };
});
