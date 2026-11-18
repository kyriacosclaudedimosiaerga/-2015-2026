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
    for (const p of pages) {
      const c = add(await stream('<<', enc.encode(p.ops.join('\n'))));
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
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

  async function makeLetter(n, d) {
    const F = await loadFonts(); F.r.used = new Map(); F.b.used = new Map();
    const pages = [new Page()]; const st = {y: 80};
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
    const title = 'Επιστολή ' + n;
    return {bytes: await writePdf(pages, F, title), label: L.label};
  }
  window.peMakeLetter = makeLetter;

  // ---- UI ----
  const SHORT = {1: 'Μηχανικός · μητρώο', 2: 'Ανάδοχος · Συλλ. Συμβάσεις', 3: 'Μηχανικός · καταγγελία', 4: 'Αναθέτουσα Αρχή'};
  const DESC = {1: 'Προς Υπεύθυνο Μηχανικό — τήρηση μητρώου εργοδοτουμένων', 2: 'Προς Ανάδοχο εταιρεία — τήρηση Συλλογικών Συμβάσεων', 3: 'Προς Υπεύθυνο Μηχανικό — καταγγελία παραβίασης', 4: 'Προς Αναθέτουσα Αρχή — καταγγελία επιβλέποντα (χωρίς ανταπόκριση στην Επ. 3)'};
  const today = () => { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); };
  // μηδενισμός δοκιμαστικών σημάνσεων (17/11/2026), μία φορά ανά συσκευή
  try { if (localStorage.getItem('pe_letters_reset') !== '1') { localStorage.removeItem('pe_letters'); localStorage.setItem('pe_letters_reset', '1'); } } catch (e) {}
  const getH = () => { try { return JSON.parse(localStorage.getItem('pe_letters') || '{}'); } catch (e) { return {}; } };
  const setH = (h) => { try { localStorage.setItem('pe_letters', JSON.stringify(h)); } catch (e) {} };
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
.pe-letact .go{background:#1f4e79;color:#fff}.pe-letnote{font-size:12px;color:#666;margin-top:8px}`;
  document.head.appendChild(css);

  function allRows() { if (window.__ROWS__) return window.__ROWS__; try { const d = window.dash && window.dash.data && window.dash.data('works'); return (d && d.data) || []; } catch (e) { return []; } }
  function rowById(id) { const rs = allRows(); if (!window.__peIdx || window.__peIdx.n !== rs.length) { const m = new Map(); rs.forEach((r) => m.set(String(r.id), r)); window.__peIdx = {n: rs.length, m}; } return window.__peIdx.m.get(String(id)); }

  let REMOTE = {};
  async function loadRemote() {
    const c = window.peLogCfg; if (!c || !c.url) return;
    try {
      const r = await fetch(c.url + '?a=letters&k=' + encodeURIComponent(c.k), {cache: 'no-store'});
      const j = await r.json(); if (!Array.isArray(j)) return;
      const m = {}; j.forEach((e) => { const id = String(e.cft || ''); if (!id) return; (m[id] = m[id] || []).push({n: +e.n, d: String(e.date || ''), u: e.u || ''}); });
      REMOTE = m; decorate(); try { document.dispatchEvent(new Event('pe-letters')); } catch (e) {}
    } catch (e) {}
  }
  function hist(id) {
    const all = (REMOTE[id] || []).concat((getH()[id] || []).map((e) => ({n: e.n, d: e.d, u: e.u || ''})));
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
    const btn = s.answered ? '<button type="button" class="pe-letans" data-un="1">Αναίρεση</button>' : '<button type="button" class="pe-letans">Ήρθε απάντηση</button>';
    return {cls: s.state, html: '<span class="pe-letst">' + st + '</span>' + btn, n: s.lastN, answered: s.answered};
  }

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
      <label class="addr">Διεύθυνση εταιρείας (προαιρετικά, για την Επιστολή 2)</label><input name="address" class="addr">
      <label>Επαρχία (για τις υπογραφές)</label><select name="district">${Object.keys(GEN).map((k) => `<option>${k}</option>`).join('')}</select>
      <label>Ημερομηνία</label><input name="date">
      <label class="pe-deok" style="display:flex;gap:8px;align-items:center;font-weight:600;margin-top:12px"><input type="checkbox" name="deok" style="width:auto"> Προσθήκη ΔΕΟΚ στις υπογραφές (3 υπογραφές: ΠΕΟ – ΣΕΚ – ΔΕΟΚ)</label>
      <div class="pe-letnote">Θα δημιουργηθεί PDF για εκτύπωση και υπογραφή. Η έκδοση καταγράφεται στο αρχείο (ποια επιστολή, για ποιο έργο, πότε, από ποιον).</div>
      <div class="pe-letact"><button type="button" class="cancel">Άκυρο</button><button type="button" class="go">Δημιουργία PDF</button></div></div>`;
    const q = (s) => ov.querySelector(s);
    q('.sub').textContent = r.title.slice(0, 160) + (prev.length ? ' — ήδη: ' + prev.map((e) => 'Επ.' + e.n + ' ' + e.d).join(', ') : '');
    q('[name=project]').value = r.title; q('[name=contractor]').value = eo; q('[name=authority]').value = r.authority;
    q('[name=district]').value = GEN[r.district] ? r.district : 'Λευκωσία'; q('[name=date]').value = today(); try { q('[name=deok]').checked = localStorage.getItem('pe_deok') === '1'; } catch (e) {}
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    q('.cancel').onclick = () => ov.remove();
    q('.go').onclick = async () => {
      const btn = q('.go'); btn.disabled = true; btn.textContent = 'Δημιουργία…';
      const n = +ov.querySelector('[name=pe-n]:checked').value;
      const d = {project: q('[name=project]').value.trim(), contractor: q('[name=contractor]').value.trim(), authority: q('[name=authority]').value.trim(), address: q('[name=address]').value.trim(), district: q('[name=district]').value, date: q('[name=date]').value.trim(), deok: q('[name=deok]').checked};
      try { localStorage.setItem('pe_deok', d.deok ? '1' : '0'); } catch (e) {}
      try {
        const {bytes, label} = await makeLetter(n, d);
        const name = 'Epistoli_' + n + '_' + r.id + '_' + d.date.replace(/\//g, '-') + '.pdf';
        const file = new File([bytes], name, {type: 'application/pdf'});
        let dl = null;
        try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
        if (dl) {
          try { await dl.save({filename: name, data: new Blob([bytes], {type: 'application/pdf'})}); }
          catch (e) { if (e && e.code === 'declined') { btn.disabled = false; btn.textContent = 'Δημιουργία PDF'; return; } throw e; }
        } else if (navigator.canShare && navigator.canShare({files: [file]}) && /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent)) {
          try { await navigator.share({files: [file], title: 'Επιστολή ' + n}); } catch (e) { if (e.name !== 'AbortError') throw e; }
        } else {
          const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = name; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(a.href), 60000);
        }
        const h = getH(); (h[r.id] = h[r.id] || []).push({n, d: d.date, u: (window.peLogCfg && window.peLogCfg.user) || '', t: Date.now()}); setH(h);
        if (window.peLog) window.peLog('Επιστολή ' + n, 'Προς: ' + label + ' · Έργο: ' + d.project.slice(0, 160) + ' · Ανάδοχος: ' + d.contractor + ' · Αρχή: ' + d.authority + ' · Επαρχία: ' + d.district + ' · Υπογραφές: ' + (d.deok ? 'ΠΕΟ, ΣΕΚ, ΔΕΟΚ' : 'ΠΕΟ, ΣΕΚ') + ' · Ημ/νία επιστολής: ' + d.date + ' · CFT ' + r.id);
        ov.remove(); decorate(); try { document.dispatchEvent(new Event('pe-letters')); } catch (e) {}
      } catch (e) { alert('Δεν ήταν δυνατή η δημιουργία της επιστολής. ' + (e && e.message ? e.message : '')); btn.disabled = false; btn.textContent = 'Δημιουργία PDF'; }
    };
    const sync = () => { const n = ov.querySelector('[name=pe-n]:checked').value; ov.querySelectorAll('.addr').forEach((x) => { x.style.display = n === '2' ? '' : 'none'; }); };
    ov.querySelectorAll('[name=pe-n]').forEach((x) => x.addEventListener('change', sync)); sync();
    document.body.appendChild(ov);
  }

  function decorate() {
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
        }
      } else if (hs) hs.remove();
    });
  }
  window.peLetters = {hist, status, setAns, rowById, allRows, openForm, ids: () => Array.from(new Set(Object.keys(REMOTE).concat(Object.keys(getH())))), desc: DESC};
  setTimeout(loadRemote, 1500);
  let pend = false;
  new MutationObserver(() => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; decorate(); }); }).observe(document.documentElement, {childList: true, subtree: true});
})();
