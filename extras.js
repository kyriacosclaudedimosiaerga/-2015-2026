// Πρόσθετα: αγαπημένα έργα, νέα έργα από την τελευταία επίσκεψη, καρτέλα αναδόχου, λίστα επιστολών με υπενθύμιση 30 ημερών.
(function () {
  const LS = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  const eur0 = new Intl.NumberFormat('el-GR', {style: 'currency', currency: 'EUR', maximumFractionDigits: 0});
  const eurC = new Intl.NumberFormat('el-GR', {style: 'currency', currency: 'EUR', notation: 'compact', maximumFractionDigits: 1});
  const int = new Intl.NumberFormat('el-GR');
  const dl = (d) => (!d ? '—' : d.slice(8, 10) + '/' + d.slice(5, 7) + '/' + d.slice(0, 4));
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;'}[c]));
  const log = (e, d) => { try { window.peLog && window.peLog(e, d); } catch (x) {} };
  const L = () => window.peLetters;
  const rows = () => { try { return L() ? L().allRows() : (window.__ROWS__ || []); } catch (e) { return []; } };
  const byId = (id) => (L() ? L().rowById(id) : null);
  const splitOf = (r) => { try { return JSON.parse(r.contractor_split); } catch (e) { return [[r.contractors, r.awarded_value]]; } };
  const today = () => { const d = new Date(); return String(d.getDate()).padStart(2, '0') + '/' + String(d.getMonth() + 1).padStart(2, '0') + '/' + d.getFullYear(); };
  const parseD = (s) => { const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(s || ''); return m ? new Date(+m[3], +m[2] - 1, +m[1]) : null; };
  const daysSince = (s) => { const d = parseD(s); return d ? Math.floor((Date.now() - d.getTime()) / 864e5) : null; };
  const redraw = () => { try { const p = window.dash.params(); if (p.fav) { window.dash.setParams({fav: null}); window.dash.setParams({fav: 1}); } } catch (e) {} };

  const css = document.createElement('style');
  css.textContent = `
.pe-favbtn{font:inherit;font-size:12px;padding:3px 9px;border-radius:12px;border:1px solid #c9a227;background:#fff;color:#8a6d00;cursor:pointer}
.pe-favbtn.on{background:#fff6d6;font-weight:600}
.pe-newtag{display:inline-block;font-size:11px;font-weight:700;color:#fff;background:#2e7d32;border-radius:9px;padding:1px 7px;margin-right:6px;vertical-align:2px}
.pe-eocard{font:inherit;font-size:12px;line-height:1;margin-left:6px;padding:2px 6px;border-radius:9px;border:1px solid #1f4e79;background:#fff;color:#1f4e79;cursor:pointer;vertical-align:1px}
.pe-xchips{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin:4px 0 10px}
.pe-xchip{font:inherit;font-size:13px;padding:5px 12px;border-radius:16px;border:1px solid #b9c6d3;background:#fff;color:#1b2733;cursor:pointer}
.pe-xchip.on{background:#1f4e79;border-color:#1f4e79;color:#fff}
.pe-xchip[disabled]{opacity:.5;cursor:default}
.pe-xlink{font:inherit;font-size:12.5px;background:none;border:0;color:#1f4e79;text-decoration:underline;cursor:pointer;padding:0}
.pe-letlist{font:inherit;font-size:14px;margin-left:6px;padding:7px 12px;border-radius:8px;border:1px solid #1f4e79;background:#fff;color:#1f4e79;cursor:pointer}
.pe-letlist .due{display:inline-block;margin-left:6px;background:#b3261e;color:#fff;border-radius:9px;padding:0 7px;font-size:12px;font-weight:700}
.pe-letov .pe-xbox{max-width:820px}
.pe-xbox table{width:100%;border-collapse:collapse;font-size:13px;margin-top:6px}
.pe-xbox th,.pe-xbox td{text-align:left;padding:6px 6px;border-bottom:1px solid #e3e9ef;vertical-align:top}
.pe-xbox th{font-size:12px;color:#5b6b7b;font-weight:600}
.pe-xbox td.n{text-align:right;white-space:nowrap}
.pe-xbox a{color:#1f4e79}
.pe-xkpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:8px;margin:10px 0}
.pe-xkpis div{background:#f3f6fa;border-radius:10px;padding:8px 10px;border-top:3px solid #1f4e79}
.pe-xkpis span{display:block;font-size:11.5px;color:#5b6b7b}.pe-xkpis b{font-size:17px;color:#143a5c}
.pe-xbar{display:flex;align-items:center;gap:8px;font-size:12.5px;margin:3px 0}
.pe-xbar i{display:block;height:10px;background:#1f4e79;border-radius:3px;min-width:2px}
.pe-xbar em{font-style:normal;color:#5b6b7b;white-space:nowrap}
.pe-xbar b{font-weight:500;min-width:84px}
.pe-xsec{margin-top:12px;font-weight:700;color:#143a5c;font-size:13.5px}
.pe-st-due{color:#b3261e;font-weight:700}.pe-st-ok{color:#1e6b34;font-weight:600}.pe-st-wait{color:#8a6d00}
.pe-xtools{display:flex;gap:8px;flex-wrap:wrap;align-items:center;margin:6px 0}
.pe-xtools select{width:auto}
.pe-xsmall{font:inherit;font-size:12px;padding:3px 8px;border-radius:8px;border:1px solid #1f4e79;background:#fff;color:#1f4e79;cursor:pointer;margin:2px 4px 2px 0}
@media (max-width:620px){.pe-xbox .hn{display:none}}
@media (prefers-color-scheme: dark){.pe-favbtn,.pe-eocard,.pe-xchip,.pe-letlist{background:transparent}.pe-xchip{color:inherit}}`;
  document.head.appendChild(css);

  function modal(title, sub) {
    const ov = document.createElement('div'); ov.className = 'pe-letov';
    ov.innerHTML = `<div class="pe-letbox pe-xbox" role="dialog"><h3></h3><div class="sub"></div><div class="body"></div><div class="pe-letact"><button type="button" class="cancel">Κλείσιμο</button></div></div>`;
    ov.querySelector('h3').textContent = title; ov.querySelector('.sub').textContent = sub || '';
    ov.addEventListener('click', (e) => { if (e.target === ov) ov.remove(); });
    ov.querySelector('.cancel').onclick = () => ov.remove();
    document.body.appendChild(ov);
    return ov;
  }

  // ---------- 1. Αγαπημένα ----------
  let FAV = new Set((LS.get('pe_favs', []) || []).map(String));
  window.peFavSet = () => FAV;
  function toggleFav(id) {
    id = String(id);
    const r = byId(id);
    if (FAV.has(id)) { FAV.delete(id); log('Αφαίρεση από αγαπημένα', (r ? r.title.slice(0, 160) : '') + ' · CFT ' + id); }
    else { FAV.add(id); log('Προσθήκη στα αγαπημένα', (r ? r.title.slice(0, 160) : '') + ' · CFT ' + id); }
    LS.set('pe_favs', Array.from(FAV));
    decorate(); chips();
    try { if (window.dash.params().fav) redraw(); } catch (e) {}
  }

  // ---------- 5. Νέα έργα από την τελευταία «σημείωση ως διαβασμένα» ----------
  let NEW = new Set(), nInit = 0;
  window.peNewSet = () => NEW;
  function initNew() {
    const rs = rows(); if (!rs.length || rs.length === nInit) return;
    nInit = rs.length;
    const seen = LS.get('pe_seen', null);
    if (!Array.isArray(seen)) { LS.set('pe_seen', rs.map((r) => String(r.id))); LS.set('pe_seen_at', today()); NEW = new Set(); }
    else { const s = new Set(seen.map(String)); NEW = new Set(rs.map((r) => String(r.id)).filter((id) => !s.has(id))); }
    chips(); decorate();
  }
  function markSeen() {
    LS.set('pe_seen', rows().map((r) => String(r.id))); LS.set('pe_seen_at', today());
    NEW = new Set(); log('Νέα έργα: σημείωση ως διαβασμένα', '');
    try { if (window.dash.params().nw) window.dash.setParams({nw: null}); } catch (e) {}
    chips(); decorate();
  }

  // ---------- κουμπιά φίλτρων ----------
  function chips() {
    const fl = document.getElementById('filters'); if (!fl) return;
    let box = fl.querySelector('.pe-xchips');
    if (!box) {
      box = document.createElement('div'); box.className = 'pe-xchips';
      box.innerHTML = `<button type="button" class="pe-xchip fav"></button><button type="button" class="pe-xchip nw"></button><button type="button" class="pe-xlink seen">Σημείωση νέων ως διαβασμένα</button>`;
      const anchor = fl.querySelector('.pe-filters'); fl.insertBefore(box, anchor || null);
      box.querySelector('.fav').onclick = () => { const on = !!window.dash.params().fav; window.dash.setParams({fav: on ? null : 1}); log('Φίλτρο', 'Μόνο αγαπημένα: ' + (on ? 'όχι' : 'ναι')); setTimeout(chips, 50); };
      box.querySelector('.nw').onclick = () => { const on = !!window.dash.params().nw; window.dash.setParams({nw: on ? null : 1}); log('Φίλτρο', 'Μόνο νέα: ' + (on ? 'όχι' : 'ναι')); setTimeout(chips, 50); };
      box.querySelector('.seen').onclick = markSeen;
    }
    let p = {}; try { p = window.dash.params(); } catch (e) {}
    const f = box.querySelector('.fav'), n = box.querySelector('.nw'), s = box.querySelector('.seen');
    f.textContent = '★ Μόνο αγαπημένα (' + int.format(FAV.size) + ')'; f.classList.toggle('on', !!p.fav); f.disabled = !FAV.size && !p.fav;
    const since = LS.get('pe_seen_at', null);
    n.textContent = '🆕 Μόνο νέα (' + int.format(NEW.size) + ')'; n.classList.toggle('on', !!p.nw); n.disabled = !NEW.size && !p.nw;
    n.title = since ? 'Έργα που προστέθηκαν μετά τις ' + since : '';
    s.hidden = !NEW.size;
  }

  // ---------- 2. Καρτέλα αναδόχου ----------
  function contractorCard(name) {
    const rs = rows().filter((r) => splitOf(r).some((x) => x[0] === name));
    const share = (r) => { const x = splitOf(r).find((y) => y[0] === name); return x ? +x[1] || 0 : 0; };
    const tot = rs.reduce((a, r) => a + share(r), 0);
    const yrs = rs.map((r) => r.award_month.slice(0, 4)).sort();
    const grp = (f) => { const m = new Map(); rs.forEach((r) => { const k = f(r); const o = m.get(k) || {v: 0, n: 0}; o.v += share(r); o.n++; m.set(k, o); }); return m; };
    const bars = (m, sort) => { const arr = Array.from(m, ([k, o]) => ({k, ...o})); arr.sort(sort || ((a, b) => b.v - a.v)); const mx = Math.max(1, ...arr.map((d) => d.v)); return arr.map((d) => `<div class="pe-xbar"><b>${esc(d.k)}</b><i style="width:${Math.max(2, Math.round(180 * d.v / mx))}px"></i><em>${eurC.format(d.v)} · ${int.format(d.n)}</em></div>`).join(''); };
    const lets = []; rs.forEach((r) => { const h = L() ? L().hist(r.id) : []; h.forEach((e) => lets.push({r, ...e})); });
    const ov = modal('📇 ' + name, 'Καρτέλα αναδόχου · όλα τα έτη (2015–σήμερα), ανεξάρτητα από τα φίλτρα');
    const body = ov.querySelector('.body');
    body.innerHTML = `<div class="pe-xkpis"><div><span>Έργα</span><b>${int.format(rs.length)}</b></div><div><span>Συνολική αξία (μερίδιό του)</span><b>${eurC.format(tot)}</b></div><div><span>Μέση αξία</span><b>${rs.length ? eurC.format(tot / rs.length) : '—'}</b></div><div><span>Περίοδος</span><b>${yrs.length ? yrs[0] + (yrs[0] !== yrs[yrs.length - 1] ? '–' + yrs[yrs.length - 1] : '') : '—'}</b></div><div><span>Επιστολές</span><b>${int.format(lets.length)}</b></div></div>
      <div class="pe-xtools"><button type="button" class="pe-xsmall flt">Φίλτρο σε αυτόν τον ανάδοχο</button></div>
      <div class="pe-xsec">Ανά έτος</div>${bars(grp((r) => r.award_month.slice(0, 4)), (a, b) => a.k.localeCompare(b.k))}
      <div class="pe-xsec">Ανά επαρχία</div>${bars(grp((r) => r.district || 'Δεν προσδιορίζεται'))}
      <div class="pe-xsec">Κυριότερες Αναθέτουσες Αρχές</div>${bars(new Map(Array.from(grp((r) => r.authority)).sort((a, b) => b[1].v - a[1].v).slice(0, 5)))}
      ${lets.length ? `<div class="pe-xsec">Επιστολές που στάλθηκαν</div><table><tr><th>Ημ/νία</th><th>Επιστολή</th><th>Έργο</th></tr>${lets.sort((a, b) => (parseD(b.d) || 0) - (parseD(a.d) || 0)).map((e) => `<tr><td>${esc(e.d)}</td><td>Επ. ${e.n}</td><td>${esc(e.r.title.slice(0, 120))}</td></tr>`).join('')}</table>` : ''}
      <div class="pe-xsec">Έργα (${int.format(rs.length)})</div>
      <table><tr><th>Ανάθεση</th><th>Έργο</th><th class="hn">Αρχή</th><th class="n">Αξία</th></tr>${rs.slice().sort((a, b) => String(b.awarded).localeCompare(String(a.awarded))).slice(0, 200).map((r) => `<tr><td>${dl(r.awarded)}</td><td><a href="${esc(r.link)}" target="_blank" rel="noopener">${esc(r.title)}</a>${FAV.has(String(r.id)) ? ' ★' : ''}${r.district ? '<br><small>' + esc(r.district) + '</small>' : ''}</td><td class="hn">${esc(r.authority)}</td><td class="n">${eur0.format(share(r))}</td></tr>`).join('')}</table>
      ${rs.length > 200 ? '<p class="pe-letnote">Φαίνονται τα 200 πιο πρόσφατα.</p>' : ''}`;
    body.querySelector('.flt').onclick = () => { window.dash.setParams({eo: name}); ov.remove(); };
    log('Καρτέλα αναδόχου', name);
  }

  // ---------- 3. Λίστα επιστολών, υπενθύμιση 30 ημερών ----------
  const ANS = () => LS.get('pe_letans', {}) || {};
  function letterState() {
    const out = [];
    if (!L()) return out;
    L().ids().forEach((id) => {
      const h = L().hist(id); if (!h.length) return;
      const r = byId(id);
      const last = h.slice().sort((a, b) => (parseD(a.d) || 0) - (parseD(b.d) || 0) || a.n - b.n).pop();
      const a = ANS()[id];
      const answered = a && a.n >= last.n;
      const days = daysSince(last.d);
      const due = !answered && days != null && days >= 30 && last.n < 4;
      out.push({id, r, h, last, answered, ans: a, days, due});
    });
    return out.sort((x, y) => (y.due - x.due) || ((parseD(y.last.d) || 0) - (parseD(x.last.d) || 0)));
  }
  function letterButton() {
    const row = document.querySelector('.pe-pdfrow'); if (!row) return;
    let b = row.querySelector('.pe-letlist');
    if (!b) { b = document.createElement('button'); b.type = 'button'; b.className = 'pe-letlist'; b.onclick = letterList; row.appendChild(b); }
    const st = letterState(), due = st.filter((s) => s.due).length;
    const html = '✉️ Επιστολές που στάλθηκαν (' + int.format(st.length) + ')' + (due ? '<span class="due" title="Χωρίς απάντηση πάνω από 30 μέρες">⏰ ' + due + '</span>' : '');
    if (b.dataset.h !== html) { b.dataset.h = html; b.innerHTML = html; }
  }
  function letterList() {
    const ov = modal('✉️ Επιστολές που στάλθηκαν', 'Ανά έργο, με την τελευταία επιστολή. Όταν περάσουν 30 μέρες χωρίς σημείωση απάντησης, το έργο φαίνεται με ⏰ και προτείνεται η επόμενη επιστολή.');
    const body = ov.querySelector('.body');
    const draw = () => {
      const st = letterState();
      const sel = body.querySelector('select') ? body.querySelector('select').value : 'all';
      const list = st.filter((s) => sel === 'all' || (sel === 'due' && s.due) || (sel === 'open' && !s.answered) || (sel === 'ans' && s.answered));
      body.innerHTML = `<div class="pe-xtools"><select><option value="all">Όλα (${st.length})</option><option value="due">⏰ Πάνω από 30 μέρες χωρίς απάντηση (${st.filter((s) => s.due).length})</option><option value="open">Χωρίς απάντηση (${st.filter((s) => !s.answered).length})</option><option value="ans">Με απάντηση (${st.filter((s) => s.answered).length})</option></select></div>
        ${list.length ? `<table><tr><th>Έργο</th><th>Επιστολές</th><th>Κατάσταση</th></tr>${list.map((s) => {
          const r = s.r || {};
          const status = s.answered ? `<span class="pe-st-ok">✔ Απάντηση ${esc(s.ans.d)}</span>` : s.due ? `<span class="pe-st-due">⏰ ${s.days} μέρες χωρίς απάντηση</span>` : `<span class="pe-st-wait">Αναμονή · ${s.days == null ? '—' : s.days + ' μέρες'}</span>`;
          const acts = (s.answered ? `<button type="button" class="pe-xsmall unans" data-id="${esc(s.id)}">Αναίρεση απάντησης</button>` : `<button type="button" class="pe-xsmall ans" data-id="${esc(s.id)}">Ήρθε απάντηση</button>`) + (s.last.n < 4 && s.r ? `<button type="button" class="pe-xsmall next" data-id="${esc(s.id)}">Επιστολή ${s.last.n + 1}</button>` : '');
          return `<tr><td>${r.link ? `<a href="${esc(r.link)}" target="_blank" rel="noopener">${esc((r.title || '').slice(0, 140))}</a>` : 'CFT ' + esc(s.id)}<br><small>${esc([r.contractors, r.district].filter(Boolean).join(' · '))}</small></td><td>${s.h.map((e) => `Επ. ${e.n} — ${esc(e.d)}${e.u ? ' (' + esc(e.u.split('@')[0]) + ')' : ''}`).join('<br>')}</td><td>${status}<br>${acts}</td></tr>`;
        }).join('')}</table>` : '<p class="pe-letnote">Δεν υπάρχουν επιστολές σε αυτή την κατηγορία.</p>'}`;
      const s0 = body.querySelector('select'); s0.value = sel; s0.onchange = draw;
      body.querySelectorAll('.ans').forEach((b) => b.onclick = () => { const s = st.find((x) => x.id === b.dataset.id); const a = ANS(); a[s.id] = {n: s.last.n, d: today()}; LS.set('pe_letans', a); log('Απάντηση σε επιστολή', 'Επ. ' + s.last.n + ' · ' + ((s.r && s.r.title) || '').slice(0, 160) + ' · CFT ' + s.id); draw(); refresh(); });
      body.querySelectorAll('.unans').forEach((b) => b.onclick = () => { const a = ANS(); delete a[b.dataset.id]; LS.set('pe_letans', a); draw(); refresh(); });
      body.querySelectorAll('.next').forEach((b) => b.onclick = () => { const r = byId(b.dataset.id); if (r) { ov.remove(); L().openForm(r); } });
    };
    draw();
    log('Λίστα επιστολών', '');
  }

  // ---------- διακόσμηση γραμμών πίνακα ----------
  function decorate() {
    document.querySelectorAll('tr[data-key]').forEach((tr) => {
      const id = String(tr.dataset.key);
      const tc = tr.querySelector('td.title'); if (!tc) return;
      const lb = tc.querySelector('.pe-letbtn');
      if (lb) {
        let fb = tc.querySelector('.pe-favbtn');
        if (!fb) { fb = document.createElement('button'); fb.type = 'button'; fb.className = 'pe-favbtn'; fb.onclick = (e) => { e.preventDefault(); toggleFav(id); }; lb.after(fb); }
        const on = FAV.has(id), t = on ? '★ Αγαπημένο' : '☆ Αγαπημένο';
        if (fb.textContent !== t) { fb.textContent = t; fb.classList.toggle('on', on); }
      }
      let nt = tc.querySelector('.pe-newtag');
      if (NEW.has(id)) { if (!nt) { nt = document.createElement('span'); nt.className = 'pe-newtag'; nt.textContent = 'Νέο'; tc.insertBefore(nt, tc.firstChild); } }
      else if (nt) nt.remove();
      const ec = tr.children[3];
      if (ec && !ec.querySelector('.pe-eocard') && ec.textContent.trim()) {
        const r = byId(id); if (!r) return;
        const names = splitOf(r).map((x) => x[0]).filter(Boolean);
        const b = document.createElement('button'); b.type = 'button'; b.className = 'pe-eocard'; b.textContent = '📇'; b.title = 'Καρτέλα αναδόχου';
        b.onclick = (e) => {
          e.preventDefault(); e.stopPropagation();
          if (names.length <= 1) return contractorCard(names[0] || r.contractors);
          const ov = modal('Επιλέξτε ανάδοχο', r.title.slice(0, 140));
          const body = ov.querySelector('.body');
          names.forEach((n) => { const x = document.createElement('button'); x.type = 'button'; x.className = 'pe-xsmall'; x.textContent = n; x.onclick = () => { ov.remove(); contractorCard(n); }; body.appendChild(x); });
        };
        ec.appendChild(b);
      }
    });
  }
  function refresh() { decorate(); chips(); letterButton(); }

  // ---------- εκκίνηση ----------
  let pend = false;
  new MutationObserver(() => { if (pend) return; pend = true; requestAnimationFrame(() => { pend = false; initNew(); decorate(); letterButton(); }); }).observe(document.documentElement, {childList: true, subtree: true});
  document.addEventListener('pe-letters', refresh);
  const boot = setInterval(() => { if (!window.dash) return; chips(); letterButton(); initNew(); if (nInit) clearInterval(boot); }, 700);
  try { window.dash.onData && window.dash.onData(() => setTimeout(chips, 30)); } catch (e) {}
  document.addEventListener('click', () => setTimeout(chips, 80));
})();
