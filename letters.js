// Επιστολές προς Μηχανικό / Ανάδοχο / Αναθέτουσα Αρχή (πρότυπα ΠΕΟ–ΣΕΚ) ως PDF για εκτύπωση.
// Κουμπί «✉️ Επιστολή» σε κάθε έργο· καταγραφή κάθε έκδοσης στο αρχείο χρήσης (window.peLog) και τοπικό ιστορικό.
(function () {
  const W = 595, H = 842; // A4 όρθιο
  const ML = 72, MR = 72, CW = W - ML - MR;
  let FONTS = null;
  async function loadFonts() {
    if (FONTS) return FONTS;
    const emb = window.__PE_FONTS__;
    const b64 = (x) => Uint8Array.from(atob(x), (c) => c.charCodeAt(0));
    const get = async (n) => {
      if (emb) return {ttf: b64(emb[n].ttf), map: emb[n].map, used: new Map()};
      const [ttf, map] = await Promise.all([
        fetch('pdf/font-' + n + '.ttf').then((r) => r.arrayBuffer()),
        fetch('pdf/font-' + n + '.json').then((r) => r.json()),
      ]);
      return {ttf: new Uint8Array(ttf), map, used: new Map()};
    };
    FONTS = {r: await get('r'), b: await get('b')};
    return FONTS;
  }
  function glyphs(font, s) {
    const out = [];
    for (const ch of String(s)) {
      const cp = ch.codePointAt(0);
      let g = font.map.c[cp];
      if (g === undefined) g = font.map.c[63];
      font.used.set(g, cp); out.push(g);
    }
    return out;
  }
  const width = (font, s, size) => glyphs(font, s).reduce((a, g) => a + (font.map.w[g] || 500), 0) * size / 1000;
  const hex = (gs) => gs.map((g) => g.toString(16).padStart(4, '0')).join('');
  function Page() { this.ops = []; }
  Page.prototype.text = function (font, key, s, size, x, y) {
    this.ops.push(`BT 0 0 0 rg /${key} ${size} Tf ${x.toFixed(2)} ${(H - y).toFixed(2)} Td <${hex(glyphs(font, s))}> Tj ET`);
  };
  Page.prototype.img = function (key, x, y, w, h) { this.ops.push(`q ${w.toFixed(2)} 0 0 ${h.toFixed(2)} ${x.toFixed(2)} ${(H - y - h).toFixed(2)} cm /${key} Do Q`); (this.im = this.im || new Set()).add(key); };
  Page.prototype.line = function (x1, y1, x2, y2) { this.ops.push(`0 0 0 RG 0.6 w ${x1} ${H - y1} m ${x2} ${H - y2} l S`); };

  async function deflate(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function writePdf(pages, F, title) {
    const enc = new TextEncoder();
    const parts = []; const offs = []; let len = 0;
    const push = (b) => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length; };
    const objs = [];
    const add = (o) => { objs.push(o); return objs.length; };
    const stream = async (dict, data) => { const z = await deflate(data); return z ? {dict: dict + ` /Filter /FlateDecode /Length ${z.length}`, data: z} : {dict: dict + ` /Length ${data.length}`, data}; };
    const fontObj = async (font) => {
      const used = [...font.used.entries()].sort((a, b) => a[0] - b[0]);
      const ff = add(await stream(`<< /Length1 ${font.ttf.length}`, font.ttf));
      const m = font.map;
      const fd = add(`<< /Type /FontDescriptor /FontName /${m.name} /Flags 32 /FontBBox [${m.bbox.join(' ')}] /ItalicAngle 0 /Ascent ${m.asc} /Descent ${m.desc} /CapHeight ${m.asc} /StemV 80 /FontFile2 ${ff} 0 R >>`);
      const w = used.map(([g]) => `${g} [${m.w[g] || 500}]`).join(' ');
      const cid = add(`<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${m.name} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${fd} 0 R /CIDToGIDMap /Identity /DW 500 /W [${w}] >>`);
      const bf = used.map(([g, cp]) => `<${g.toString(16).padStart(4, '0')}> <${cp > 0xffff ? '003F' : cp.toString(16).padStart(4, '0')}>`);
      let cmap = '/CIDInit /ProcSet findresource begin 12 dict begin begincmap /CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def /CMapName /Adobe-Identity-UCS def /CMapType 2 def 1 begincodespacerange <0000> <FFFF> endcodespacerange\n';
      for (let i = 0; i < bf.length; i += 100) { const ch = bf.slice(i, i + 100); cmap += `${ch.length} beginbfchar\n${ch.join('\n')}\nendbfchar\n`; }
      cmap += 'endcmap CMapName currentdict /CMap defineresource pop end end';
      const tu = add(await stream('<<', enc.encode(cmap)));
      return add(`<< /Type /Font /Subtype /Type0 /BaseFont /${m.name} /Encoding /Identity-H /DescendantFonts [${cid} 0 R] /ToUnicode ${tu} 0 R >>`);
    };
    const f1 = await fontObj(F.r); const f2 = await fontObj(F.b);
    const pagesId = objs.length + 1; objs.push(null);
    const kids = [];
    const LG = window.__PE_LOGOS__ || {}; const imgIds = {};
    for (const p of pages) for (const k of (p.im || [])) if (!imgIds[k] && LG[k]) { const d = Uint8Array.from(atob(LG[k].b), (c) => c.charCodeAt(0)); imgIds[k] = add({dict: `<< /Type /XObject /Subtype /Image /Width ${LG[k].w} /Height ${LG[k].h} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${d.length}`, data: d}); }
    for (const p of pages) {
      const c = add(await stream('<<', enc.encode(p.ops.join('\n'))));
      const xo = [...(p.im || [])].filter((k) => imgIds[k]).map((k) => `/${k} ${imgIds[k]} 0 R`).join(' ');
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >>${xo ? ' /XObject << ' + xo + ' >>' : ''} >> /Contents ${c} 0 R >>`));
    }
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    const info = add('<< /Producer (Dimosia Erga app) /Title <FEFF' + [...title].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('') + '> >>');
    push(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 53, 10, 37, 226, 227, 207, 211, 10]));
    objs.forEach((o, i) => {
      offs.push(len);
      if (typeof o === 'string') push(`${i + 1} 0 obj\n${o}\nendobj\n`);
      else { push(`${i + 1} 0 obj\n${o.dict} >>\nstream\n`); push(o.data); push('\nendstream\nendobj\n'); }
    });
    const xref = len;
    let x = `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const o of offs) x += String(o).padStart(10, '0') + ' 00000 n \n';
    push(x + `trailer\n<< /Size ${objs.length + 1} /Root ${cat} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
    const out = new Uint8Array(len); let o = 0;
    for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }

  // ---- στοιχειοθεσία: παράγραφοι με πλήρη στοίχιση και έντονα τμήματα ----
  // runs: [{t:'κείμενο', b:true|false}]
  function layout(F, pages, st, runs, opts) {
    const size = opts.size || 11.5, lh = size * 1.55, align = opts.align || 'justify', x0 = opts.x || ML, maxW = opts.w || CW;
    const words = [];
    runs.forEach((r) => String(r.t).split(/\s+/).filter(Boolean).forEach((w) => words.push({w, b: !!r.b})));
    const sp = (b) => width(b ? F.b : F.r, ' ', size);
    const ww = (o) => width(o.b ? F.b : F.r, o.w, size);
    let line = [], lw = 0;
    const flush = (last) => {
      if (!line.length) return;
      if (st.y > H - 70) { pages.push(new Page()); st.y = 72; }
      const p = pages[pages.length - 1];
      const nat = line.reduce((a, o) => a + ww(o), 0) + line.slice(1).reduce((a, o) => a + sp(o.b), 0);
      let x = x0, gap = null;
      if (align === 'center') x = x0 + (maxW - nat) / 2;
      else if (align === 'right') x = x0 + maxW - nat;
      else if (align === 'justify' && !last && line.length > 1) gap = (maxW - line.reduce((a, o) => a + ww(o), 0)) / (line.length - 1);
      line.forEach((o, i) => {
        p.text(o.b ? F.b : F.r, o.b ? 'F2' : 'F1', o.w, size, x, st.y);
        x += ww(o) + (gap != null ? gap : sp(o.b));
      });
      st.y += lh; line = []; lw = 0;
    };
    for (const o of words) {
      const add = (line.length ? sp(o.b) : 0) + ww(o);
      if (line.length && lw + add > maxW) flush(false);
      line.push(o); lw += (line.length > 1 ? sp(o.b) : 0) + ww(o);
    }
    flush(true);
    st.y += opts.after != null ? opts.after : lh * 0.6;
  }

  const GEN = {'Λευκωσία': 'Λευκωσίας', 'Λεμεσός': 'Λεμεσού', 'Λάρνακα': 'Λάρνακας', 'Πάφος': 'Πάφου', 'Αμμόχωστος': 'Αμμοχώστου'};
  const T = (t, b) => ({t, b});

  function letterBody(n, d) {
    const proj = '«' + d.project + '»', eo = d.contractor, aa = d.authority;
    if (n === 1) return {
      to: [T('Προς: Υπεύθυνο Μηχανικό του Έργου', true)], salut: 'Κύριε,',
      paras: [
        [T('Έχουμε πληροφορηθεί ότι έχετε αναλάβει την επίβλεψη του Έργου ' + proj + ', το οποίο ανατέθηκε στην εταιρεία ' + eo + '.')],
        [T('Με την παρούσα επιστολή θέλουμε να σας επισημάνουμε την πρόνοια του συμβολαίου που αναφέρεται στην υποχρέωση του εργολάβου να τηρεί μητρώο όλων των εργοδοτουμένων του, καθώς επίσης και το αντίστοιχο μητρώο εργοδοτουμένων των Υπεργολάβων του και σας καλούμε να μεριμνήσετε για την πιστή εφαρμογή της.')],
        [T('Η τήρηση της πρόνοιας αυτής εκ μέρους της ανάδοχου εταιρείας, θα βοηθήσει σε μεγάλο βαθμό στην επίλυση προβλημάτων που πιθανόν να προκύψουν από παραβίαση του μέρους του Συμβολαίου που αναφέρεται στα Εργατικά.')],
        [T('Βέβαιοι ότι θα ανταποκριθείτε θετικά προς την υποχρέωση σας αυτή που προκύπτει από το Συμβόλαιο που επιβλέπετε, σας ευχαριστούμε εκ των προτέρων.')],
      ],
      cc: [aa], label: 'Υπεύθυνο Μηχανικό του Έργου',
    };
    if (n === 2) return {
      to: [T('Διεύθυνση', true), T('Εταιρείας', true), T(eo, true)].concat(d.address ? [T(d.address, false)] : []), salut: 'Κύριοι,',
      paras: [
        [T('Έχουμε πληροφορηθεί ότι έχετε αναλάβει από ' + aa + ', την εκτέλεση του ' + proj + ' και θα θέλαμε να σας επισύρουμε την προσοχή σας, για την τήρηση του μέρους του Συμβολαίου που αναφέρεται στα'), T('Εργατικά.', true), T('Πιο συγκεκριμένα θα πρέπει να μεριμνήσετε για την εφαρμογή των Συλλογικών Συμβάσεων τόσο για τους εργαζόμενους σας, όσο και για το προσωπικό των υπεργολάβων σας.')],
        [T('Βέβαιοι ότι θα ανταποκριθείτε θετικά, προς την υποχρέωση σας αυτή που προκύπτει από το Συμβόλαιο που έχετε υπογράψει, σας ευχαριστούμε εκ των προτέρων.')],
      ],
      cc: [aa, 'Υπεύθυνο Μηχανικό του έργου'], label: 'Ανάδοχο εταιρεία ' + eo,
    };
    if (n === 3) return {
      to: [T('Προς'), T('Υπεύθυνο Μηχανικό του Έργου')], salut: 'Έντιμε Κύριε,',
      subject: [T('Θέμα: Παραβίαση μέρους του Συμβολαίου, από την ' + eo + ', στο υπό εκτέλεση έργο ' + proj, true)],
      paras: [
        [T('Σχετικά με το πιο πάνω θέμα, θέλουμε να σας καταγγείλουμε ότι η εταιρεία ' + eo + ', που έχει υπογράψει συμβόλαιο με ' + aa + ', παραβιάζει το σχετικό μέρος του συμβολαίου που αναφέρεται στα εργατικά.')],
        [T('Το ζήτημα που σας καταγγέλλουμε είναι πάρα πολύ σοβαρό και παρακαλούμε ως υπεύθυνος μηχανικός του έργου, λάβετε όλα τα ενδεδειγμένα μέτρα για τήρηση του σχετικού μέρους του συμβολαίου από τον εργολάβο.')],
        [T('Παράλληλα είμαστε στη διάθεση σας για άμεση συνάντηση για προώθηση του όλου ζητήματος.')],
      ],
      cc: ['Εργολάβο (' + eo + ')', aa], label: 'Υπεύθυνο Μηχανικό του Έργου (καταγγελία παραβίασης)',
    };
    return {
      to: [T('Προς'), T(aa)], salut: 'Έντιμε Κύριε,',
      subject: [T('Θέμα: Παραλείψεις επιβλέποντα Μηχανικού σε σχέση με την εφαρμογή του συμβολαίου, στο υπό εκτέλεση έργο ' + proj, true)],
      paras: [
        [T('Σχετικά με το πιο πάνω θέμα, θέλουμε να σας καταγγείλουμε ότι παρά τις υποδείξεις μας προς τον επιβλέποντα Μηχανικό για τήρηση του συμβολαίου στο σχετικό μέρος που αναφέρεται στα εργατικά, δεν υπήρξε ανταπόκριση, με αποτέλεσμα τη συνέχιση της παραβίασης εκ μέρους του Συμβολαίου που αναφέρεται στα εργατικά.')],
        [T('Το ζήτημα που σας καταγγέλλουμε είναι πάρα πολύ σοβαρό και παρακαλούμε όπως λάβετε όλα τα ενδεδειγμένα μέτρα για την επίλυση του. Για σκοπούς ενημέρωσης, σας επισυνάπτουμε τις επιστολές που έχουν προηγηθεί.')],
      ],
      cc: ['Επιβλέπων Μηχανικός', 'Γενικός Ελεγκτής'], label: aa + ' (Αναθέτουσα Αρχή)',
    };
  }

  async function makeLetter(n, d) { return makeLetters([{n, d}], 'Επιστολή ' + n); }
  async function makeLetters(items, title) {
    const F = await loadFonts(); F.r.used = new Map(); F.b.used = new Map();
    const pages = []; let label = '';
    for (const it of items) { label = addLetter(F, pages, it.n, it.d); }
    return {bytes: await writePdf(pages, F, title || 'Επιστολές'), label};
  }
  function addLetter(F, pages, n, d) {
    pages.push(new Page()); const st = {y: 80};
    // λογότυπα στην κορυφή: Συντεχνία Οικοδόμων ΠΕΟ, Ο.Β.ΟΙ.Ε.Κ.-ΣΕΚ και (αν επιλεγεί) ΔΕΟΚ
    const LG = window.__PE_LOGOS__;
    if (LG && LG.peo && LG.sek) {
      const keys = d.deok && LG.deok ? ['peo', 'sek', 'deok'] : ['peo', 'sek'];
      const lh = 66, y0 = 30, pg = pages[pages.length - 1];
      const ws = keys.map((k) => Math.min(lh * LG[k].w / LG[k].h, 105)); const hs = keys.map((k, i) => ws[i] * LG[k].h / LG[k].w);
      const xs = keys.length === 2 ? [ML, W - MR - ws[1]] : [ML, (W - ws[1]) / 2, W - MR - ws[2]];
      keys.forEach((k, i) => pg.img(k, xs[i], y0 + (lh - hs[i]) / 2, ws[i], hs[i]));
      st.y = y0 + lh + 30;
    }
    const L = letterBody(n, d);
    layout(F, pages, st, [T(d.date)], {align: 'right', after: 18});
    L.to.forEach((r, i) => layout(F, pages, st, [r], {align: 'left', size: n === 1 ? 13 : 11.5, after: i === L.to.length - 1 ? 16 : 0}));
    layout(F, pages, st, [T(L.salut)], {align: 'left', after: 8});
    if (L.subject) layout(F, pages, st, L.subject, {align: 'justify', after: 12});
    L.paras.forEach((p) => layout(F, pages, st, p, {align: 'justify', after: 10}));
    st.y += 8;
    layout(F, pages, st, [T('Με τιμή')], {align: 'center', after: 22});
    if (st.y > H - 230) { pages.push(new Page()); st.y = 80; }
    const p = pages[pages.length - 1];
    const prov = GEN[d.district] || 'Λευκωσίας';
    const three = !!d.deok, s = three ? 10.5 : 11.5, colL = ML;
    const cols = three ? [ML, ML + CW / 3 + 6, ML + 2 * CW / 3 + 12] : [ML, ML + CW / 2 + 30];
    const lineW = three ? 128 : 150;
    let y = st.y;
    const row = (arr) => { arr.slice(0, cols.length).forEach((t, i) => p.text(F.r, 'F1', t, s, cols[i], y)); y += s * 1.45; };
    row(['Για την Συντεχνία', 'Για το Σωματείο', 'Για την Ομοσπονδία']); row(['Οικοδόμων ΠΕΟ', 'Οικοδόμων ΣΕΚ', 'Οικοδόμων ΔΕΟΚ']);
    y += 38; cols.forEach((x) => p.line(x, y, x + lineW, y)); y += 22;
    row(['Επαρ. Γραμματέας', 'Επαρ. Γραμματέας', 'Επαρ. Γραμματέας']); row(['Οικοδόμων Π.Ε.Ο', 'Οικοδόμων Σ.Ε.Κ', 'Οικοδόμων Δ.Ε.Ο.Κ']); row([prov, prov, prov]);
    y += 18;
    p.text(F.b, 'F2', 'Κοινοποίηση:', s, colL, y); p.line(colL, y + 2, colL + width(F.b, 'Κοινοποίηση:', s), y + 2); y += s * 1.6;
    st.y = y;
    L.cc.forEach((c) => layout(F, pages, st, [T(c)], {align: 'left', after: 0}));
    return L.label;
  }
  window.peMakeLetter = makeLetter;

  // ---- UI ----
  const SHORT = {1: 'Μηχανικός · μητρώο', 2: 'Ανάδοχος · Συλλ. Συμβάσεις', 3: 'Μηχανικός · καταγγελία', 4: 'Αναθέτουσα Αρχή'};
  const DESC = {1: 'Προς Υπεύθυνο Μηχανικό — τήρηση μητρώου εργοδοτουμένων', 2: 'Προς Ανάδοχο εταιρεία — τήρηση Συλλογικών Συμβάσεων', 3: 'Προς Υπεύθυνο Μηχανικό — καταγγελία παραβίασης', 4: 'Προς Αναθέτουσα Αρχή — καταγγελία επιβλέποντα (χωρίς ανταπόκριση στην Επ. 3)'};
  const today = () => { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); };
  // μηδενισμός δοκιμαστικών σημάνσεων (17/11/2026), μία φορά ανά συσκευή
  try { if (localStorage.getItem('pe_letters_reset') !== '1') { localStorage.removeItem('pe_letters'); localStorage.setItem('pe_letters_reset', '1'); } } catch (e) {}
  // ιστορικό στη συσκευή· αν ο browser δεν κρατά αποθήκευση, μένει στη μνήμη της σελίδας
  let MEMH = null;
  const getH = () => { try { const v = localStorage.getItem('pe_letters'); if (v != null) return JSON.parse(v) || {}; } catch (e) {} return MEMH ? JSON.parse(JSON.stringify(MEMH)) : {}; };
  const setH = (h) => { MEMH = h; try { localStorage.setItem('pe_letters', JSON.stringify(h)); } catch (e) {} };
  const css = document.createElement('style');
  css.textContent = `.pe-acts{display:flex;flex-direction:column;align-items:flex-start;gap:5px;margin:5px 0 3px}.pe-actrow{display:flex;flex-wrap:wrap;gap:6px;align-items:center}.pe-acts .pe-map{margin:0!important}
.pe-letbtn{display:inline-block;margin:0;font:inherit;font-size:12px;padding:3px 9px;border-radius:12px;border:1px solid #1f4e79;background:#fff;color:#1f4e79;cursor:pointer}
.pe-letbtn:hover{background:#eef3f8}.pe-lethist{display:flex;flex-wrap:wrap;gap:4px 6px;align-items:center;margin-top:5px;font-size:12px}
.pe-letchip{display:inline-block;border-radius:6px;padding:2px 7px;font-weight:600;border:1px solid}
.pe-letst{display:inline-block;border-radius:6px;padding:2px 7px;font-weight:700;color:#fff}
.pe-lethist.ok .pe-letchip{color:#1e6b34;background:#e8f5ec;border-color:#b9dfc5}.pe-lethist.ok .pe-letst{background:#2e7d32}
.pe-lethist.wait .pe-letchip{color:#7a5a00;background:#fff6d6;border-color:#ecd48a}.pe-lethist.wait .pe-letst{background:#b7860b}
.pe-lethist.due .pe-letchip{color:#9b1c1c;background:#fde8e8;border-color:#f3b4b4}.pe-lethist.due .pe-letst{background:#b3261e}
.pe-lethist.due{border-left:4px solid #b3261e;padding-left:6px}
.pe-letdots{display:flex;flex-wrap:wrap;gap:4px;align-items:center;margin:5px 0 2px;cursor:pointer;font-size:11.5px;line-height:1.2}
.pe-letdots>b{font-weight:600;color:#5b6b7b;margin-right:2px}
.pe-letdots i{font-style:normal;display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:10px;border:1px dashed #c5ced8;color:#8796a5;background:#fff;white-space:nowrap}
.pe-letdots i u{text-decoration:none;font-weight:700}
.pe-letdots i.s{border-style:solid;font-weight:600}
.pe-letdots.ok i.s{background:#e8f5ec;border-color:#2e7d32;color:#1e6b34}.pe-letdots.ok i.s u{color:#2e7d32}
.pe-letdots.wait i.s{background:#fff6d6;border-color:#b7860b;color:#7a5a00}.pe-letdots.wait i.s u{color:#b7860b}
.pe-letdots.due i.s{background:#fde8e8;border-color:#b3261e;color:#9b1c1c}.pe-letdots.due i.s u{color:#b3261e}
.pe-letdel{font:inherit;font-size:11.5px;padding:1px 6px;border-radius:6px;border:1px solid #b3261e;background:#fff;color:#b3261e;cursor:pointer}
.pe-letans{font:inherit;font-size:11.5px;padding:1px 7px;border-radius:6px;border:1px solid #1f4e79;background:#fff;color:#1f4e79;cursor:pointer}
.pe-letov{position:fixed;inset:0;background:rgba(10,20,35,.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;overflow:auto;padding:24px 12px}
.pe-letbox{font-family:system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;background:#fff;color:#111;max-width:560px;width:100%;border-radius:12px;padding:18px 18px 14px;box-shadow:0 10px 40px rgba(0,0,0,.3);font-size:14px}
.pe-letbox h3{margin:0 0 4px;font-size:17px;color:#1f4e79}.pe-letbox .sub{color:#555;font-size:12.5px;margin-bottom:12px}
.pe-letbox label{display:block;margin:9px 0 3px;font-weight:600;font-size:12.5px;color:#333}
.pe-letbox input,.pe-letbox select,.pe-letbox textarea{width:100%;box-sizing:border-box;font:inherit;font-size:14px;padding:7px 9px;border:1px solid #b9c6d3;border-radius:7px}
.pe-letbox textarea{min-height:58px}.pe-letn{display:flex;flex-direction:column;gap:6px}
.pe-letn label{display:flex;gap:8px;align-items:flex-start;font-weight:400;margin:0;padding:7px 9px;border:1px solid #d5dee8;border-radius:8px;cursor:pointer}
.pe-letn input{width:auto;margin-top:3px}.pe-letact{display:flex;gap:8px;justify-content:flex-end;margin-top:14px}
.pe-letact button{font:inherit;font-size:14px;padding:8px 14px;border-radius:8px;border:1px solid #1f4e79;cursor:pointer;background:#fff;color:#1f4e79}
.pe-letact .go{background:#1f4e79;color:#fff}.pe-fmt{display:flex;flex-direction:column;gap:6px}.pe-fmt label{display:flex;gap:8px;align-items:center;font-weight:400;margin:0;padding:8px 10px;border:1px solid #d5dee8;border-radius:8px;cursor:pointer}.pe-fmt input{width:auto}.pe-eonote{font-size:12px;color:#1e6b34;margin-top:4px;line-height:1.4}.pe-eonote a{color:#1f4e79}.pe-letact .go[disabled]{opacity:.5;cursor:default}
.pe-bulk{max-width:680px}.pe-bulk .pe-bchk{display:flex;gap:8px;align-items:center;font-weight:500}.pe-bulk .pe-bchk input{width:auto}
.pe-bq{display:flex;flex-wrap:wrap;gap:6px;margin-top:6px}.pe-bq button{font:inherit;font-size:12.5px;padding:4px 10px;border-radius:14px;border:1px solid #1f4e79;background:#fff;color:#1f4e79;cursor:pointer}
.pe-bsum{margin:14px 0 6px;font-size:13.5px;padding:8px 10px;background:#eef3f8;border-radius:8px}
.pe-blist{max-height:300px;overflow:auto;border:1px solid #d5dee8;border-radius:8px}
.pe-blist label{display:flex;gap:8px;align-items:flex-start;font-weight:400;margin:0;padding:6px 9px;border-bottom:1px solid #eef2f6;font-size:12.5px;cursor:pointer}
.pe-blist input{width:auto;margin-top:2px}.pe-blist small{display:block;color:#667;font-size:11.5px}
.pe-bulkbtn{font:inherit;font-size:14px;margin-left:6px;padding:7px 12px;border-radius:8px;border:1px solid #1f4e79;background:#fff;color:#1f4e79;cursor:pointer}.pe-letnote{font-size:12px;color:#666;margin-top:8px}`;
  document.head.appendChild(css);

  function allRows() { if (window.__ROWS__) return window.__ROWS__; try { const d = window.dash && window.dash.data && window.dash.data('works'); return (d && d.data) || []; } catch (e) { return []; } }
  function rowById(id) { const rs = allRows(); if (!window.__peIdx || window.__peIdx.n !== rs.length) { const m = new Map(); rs.forEach((r) => m.set(String(r.id), r)); window.__peIdx = {n: rs.length, m}; } return window.__peIdx.m.get(String(id)); }

  let REMOTE = {};
  async function loadRemote() {
    const c = window.peLogCfg; if (!c || !c.url) return;
    try {
      const r = await fetch(c.url + '?a=letters&k=' + encodeURIComponent(c.k), {cache: 'no-store'});
      const j = await r.json(); if (!Array.isArray(j)) return;
      const nd = (x) => { x = String(x || '').trim(); const a = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(x); if (a) return a[1].padStart(2, '0') + '/' + a[2].padStart(2, '0') + '/' + a[3]; const t = new Date(x); return isNaN(t) ? x : String(t.getDate()).padStart(2, '0') + '/' + String(t.getMonth() + 1).padStart(2, '0') + '/' + t.getFullYear(); };
      const m = {}; j.forEach((e) => { const id = String(e.cft || '').trim(); if (!id || !+e.n) return; (m[id] = m[id] || []).push({n: +e.n, d: nd(e.date), u: e.u || ''}); });
      REMOTE = m; decorate(); try { document.dispatchEvent(new Event('pe-letters')); } catch (e) {}
    } catch (e) {}
  }
  // διαγραμμένες επιστολές: pe_letdel = {"id|n|d": 1}, pe_letdelall = {id: ms} (όλες μέχρι εκείνη τη στιγμή)
  const LSJ = (k) => { try { return JSON.parse(localStorage.getItem(k) || '{}') || {}; } catch (e) { return {}; } };
  const pDm = (x) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(x || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1]).getTime() : 0; };
  function isDel(id, e) { const D = LSJ('pe_letdel'); if (D[id + '|' + e.n + '|' + e.d]) return true; const A = LSJ('pe_letdelall'); return !!(A[id] && (e.t ? e.t <= A[id] : pDm(e.d) <= A[id])); }
  function delLetters(id, list) {
    const D = LSJ('pe_letdel'); list.forEach((e) => { D[id + '|' + e.n + '|' + e.d] = 1; });
    try { localStorage.setItem('pe_letdel', JSON.stringify(D)); } catch (e) {}
    const h = getH(); if (h[id]) { h[id] = h[id].filter((x) => !list.some((e) => e.n === x.n && e.d === x.d)); if (!h[id].length) delete h[id]; setH(h); }
    const a = ANS(); if (a[id] && !hist(id).length) { delete a[id]; try { localStorage.setItem('pe_letans', JSON.stringify(a)); } catch (e) {} }
    const r = rowById(id); try { window.peLog && window.peLog('Διαγραφή επιστολής', list.map((e) => 'Επ. ' + e.n + ' ' + e.d).join(', ') + ' · ' + (r ? r.title.slice(0, 160) : '') + ' · CFT ' + id); } catch (e) {}
    decorate(); try { document.dispatchEvent(new Event('pe-letters')); } catch (e) {}
  }
  // μία φορά: διαγραφή των επιστολών για τα έργα της Pantazis metal ltd (αίτημα 18/11/2026)
  try { if (localStorage.getItem('pe_del_pantazis') !== '1') { const A = LSJ('pe_letdelall'), now = Date.now(); ['7111904', '8137552', '8190653', '9293060'].forEach((id) => { A[id] = now; }); localStorage.setItem('pe_letdelall', JSON.stringify(A));
    const h = getH(); ['7111904', '8137552', '8190653', '9293060'].forEach((id) => delete h[id]); setH(h); const a = LSJ('pe_letans'); ['7111904', '8137552', '8190653', '9293060'].forEach((id) => delete a[id]); localStorage.setItem('pe_letans', JSON.stringify(a)); localStorage.setItem('pe_del_pantazis', '1'); } } catch (e) {}
  function openDel(id) {
    const h = hist(id); if (!h.length) return; const r = rowById(id);
    const ov = document.createElement('div'); ov.className = 'pe-letov';
    ov.innerHTML = `<div class="pe-letbox" role="dialog"><h3>🗑 Διαγραφή επιστολών</h3><div class="sub"></div><div class="pe-letn">${h.map((e, i) => `<label><input type="checkbox" data-i="${i}" checked><span><b>Επιστολή ${e.n}</b> — ${e.d}${e.u ? ' (' + String(e.u).split('@')[0] + ')' : ''}</span></label>`).join('')}</div><div class="pe-letnote">Οι επιστολές που θα διαγραφούν δεν θα φαίνονται πια στο έργο ούτε στη λίστα επιστολών. Η διαγραφή καταγράφεται στο αρχείο χρήσης.</div><div class="pe-letact"><button type="button" class="cancel">Άκυρο</button><button type="button" class="go">Διαγραφή</button></div></div>`;
    ov.querySelector('.sub').textContent = r ? r.title.slice(0, 160) : 'CFT ' + id;
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    ov.querySelector('.cancel').onclick = () => ov.remove();
    ov.querySelector('.go').onclick = () => { const sel = [...ov.querySelectorAll('input:checked')].map((c) => h[+c.dataset.i]); if (sel.length) delLetters(id, sel); ov.remove(); };
    document.body.appendChild(ov);
  }
  function hist(id) {
    const all = (REMOTE[id] || []).concat((getH()[id] || []).map((e) => ({n: e.n, d: e.d, u: e.u || '', t: e.t}))).filter((e) => !isDel(id, e));
    const seen = new Set(); return all.filter((e) => { const k = e.n + '|' + e.d; if (seen.has(k)) return false; seen.add(k); return true; }).sort((a, b) => a.n - b.n);
  }
  const pD = (x) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(x || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
  const ANS = () => { try { return JSON.parse(localStorage.getItem('pe_letans') || '{}') || {}; } catch (e) { return {}; } };
  // Κατάσταση έργου: ok = ήρθε απάντηση, due = πέρασαν 30+ μέρες από την 1η επιστολή χωρίς απάντηση, wait = αναμονή
  function status(id) {
    const h = hist(String(id)); if (!h.length) return null;
    const ds = h.map((e) => pD(e.d)).filter(Boolean).sort((a, b) => a - b);
    const first = ds[0] || null, lastN = Math.max(...h.map((e) => e.n));
    const a = ANS()[id]; const answered = !!(a && a.n >= lastN);
    const days = first ? Math.floor((Date.now() - first.getTime()) / 864e5) : null;
    return {h, first, lastN, ans: a, answered, days, state: answered ? 'ok' : (days != null && days >= 30 ? 'due' : 'wait')};
  }
  window.peLetterKey = (r) => { const s = status(r.id); if (!s) return 0; return (s.state === 'due' ? 3 : s.state === 'wait' ? 2 : 1) * 1e5 + (s.days || 0); };
  function setAns(id, n) {
    const a = ANS(); if (n == null) delete a[id]; else { const d = new Date(); a[id] = {n, d: String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear()}; }
    try { localStorage.setItem('pe_letans', JSON.stringify(a)); } catch (e) {}
    const r = rowById(id); try { window.peLog && window.peLog(n == null ? 'Αναίρεση απάντησης επιστολής' : 'Απάντηση σε επιστολή', (n == null ? '' : 'Επ. ' + n + ' · ') + (r ? r.title.slice(0, 160) : '') + ' · CFT ' + id); } catch (e) {}
    decorate(); try { document.dispatchEvent(new Event('pe-letters')); } catch (e) {}
  }
  function histHTML(id) {
    const s = status(id); if (!s) return null;
    const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
    const chips = s.h.map((e) => '<span class="pe-letchip">✉ Επ. ' + e.n + ' · ' + esc(e.d) + (e.u ? ' · ' + esc(e.u.split('@')[0]) : '') + '</span>').join('');
    const st = s.state === 'ok' ? '✔ Απάντηση ' + esc(s.ans.d) : s.state === 'due' ? '⏰ ' + s.days + ' μέρες από την 1η — χωρίς απάντηση' : '⏳ ' + (s.days == null ? '' : s.days + ' μέρες · ') + 'αναμονή';
    const btn = (s.answered ? '<button type="button" class="pe-letans" data-un="1">Αναίρεση</button>' : '<button type="button" class="pe-letans">Ήρθε απάντηση</button>') + '<button type="button" class="pe-letdel" title="Διαγραφή επιστολής">🗑</button>';
    return {cls: s.state, html: '<span class="pe-letst">' + st + '</span>' + btn, n: s.lastN, answered: s.answered};
  }

  // καθαρό όνομα αρχείου (κρατά ελληνικά, βγάζει χαρακτήρες που δεν επιτρέπονται)
  const fpart = (x, max) => { let t = String(x || '').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, ' ').replace(/\s+/g, ' ').trim(); if (t.length > max) t = t.slice(0, max).replace(/\s+\S*$/, '').trim(); return t; };
  const fname = (n, auth, eo, date) => ['Επιστολή ' + n, fpart(auth, 60), fpart(eo, 50), String(date || '').replace(/\//g, '-')].filter(Boolean).join(' - ') + '.pdf';
  async function savePdf(bytes, name, title, mime) {
    mime = mime || 'application/pdf';
    const file = new File([bytes], name, {type: mime});
    let dl = null;
    try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
    if (dl) {
      try { await dl.save({filename: name, data: new Blob([bytes], {type: mime})}); }
      catch (e) { if (e && e.code === 'declined') return false; throw e; }
    } else if (navigator.canShare && navigator.canShare({files: [file]}) && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
      try { await navigator.share({files: [file], title}); } catch (e) { if (e.name !== 'AbortError') throw e; }
    } else {
      const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 60000);
    }
    return true;
  }
  // Διεύθυνση εγγεγραμμένου γραφείου από τον Έφορο Εταιρειών (window.__EOADDR, ανοικτά δεδομένα data.gov.cy)
  const EOSEARCH = 'https://efiling.drcor.mcit.gov.cy/DrcorPublic/SearchForm.aspx?sc=0&cultureInfo=el-GR';
  function eoInfo(r) {
    const A = (window.__EOADDR && window.__EOADDR.a) || {};
    let names = []; try { names = JSON.parse(r.contractor_split).map((x) => x[0]); } catch (e) { names = String(r.contractors || '').split(';'); }
    names = names.map((x) => String(x || '').trim()).filter(Boolean);
    for (const n of names) { const v = A[n]; if (v && v[2]) return {name: n, reg: v[0], active: !!v[1], addr: v[2], rname: v[3] || ''}; }
    return names.length ? {name: names[0], reg: '', active: false, addr: ''} : null;
  }
  const eoDate = () => (window.__EOADDR && window.__EOADDR.meta && window.__EOADDR.meta.date) || '';
  const eoOf = (r) => String(r.contractors || '').split(';').map((x) => x.trim()).filter(Boolean).join(' και ');
  const eurF = new Intl.NumberFormat('el-GR', {style: 'currency', currency: 'EUR', maximumFractionDigits: 0});

  // ---- Word (.docx) για αλλαγές πριν την εκτύπωση ----
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u) => { let c = 0xFFFFFFFF; for (let i = 0; i < u.length; i++) c = CRC[(c ^ u[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function zip(files) {
    const enc = new TextEncoder(); const parts = []; const cen = []; let off = 0;
    const u16 = (v) => [v & 255, (v >>> 8) & 255], u32 = (v) => [v & 255, (v >>> 8) & 255, (v >>> 16) & 255, (v >>> 24) & 255];
    for (const f of files) {
      const name = enc.encode(f.name), data = typeof f.data === 'string' ? enc.encode(f.data) : f.data, crc = crc32(data);
      const head = [...u32(0x04034b50), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0)];
      parts.push(new Uint8Array(head), name, data);
      cen.push(new Uint8Array([...u32(0x02014b50), ...u16(20), ...u16(20), ...u16(0x0800), ...u16(0), ...u16(0), ...u16(0x21), ...u32(crc), ...u32(data.length), ...u32(data.length), ...u16(name.length), ...u16(0), ...u16(0), ...u16(0), ...u16(0), ...u32(0), ...u32(off)]), name);
      off += head.length + name.length + data.length;
    }
    const cl = cen.reduce((a, b) => a + b.length, 0);
    const end = new Uint8Array([...u32(0x06054b50), ...u16(0), ...u16(0), ...u16(files.length), ...u16(files.length), ...u32(cl), ...u32(off), ...u16(0)]);
    const all = [...parts, ...cen, end]; const out = new Uint8Array(all.reduce((a, b) => a + b.length, 0)); let p = 0; all.forEach((b) => { out.set(b, p); p += b.length; });
    return out;
  }
  function makeDocx(items) {
    const X = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/[<]/g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    const LG = window.__PE_LOGOS__ || {}; const usedImg = {}; let did = 0;
    const run = (t, o = {}) => `<w:r><w:rPr>${o.b ? '<w:b/>' : ''}${o.u ? '<w:u w:val="single"/>' : ''}${o.sz ? `<w:sz w:val="${o.sz}"/><w:szCs w:val="${o.sz}"/>` : ''}</w:rPr><w:t xml:space="preserve">${X(t)}</w:t></w:r>`;
    const para = (runs, o = {}) => `<w:p><w:pPr>${o.pb ? '<w:pageBreakBefore/>' : ''}<w:spacing w:before="0" w:after="${o.after == null ? 0 : o.after}" w:line="${o.line || 276}" w:lineRule="auto"/>${o.jc ? `<w:jc w:val="${o.jc}"/>` : ''}</w:pPr>${runs}</w:p>`;
    const img = (k, wPt, hPt) => { usedImg[k] = 1; did++; const cx = Math.round(wPt * 12700), cy = Math.round(hPt * 12700);
      return `<w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/><wp:docPr id="${did}" name="Logo ${did}"/><a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${did}" name="${k}.jpeg"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="rId_${k}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r>`; };
    const NB = '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>';
    const table = (cols, rows, pb) => { const tw = 9026, cw = Math.floor(tw / cols.length);
      return (pb ? para('', {pb: true}) : '') + `<w:tbl><w:tblPr><w:tblW w:w="${tw}" w:type="dxa"/>${NB}<w:tblLayout w:type="fixed"/><w:tblCellMar><w:left w:w="0" w:type="dxa"/><w:right w:w="60" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${cols.map(() => `<w:gridCol w:w="${cw}"/>`).join('')}</w:tblGrid>` +
        rows.map((r) => `<w:tr>${r.map((c) => `<w:tc><w:tcPr><w:tcW w:w="${cw}" w:type="dxa"/></w:tcPr>${c || '<w:p/>'}</w:tc>`).join('')}</w:tr>`).join('') + '</w:tbl>'; };
    let body = '';
    items.forEach((it, idx) => {
      const n = it.n, d = it.d, L = letterBody(n, d), first = idx > 0;
      if (LG.peo && LG.sek) {
        const keys = d.deok && LG.deok ? ['peo', 'sek', 'deok'] : ['peo', 'sek']; const jc = keys.length === 2 ? ['left', 'right'] : ['left', 'center', 'right'];
        const cells = keys.map((k, i) => { const h = 62, w = Math.min(h * LG[k].w / LG[k].h, 100), hh = w * LG[k].h / LG[k].w; return para(img(k, w, hh), {jc: jc[i]}); });
        body += (first ? para('', {pb: true}) : '') + table(keys, [cells]);
      } else if (first) body += para('', {pb: true});
      body += para('', {after: 120}) + para(run(d.date), {jc: 'right', after: 240});
      L.to.forEach((t, i) => { body += para(run(t.t, {b: t.b, sz: n === 1 ? 26 : 23}), {after: i === L.to.length - 1 ? 240 : 0}); });
      body += para(run(L.salut), {after: 120});
      if (L.subject) body += para(L.subject.map((t) => run(t.t, {b: t.b})).join(''), {jc: 'both', after: 200});
      L.paras.forEach((p) => { body += para(p.map((t, i) => run((i ? ' ' : '') + t.t, {b: t.b})).join(''), {jc: 'both', after: 160, line: 300}); });
      body += para('', {after: 80}) + para(run('Με τιμή'), {jc: 'center', after: 360});
      const prov = GEN[d.district] || 'Λευκωσίας', three = !!d.deok, cols = three ? [0, 1, 2] : [0, 1], sz = three ? 20 : 22;
      const T1 = ['Για την Συντεχνία', 'Για το Σωματείο', 'Για την Ομοσπονδία'], T2 = ['Οικοδόμων ΠΕΟ', 'Οικοδόμων ΣΕΚ', 'Οικοδόμων ΔΕΟΚ'], T3 = ['Οικοδόμων Π.Ε.Ο', 'Οικοδόμων Σ.Ε.Κ', 'Οικοδόμων Δ.Ε.Ο.Κ'];
      body += table(cols, [cols.map((i) => para(run(T1[i], {sz})) + para(run(T2[i], {sz}), {after: 720}) + para(run('_______________________', {sz})) + para(run('Επαρ. Γραμματέας', {sz})) + para(run(T3[i], {sz})) + para(run(prov, {sz})))]);
      body += para('', {after: 120}) + para(run('Κοινοποίηση:', {b: true, u: true, sz}), {after: 60});
      L.cc.forEach((c) => { body += para(run(c, {sz})); });
    });
    const sect = '<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="720" w:right="1440" w:bottom="1080" w:left="1440" w:header="425" w:footer="425" w:gutter="0"/></w:sectPr>';
    const doc = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body}${sect}</w:body></w:document>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial" w:eastAsia="Arial"/><w:sz w:val="23"/><w:szCs w:val="23"/><w:lang w:val="el-GR"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="276" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style></w:styles>`;
    const imgs = Object.keys(usedImg);
    const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>${imgs.map((k) => `<Relationship Id="rId_${k}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${k}.jpeg"/>`).join('')}</Relationships>`;
    const files = [
      {name: '[Content_Types].xml', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="jpeg" ContentType="image/jpeg"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>'},
      {name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>'},
      {name: 'word/document.xml', data: doc}, {name: 'word/styles.xml', data: styles}, {name: 'word/_rels/document.xml.rels', data: rels},
    ].concat(imgs.map((k) => ({name: 'word/media/' + k + '.jpeg', data: Uint8Array.from(atob(LG[k].b), (c) => c.charCodeAt(0))})));
    return {bytes: zip(files), label: items.length ? letterBody(items[items.length - 1].n, items[items.length - 1].d).label : ''};
  }
  const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  const getFmt = () => { try { return localStorage.getItem('pe_letfmt') || 'docx'; } catch (e) { return 'docx'; } };
  const fmtHTML = () => `<label>Μορφή αρχείου</label><div class="pe-fmt"><label><input type="radio" name="pe-fmt" value="docx"> <b>Word (.docx)</b> — για αλλαγές πριν την εκτύπωση</label><label><input type="radio" name="pe-fmt" value="pdf"> <b>PDF</b> — έτοιμο για εκτύπωση</label></div>`;
  const fmtInit = (ov) => { const f = getFmt(); ov.querySelectorAll('[name=pe-fmt]').forEach((x) => { x.checked = x.value === f; }); };
  const fmtGet = (ov) => { const x = ov.querySelector('[name=pe-fmt]:checked'); const f = x ? x.value : 'docx'; try { localStorage.setItem('pe_letfmt', f); } catch (e) {} return f; };

  // ---- Μαζικές επιστολές: ίδια επιστολή σε όλα τα έργα πάνω από ένα ποσό ----
  function openBulk() {
    const ov = document.createElement('div'); ov.className = 'pe-letov';
    let mv = 1000000; try { mv = +(localStorage.getItem('pe_bulkmin') || mv) || mv; } catch (e) {}
    ov.innerHTML = `<div class="pe-letbox pe-bulk" role="dialog" aria-label="Μαζικές επιστολές">
      <h3>✉️ Μαζικές επιστολές</h3><div class="sub">Η ίδια επιστολή για όλα τα έργα πάνω από ένα ποσό, σε ένα PDF (μία επιστολή ανά σελίδα) για εκτύπωση.</div>
      <label>Ποια επιστολή</label><div class="pe-letn">${[1, 2, 3, 4].map((n) => `<label><input type="radio" name="pe-bn" value="${n}" ${n === 1 ? 'checked' : ''}><span><b>Επιστολή ${n}</b> — ${DESC[n]}</span></label>`).join('')}</div>
      <label>Ανατεθείσα αξία πάνω από (€)</label><input name="min" inputmode="numeric">
      <div class="pe-bq">${[100000, 500000, 1000000, 5000000].map((v) => `<button type="button" data-v="${v}">${eurF.format(v)}</button>`).join('')}</div>
      <label class="pe-bchk"><input type="checkbox" name="flt" checked> Μόνο τα έργα με τα τρέχοντα φίλτρα (έτος, επαρχία κ.λπ.)</label>
      <label class="pe-bchk"><input type="checkbox" name="skip" checked> Παράλειψη έργων όπου έχει ήδη σταλεί αυτή η επιστολή</label>
      <label>Ημερομηνία επιστολών</label><input name="date">
      <label>Επαρχία υπογραφών όταν η επαρχία του έργου δεν προσδιορίζεται</label><select name="dd">${Object.keys(GEN).map((k) => `<option>${k}</option>`).join('')}</select>
      <label class="pe-bchk"><input type="checkbox" name="deok"> Προσθήκη ΔΕΟΚ στις υπογραφές</label>
      <div class="pe-bsum"></div><div class="pe-blist"></div>
      <div class="pe-letnote">Η επαρχία στις υπογραφές μπαίνει αυτόματα από κάθε έργο. Για την Επιστολή 2 η διεύθυνση της εταιρείας μπαίνει αυτόματα από τον Έφορο Εταιρειών (εγγεγραμμένο γραφείο)· όπου δεν βρεθεί, μένει κενή. Μετά τη δημιουργία, κάθε έργο σημειώνεται «τυπώθηκε & στάλθηκε» και καταγράφεται στο αρχείο.</div>
      ${fmtHTML()}
      <div class="pe-letact"><button type="button" class="cancel">Άκυρο</button><button type="button" class="go">Δημιουργία</button></div></div>`;
    const q = (x) => ov.querySelector(x);
    q('[name=min]').value = mv; q('[name=date]').value = today();
    try { q('[name=deok]').checked = localStorage.getItem('pe_deok') === '1'; } catch (e) {}
    fmtInit(ov);
    let list = [], off = new Set();
    const num = () => +String(q('[name=min]').value).replace(/[^\d]/g, '') || 0;
    const draw = () => {
      const n = +ov.querySelector('[name=pe-bn]:checked').value, min = num();
      const src = q('[name=flt]').checked && window.peFiltered ? (window.peFiltered() || []) : allRows();
      list = src.filter((r) => (r.awarded_value || 0) > min && !(q('[name=skip]').checked && hist(r.id).some((e) => e.n === n))).sort((a, b) => b.awarded_value - a.awarded_value);
      const sel = list.filter((r) => !off.has(String(r.id)));
      const tot = sel.reduce((a, r) => a + (r.awarded_value || 0), 0);
      q('.pe-bsum').innerHTML = list.length ? `<b>${sel.length}</b> από ${list.length} έργα επιλεγμένα · συνολική αξία <b>${eurF.format(tot)}</b>${sel.length > 300 ? ' · <span style="color:#b3261e">πάνω από 300 — μειώστε με μεγαλύτερο ποσό ή φίλτρα</span>' : ''}` : 'Κανένα έργο με αυτά τα κριτήρια.';
      q('.pe-blist').innerHTML = list.slice(0, 500).map((r) => `<label><input type="checkbox" data-id="${r.id}" ${off.has(String(r.id)) ? '' : 'checked'}><span><b>${eurF.format(r.awarded_value)}</b> · ${String(r.title).replace(/[<]/g, '&lt;').slice(0, 110)}<small>${[eoOf(r), r.district].filter(Boolean).join(' · ').replace(/[<]/g, '&lt;')}${n === 2 ? ((eoInfo(r) || {}).addr ? ' · 📍 ' + eoInfo(r).addr.replace(/[<]/g, '&lt;') : ' · <span style="color:#b3261e">χωρίς διεύθυνση</span>') : ''}</small></span></label>`).join('');
      q('.pe-blist').querySelectorAll('input').forEach((c) => c.onchange = () => { c.checked ? off.delete(c.dataset.id) : off.add(c.dataset.id); draw(); });
      const go = q('.go'); go.disabled = !sel.length || sel.length > 300; go.textContent = 'Δημιουργία (' + sel.length + ' επιστολές)';
    };
    ov.querySelectorAll('.pe-bq button').forEach((b) => b.onclick = () => { q('[name=min]').value = b.dataset.v; off.clear(); draw(); });
    ov.querySelectorAll('[name=pe-bn],[name=flt],[name=skip]').forEach((x) => x.addEventListener('change', () => { off.clear(); draw(); }));
    q('[name=min]').addEventListener('input', () => { off.clear(); draw(); });
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    q('.cancel').onclick = () => ov.remove();
    q('.go').onclick = async () => {
      const btn = q('.go'); const sel = list.filter((r) => !off.has(String(r.id))); if (!sel.length) return;
      btn.disabled = true; btn.textContent = 'Δημιουργία ' + sel.length + ' επιστολών…';
      const n = +ov.querySelector('[name=pe-bn]:checked').value, date = q('[name=date]').value.trim(), deok = q('[name=deok]').checked, dd = q('[name=dd]').value;
      try { localStorage.setItem('pe_bulkmin', String(num())); localStorage.setItem('pe_deok', deok ? '1' : '0'); } catch (e) {}
      const items = sel.map((r) => ({r, n, d: {project: r.title, contractor: eoOf(r), authority: r.authority, address: n === 2 ? ((eoInfo(r) || {}).addr || '') : '', district: GEN[r.district] ? r.district : dd, date, deok}}));
      try {
        const fmt = fmtGet(ov);
        const {bytes, label} = fmt === 'docx' ? makeDocx(items) : await makeLetters(items, 'Επιστολή ' + n + ' — ' + sel.length + ' έργα');
        const auths = Array.from(new Set(sel.map((r) => r.authority))), eos = Array.from(new Set(sel.map((r) => eoOf(r))));
        const name = fname(n, auths.length === 1 ? auths[0] : auths.length + ' Αρχές', eos.length === 1 ? eos[0] : eos.length + ' ανάδοχοι', date).replace('.pdf', ' (' + sel.length + ' έργα).pdf');
        if (!(await savePdf(bytes, fmt === 'docx' ? name.replace(/\.pdf$/, '.docx') : name, 'Επιστολή ' + n + ' — ' + sel.length + ' έργα', fmt === 'docx' ? DOCX : null))) { btn.disabled = false; draw(); return; }
        const h = getH(), u = (window.peLogCfg && window.peLogCfg.user) || '';
        items.forEach((it) => { (h[it.r.id] = h[it.r.id] || []).push({n, d: date, u, t: Date.now()}); }); setH(h);
        if (window.peLog) {
          window.peLog('Μαζικές επιστολές', 'Επιστολή ' + n + ' · ' + sel.length + ' έργα πάνω από ' + eurF.format(num()) + ' · Ημ/νία: ' + date);
          items.forEach((it, i) => setTimeout(() => { try { window.peLog('Επιστολή ' + n, 'Προς: ' + label + ' · Έργο: ' + it.d.project.slice(0, 160) + ' · Ανάδοχος: ' + it.d.contractor + ' · Αρχή: ' + it.d.authority + ' · Επαρχία: ' + it.d.district + ' · Υπογραφές: ' + (deok ? 'ΠΕΟ, ΣΕΚ, ΔΕΟΚ' : 'ΠΕΟ, ΣΕΚ') + ' · Ημ/νία επιστολής: ' + date + ' · CFT ' + it.r.id + ' · μαζική'); } catch (e) {} }, 400 * (i + 1)));
        }
        ov.remove(); decorate(); try { document.dispatchEvent(new Event('pe-letters')); } catch (e) {}
      } catch (e) { alert('Δεν ήταν δυνατή η δημιουργία των επιστολών. ' + (e && e.message ? e.message : '')); btn.disabled = false; draw(); }
    };
    document.body.appendChild(ov); draw();
  }
  window.peOpenBulk = openBulk;

  function openForm(r) {
    const ov = document.createElement('div'); ov.className = 'pe-letov';
    const eo = String(r.contractors || '').split(';').map((s) => s.trim()).filter(Boolean).join(' και ');
    const prev = hist(r.id);
    const next = prev.length ? Math.min(4, Math.max(...prev.map((e) => e.n)) + 1) : 1;
    ov.innerHTML = `<div class="pe-letbox" role="dialog" aria-label="Επιστολή για το έργο">
      <h3>✉️ Επιστολή για το έργο</h3><div class="sub"></div>
      <label>Ποια επιστολή</label><div class="pe-letn">${[1, 2, 3, 4].map((n) => `<label><input type="radio" name="pe-n" value="${n}" ${n === next ? 'checked' : ''}><span><b>Επιστολή ${n}</b> — ${DESC[n]}</span></label>`).join('')}</div>
      <label>Έργο</label><textarea name="project"></textarea>
      <label>Ανάδοχος (εταιρεία)</label><input name="contractor">
      <label>Αναθέτουσα Αρχή</label><input name="authority">
      <label class="addr">Διεύθυνση εταιρείας (για την Επιστολή 2)</label><input name="address" class="addr"><div class="addr pe-eonote"></div>
      <label>Επαρχία (για τις υπογραφές)</label><select name="district">${Object.keys(GEN).map((k) => `<option>${k}</option>`).join('')}</select>
      <label>Ημερομηνία</label><input name="date">
      <label class="pe-deok" style="display:flex;gap:8px;align-items:center;font-weight:600;margin-top:12px"><input type="checkbox" name="deok" style="width:auto"> Προσθήκη ΔΕΟΚ στις υπογραφές (3 υπογραφές: ΠΕΟ – ΣΕΚ – ΔΕΟΚ)</label>
      ${fmtHTML()}
      <div class="pe-letnote">Το Word ανοίγει για αλλαγές πριν την εκτύπωση· το PDF είναι έτοιμο για εκτύπωση. Η έκδοση καταγράφεται στο αρχείο (ποια επιστολή, για ποιο έργο, πότε, από ποιον).</div>
      <div class="pe-letact"><button type="button" class="cancel">Άκυρο</button><button type="button" class="go">Δημιουργία</button></div></div>`;
    const q = (s) => ov.querySelector(s);
    q('.sub').textContent = r.title.slice(0, 160) + (prev.length ? ' — ήδη: ' + prev.map((e) => 'Επ.' + e.n + ' ' + e.d).join(', ') : '');
    q('[name=project]').value = r.title; q('[name=contractor]').value = eo; q('[name=authority]').value = r.authority;
    q('[name=district]').value = GEN[r.district] ? r.district : 'Λευκωσία';
    { const ei = eoInfo(r), nt = q('.pe-eonote'); const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
      if (ei && ei.addr) { q('[name=address]').value = ei.addr; nt.innerHTML = '✔ Εγγεγραμμένο γραφείο από τον <b>Έφορο Εταιρειών</b>' + (ei.reg ? ' (ΗΕ ' + esc(ei.reg) + ')' : '') + (eoDate() ? ' · στοιχεία ' + esc(eoDate()) : '') + (ei.rname ? '<br><span style="color:#8a6d00">Πιθανή αντιστοίχιση με «' + esc(ei.rname) + '» — ελέγξτε την.</span>' : '') + (ei.active ? '' : '<br><span style="color:#b3261e">⚠ Η εταιρεία δεν εμφανίζεται ως «Εγγεγραμμένη» στο μητρώο — ελέγξτε την.</span>') + ' · <a href="' + EOSEARCH + '" target="_blank" rel="noopener">έλεγχος</a>'; }
      else { nt.innerHTML = 'Δεν βρέθηκε στο μητρώο του Εφόρου (π.χ. φυσικό πρόσωπο ή κοινοπραξία). <a href="' + EOSEARCH + '" target="_blank" rel="noopener">Αναζήτηση στον Έφορο Εταιρειών</a> ή γράψτε τη διεύθυνση.'; } } q('[name=date]').value = today(); try { q('[name=deok]').checked = localStorage.getItem('pe_deok') === '1'; } catch (e) {}
    fmtInit(ov);
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    q('.cancel').onclick = () => ov.remove();
    q('.go').onclick = async () => {
      const btn = q('.go'); btn.disabled = true; btn.textContent = 'Δημιουργία…';
      const n = +ov.querySelector('[name=pe-n]:checked').value;
      const d = {project: q('[name=project]').value.trim(), contractor: q('[name=contractor]').value.trim(), authority: q('[name=authority]').value.trim(), address: q('[name=address]').value.trim(), district: q('[name=district]').value, date: q('[name=date]').value.trim(), deok: q('[name=deok]').checked};
      try { localStorage.setItem('pe_deok', d.deok ? '1' : '0'); } catch (e) {}
      try {
        const fmt = fmtGet(ov);
        const {bytes, label} = fmt === 'docx' ? makeDocx([{n, d}]) : await makeLetter(n, d);
        const name = fname(n, d.authority, d.contractor, d.date).replace(/\.pdf$/, fmt === 'docx' ? '.docx' : '.pdf');
        if (!(await savePdf(bytes, name, 'Επιστολή ' + n, fmt === 'docx' ? DOCX : null))) { btn.disabled = false; btn.textContent = 'Δημιουργία'; return; }
        const h = getH(); (h[r.id] = h[r.id] || []).push({n, d: d.date, u: (window.peLogCfg && window.peLogCfg.user) || '', t: Date.now()}); setH(h);
        if (window.peLog) window.peLog('Επιστολή ' + n, 'Προς: ' + label + ' · Έργο: ' + d.project.slice(0, 160) + ' · Ανάδοχος: ' + d.contractor + ' · Αρχή: ' + d.authority + ' · Επαρχία: ' + d.district + ' · Υπογραφές: ' + (d.deok ? 'ΠΕΟ, ΣΕΚ, ΔΕΟΚ' : 'ΠΕΟ, ΣΕΚ') + ' · Ημ/νία επιστολής: ' + d.date + ' · CFT ' + r.id);
        ov.remove(); decorate(); try { document.dispatchEvent(new Event('pe-letters')); } catch (e) {}
      } catch (e) { alert('Δεν ήταν δυνατή η δημιουργία της επιστολής. ' + (e && e.message ? e.message : '')); btn.disabled = false; btn.textContent = 'Δημιουργία'; }
    };
    const sync = () => { const n = ov.querySelector('[name=pe-n]:checked').value; ov.querySelectorAll('.addr').forEach((x) => { x.style.display = n === '2' ? '' : 'none'; }); };
    ov.querySelectorAll('[name=pe-n]').forEach((x) => x.addEventListener('change', sync)); sync();
    document.body.appendChild(ov);
  }

  function decorate() {
    const pr = document.querySelector('.pe-pdfrow');
    if (pr && !pr.querySelector('.pe-bulkbtn')) { const bb = document.createElement('button'); bb.type = 'button'; bb.className = 'pe-bulkbtn'; bb.textContent = '✉️ Μαζικές επιστολές'; bb.onclick = openBulk; pr.appendChild(bb); }
    document.querySelectorAll('tr[data-key] td.title').forEach((tc) => {
      const id = tc.parentElement.dataset.key;
      let b = tc.querySelector('.pe-letbtn');
      if (!b) {
        b = document.createElement('button'); b.type = 'button'; b.className = 'pe-letbtn'; b.textContent = '✉️ Επιστολή';
        b.onclick = (e) => { e.preventDefault(); const r = rowById(id); if (r) openForm(r); };
        let box = tc.querySelector('.pe-acts');
        if (!box) {
          box = document.createElement('div'); box.className = 'pe-acts';
          const maps = [...tc.querySelectorAll('a.pe-map')];
          if (maps.length) { const mr = document.createElement('div'); mr.className = 'pe-actrow'; maps.forEach((m) => mr.appendChild(m)); box.appendChild(mr); }
          const sm = tc.querySelector('small'); tc.insertBefore(box, sm || null);
        }
        const lr = document.createElement('div'); lr.className = 'pe-actrow'; lr.appendChild(b); box.appendChild(lr);
      }
      const st = status(id), sent = new Set(st ? st.h.map((e) => e.n) : []);
      const dk = (st ? st.state : '') + '|' + Array.from(sent).join(',');
      let dots = tc.querySelector('.pe-letdots');
      if (!dots) {
        dots = document.createElement('span'); dots.className = 'pe-letdots';
        const a = tc.querySelector('a:not(.pe-map)'); if (a) a.after(dots); else tc.prepend(dots);
        dots.onclick = (e) => { e.preventDefault(); const r = rowById(id); if (r) openForm(r); };
      }
      if (dots.dataset.k !== dk) {
        dots.dataset.k = dk; dots.className = 'pe-letdots ' + (st ? st.state : '');
        const by = {}; (st ? st.h : []).forEach((e) => { (by[e.n] = by[e.n] || []).push(e); });
        const sh = (d) => d.replace(/\/(\d{2})(\d{2})$/, '/$2');
        if (!st) dots.innerHTML = '<b>Επιστολές:</b><i>καμία δεν στάλθηκε ακόμα</i>'; else dots.innerHTML = '<b>Επιστολές:</b>' + [1, 2, 3, 4].map((n) => {
          const e = by[n];
          const tip = 'Επιστολή ' + n + ' — ' + DESC[n] + (e ? '\nΣτάλθηκε ' + e.map((x) => x.d + (x.u ? ' (' + x.u.split('@')[0] + ')' : '')).join(', ') : '\nΔεν στάλθηκε');
          return '<i class="' + (e ? 's' : '') + '" title="' + tip.replace(/"/g, '&quot;') + '"><u>' + n + '</u>' + SHORT[n] + (e ? ' · ✔ ' + sh(e[e.length - 1].d) : '') + '</i>';
        }).join('');
        dots.title = st ? '' : 'Δεν έχει σταλεί επιστολή · κλικ για νέα επιστολή';
      }
      let hs = tc.querySelector('.pe-lethist'); const t = histHTML(id);
      if (t) {
        if (!hs) { hs = document.createElement('div'); b.parentElement.after(hs); }
        const cls = 'pe-lethist ' + t.cls;
        if (hs.dataset.h !== t.html || hs.className !== cls) {
          hs.className = cls; hs.dataset.h = t.html; hs.innerHTML = t.html;
          const ab = hs.querySelector('.pe-letans'); if (ab) ab.onclick = (e) => { e.preventDefault(); setAns(id, t.answered ? null : t.n); };
          const db = hs.querySelector('.pe-letdel'); if (db) db.onclick = (e) => { e.preventDefault(); openDel(id); };
        }
      } else if (hs) hs.remove();
    });
  }
  window.peLetters = {hist, status, setAns, openDel, rowById, allRows, openForm, ids: () => Array.from(new Set(Object.keys(REMOTE).concat(Object.keys(getH())))), desc: DESC};
  setTimeout(loadRemote, 1500); setInterval(loadRemote, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) loadRemote(); });
  let pend = false;
  new MutationObserver(() => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; decorate(); }); }).observe(document.documentElement, {childList: true, subtree: true});
})();
