// Αποστολή των φιλτραρισμένων έργων ως PDF με email (χωρίς server).
// Φτιάχνει PDF μέσα στον browser με ενσωματωμένη γραμματοσειρά (ελληνικά) και
// το μοιράζεται μέσω της εφαρμογής email του κινητού (Web Share) ή το κατεβάζει.
(function () {
  const W = 842, H = 595, M = 30; // A4 οριζόντιο, σε points
  const eur = new Intl.NumberFormat('el-GR', {maximumFractionDigits: 0});
  const intf = new Intl.NumberFormat('el-GR');
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

  // --- μέτρηση και κωδικοποίηση κειμένου ---
  function glyphs(font, s) {
    const out = [];
    for (const ch of String(s)) {
      const cp = ch.codePointAt(0);
      let g = font.map.c[cp];
      if (g === undefined) g = font.map.c[63]; // '?'
      font.used.set(g, cp);
      out.push(g);
    }
    return out;
  }
  const width = (font, s, size) => glyphs(font, s).reduce((a, g) => a + (font.map.w[g] || 500), 0) * size / 1000;
  const hex = (gs) => gs.map((g) => g.toString(16).padStart(4, '0')).join('');

  function wrap(font, s, size, maxW, maxLines) {
    const words = String(s || '').replace(/\s+/g, ' ').trim().split(' ');
    const lines = [];
    let cur = '';
    for (const w of words) {
      const t = cur ? cur + ' ' + w : w;
      if (width(font, t, size) <= maxW) { cur = t; continue; }
      if (cur) lines.push(cur);
      cur = w;
      while (width(font, cur, size) > maxW) { // πολύ μεγάλη λέξη
        let k = cur.length - 1;
        while (k > 1 && width(font, cur.slice(0, k), size) > maxW) k--;
        lines.push(cur.slice(0, k)); cur = cur.slice(k);
      }
    }
    if (cur) lines.push(cur);
    if (lines.length > maxLines) {
      const keep = lines.slice(0, maxLines);
      let last = keep[maxLines - 1] + '…';
      while (width(font, last, size) > maxW && last.length > 2) last = last.slice(0, -2) + '…';
      keep[maxLines - 1] = last;
      return keep;
    }
    return lines.length ? lines : [''];
  }

  // --- σχεδίαση σελίδων ---
  function Page() { this.ops = []; }
  Page.prototype.text = function (font, key, s, size, x, y, rgb) {
    const c = rgb || [0.1, 0.1, 0.1];
    this.ops.push(`BT ${c[0]} ${c[1]} ${c[2]} rg /${key} ${size} Tf ${x.toFixed(2)} ${(H - y).toFixed(2)} Td <${hex(glyphs(font, s))}> Tj ET`);
  };
  Page.prototype.rect = function (x, y, w, h, rgb) {
    this.ops.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} rg ${x.toFixed(2)} ${(H - y - h).toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`);
  };
  Page.prototype.line = function (x1, y1, x2, y2, rgb, lw) {
    this.ops.push(`${rgb[0]} ${rgb[1]} ${rgb[2]} RG ${lw || 0.5} w ${x1} ${H - y1} m ${x2} ${H - y2} l S`);
  };

  const LABELS = {ay: 'Έτη', q: 'Αναζήτηση', aa: 'Αναθέτουσα Αρχή', aat: 'Τύπος Αναθέτουσας Αρχής', dist: 'Επαρχία', cat: 'Κατηγορία', eo: 'Ανάδοχος', proc: 'Διαδικασία', thr: 'Όριο ΕΕ', eu: 'Χρηματοδότηση ΕΕ', py: 'Έτος δημοσίευσης'};
  function filterText(p) {
    const parts = [];
    for (const k of Object.keys(LABELS)) if (p[k]) parts.push(LABELS[k] + ': ' + String(p[k]).replace(/,/g, ', '));
    if (p.m1 || p.m2) parts.push('Μήνες: ' + (p.m1 || '…') + ' έως ' + (p.m2 || '…'));
    if (p.vmin != null || p.vmax != null) parts.push('Αξία: ' + (p.vmin != null ? '€' + eur.format(p.vmin) : '…') + ' – ' + (p.vmax != null ? '€' + eur.format(p.vmax) : '…'));
    if (p.hidesus) parts.push('Χωρίς τις εγγραφές με πιθανό λάθος');
    return parts.length ? parts.join(' · ') : 'Κανένα φίλτρο (όλα τα έργα)';
  }

  function build(rows, params, F) {
    const R = F.r, B = F.b;
    const pages = [];
    const cols = [
      {t: 'Ημ/νία', w: 52, f: (r) => r.awarded ? r.awarded.slice(8, 10) + '/' + r.awarded.slice(5, 7) + '/' + r.awarded.slice(0, 4) : '—'},
      {t: 'Τίτλος έργου', w: 262, f: (r) => r.title},
      {t: 'Αναθέτουσα Αρχή', w: 128, f: (r) => r.authority},
      {t: 'Ανάδοχος/οι', w: 128, f: (r) => r.contractors},
      {t: 'Επαρχία', w: 64, f: (r) => r.district || 'Δεν προσδιορίζεται'},
      {t: 'Ανατεθείσα (€)', w: 148, f: (r) => '€' + eur.format(r.awarded_value) + (r.suspect ? ' ⚠' : '') + (r.corrected_from != null ? ' ✎' : ''), right: true},
    ];
    const FS = 7.2, LH = 8.6, PAD = 3;
    const total = rows.reduce((a, r) => a + r.awarded_value, 0);
    const totalOk = rows.filter((r) => !r.suspect).reduce((a, r) => a + r.awarded_value, 0);
    const now = new Date();
    let pg, y;
    const header = (first) => {
      pg = new Page(); pages.push(pg); y = M;
      if (first) {
        pg.rect(0, 0, W, 6, [0.12, 0.31, 0.47]);
        pg.text(B, 'F2', 'Δημόσια Έργα — αναθέσεις στο eProcurement', 16, M, y + 16); y += 26;
        pg.text(R, 'F1', 'Ημερομηνία εξαγωγής: ' + now.toLocaleDateString('el-GR') + ' · Πηγή: eProcurement › Στατιστικά', 8, M, y); y += 13;
        for (const l of wrap(R, 'Φίλτρα: ' + filterText(params), 8.5, W - 2 * M, 3)) { pg.text(R, 'F1', l, 8.5, M, y); y += 11; }
        y += 4;
        const kp = [['Διαγωνισμοί', intf.format(rows.length)], ['Ανατεθείσα αξία', '€' + eur.format(total)], ['Χωρίς τις ⚠ πιθανά λάθη', '€' + eur.format(totalOk)]];
        let x = M;
        for (const [k, v] of kp) {
          pg.rect(x, y, 200, 34, [0.93, 0.95, 0.97]);
          pg.text(R, 'F1', k, 7.5, x + 8, y + 12, [0.4, 0.4, 0.4]);
          pg.text(B, 'F2', v, 13, x + 8, y + 28);
          x += 210;
        }
        y += 46;
      } else {
        pg.text(B, 'F2', 'Δημόσια Έργα — συνέχεια', 10, M, y + 8); y += 18;
      }
      // επικεφαλίδα πίνακα
      pg.rect(M, y, W - 2 * M, 14, [0.12, 0.31, 0.47]);
      let x = M;
      for (const c of cols) {
        const tw = width(B, c.t, 7.5);
        pg.text(B, 'F2', c.t, 7.5, c.right ? x + c.w - PAD - tw : x + PAD, y + 10, [1, 1, 1]);
        x += c.w;
      }
      y += 14;
    };
    header(true);
    let zebra = false;
    for (const r of rows) {
      const cells = cols.map((c) => wrap(R, c.f(r), FS, c.w - 2 * PAD, c.right ? 2 : 3));
      const n = Math.max(...cells.map((l) => l.length));
      const h = n * LH + 2 * PAD - 1;
      if (y + h > H - M - 14) header(false);
      if (r.suspect) pg.rect(M, y, W - 2 * M, h, [0.99, 0.91, 0.91]);
      else if (zebra) pg.rect(M, y, W - 2 * M, h, [0.975, 0.975, 0.97]);
      zebra = !zebra;
      let x = M;
      const col = r.suspect ? [0.7, 0.1, 0.1] : [0.1, 0.1, 0.1];
      cols.forEach((c, i) => {
        cells[i].forEach((l, j) => {
          const tw = c.right ? width(R, l, FS) : 0;
          pg.text(R, 'F1', l, FS, c.right ? x + c.w - PAD - tw : x + PAD, y + PAD + 6 + j * LH, col);
        });
        x += c.w;
      });
      y += h;
      pg.line(M, y, W - M, y, [0.85, 0.85, 0.85], 0.3);
    }
    y += 12;
    if (y > H - M - 30) { header(false); }
    pg.text(R, 'F1', '⚠ = πιθανό λάθος αξίας στο eProcurement (ανατεθείσα > 20× εκτιμώμενη) · ✎ = διορθωμένη αξία · Η επαρχία προκύπτει από τον τίτλο/την Αναθέτουσα Αρχή.', 7, M, y, [0.4, 0.4, 0.4]);
    // υποσέλιδο
    pages.forEach((p, i) => {
      const t = 'σελ. ' + (i + 1) + ' / ' + pages.length;
      p.text(R, 'F1', t, 7, W - M - width(R, t, 7), H - 14, [0.5, 0.5, 0.5]);
      p.text(R, 'F1', 'Δημόσια Έργα — eProcurement', 7, M, H - 14, [0.5, 0.5, 0.5]);
    });
    return pages;
  }

  // --- σύνθεση αρχείου PDF ---
  async function deflate(bytes) {
    if (typeof CompressionStream === 'undefined') return null;
    const s = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    return new Uint8Array(await new Response(s).arrayBuffer());
  }
  async function writePdf(pages, F) {
    const enc = new TextEncoder();
    const parts = []; const offs = []; let len = 0;
    const push = (b) => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length; };
    const objs = []; // [content string or {dict, stream}]
    const add = (o) => { objs.push(o); return objs.length; };
    const stream = async (dict, data) => {
      const z = await deflate(data);
      return z ? {dict: dict + ` /Filter /FlateDecode /Length ${z.length}`, data: z} : {dict: dict + ` /Length ${data.length}`, data};
    };
    const fontObj = async (font, key) => {
      const used = [...font.used.entries()].sort((a, b) => a[0] - b[0]);
      const ff = add(await stream(`<< /Length1 ${font.ttf.length}`, font.ttf));
      // το ">>" του λεξικού κλείνει παρακάτω
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
    const f1 = await fontObj(F.r, 'F1');
    const f2 = await fontObj(F.b, 'F2');
    const pagesId = objs.length + 1; objs.push(null); // κράτηση
    const kids = [];
    for (const p of pages) {
      const c = add(await stream('<<', enc.encode(p.ops.join('\n'))));
      kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 ${f1} 0 R /F2 ${f2} 0 R >> >> /Contents ${c} 0 R >>`));
    }
    objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    const cat = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    const info = add('<< /Producer (Dimosia Erga app) /Title <FEFF' + [...'Δημόσια Έργα'].map((c) => c.charCodeAt(0).toString(16).padStart(4, '0')).join('') + '> >>');
    push(new Uint8Array([37, 80, 68, 70, 45, 49, 46, 53, 10, 37, 226, 227, 207, 211, 10])); // %PDF-1.5 + δυαδική γραμμή
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

  async function makePdf() {
    const F = await loadFonts();
    F.r.used = new Map(); F.b.used = new Map();
    const rows = (window.peFiltered() || []).slice().sort((a, b) => (b.awarded || '').localeCompare(a.awarded || ''));
    const pages = build(rows, dash.params(), F);
    return {bytes: await writePdf(pages, F), rows};
  }
  window.peMakePdf = makePdf;

  async function sendPdf(btn) {
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Δημιουργία PDF…';
    try {
      const {bytes, rows} = await makePdf();
      const d = new Date();
      const name = 'Dimosia_Erga_' + d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') + '.pdf';
      const file = new File([bytes], name, {type: 'application/pdf'});
      const subject = 'Δημόσια Έργα — ' + intf.format(rows.length) + ' διαγωνισμοί';
      const body = 'Σας επισυνάπτω PDF με τα δημόσια έργα (eProcurement).\nΦίλτρα: ' + filterText(dash.params());
      let dl = null;
      try { dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
      if (dl) {
        try { await dl.save({filename: name, data: new Blob([bytes], {type: 'application/pdf'})}); }
        catch (e) { if (e && e.code === 'declined') { btn.disabled = false; btn.textContent = label; return; } throw new Error(e && e.message ? e.message : 'Η λήψη δεν επιτράπηκε.'); }
        if (confirm('Το PDF «' + name + '» αποθηκεύτηκε.\n\nΝα ανοίξει νέο email για να το επισυνάψετε;')) {
          const a = document.createElement('a'); a.href = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body + '\n\n(Επισυνάψτε το αρχείο ' + name + ')'); a.target = '_blank'; a.rel = 'noopener'; document.body.appendChild(a); a.click(); a.remove();
        }
      } else if (navigator.canShare && navigator.canShare({files: [file]})) {
        try { await navigator.share({files: [file], title: subject, text: body}); }
        catch (e) { if (e.name !== 'AbortError') throw e; }
      } else {
        const a = document.createElement('a');
        a.href = URL.createObjectURL(file); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(a.href), 60000);
        if (confirm('Το PDF «' + name + '» κατέβηκε στη συσκευή σας.\n\nΝα ανοίξει νέο email για να το επισυνάψετε;')) {
          location.href = 'mailto:?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body + '\n\n(Επισυνάψτε το αρχείο ' + name + ')');
        }
      }
    } catch (e) {
      alert('Δεν ήταν δυνατή η δημιουργία του PDF. ' + (e && e.message ? e.message : ''));
    }
    btn.disabled = false; btn.textContent = label;
  }
  window.peSendPdf = sendPdf;
  document.addEventListener('click', (e) => { const b = e.target.closest && e.target.closest('.pe-pdfbtn'); if (b && !b.disabled) window.peSendPdf(b); });
})();
