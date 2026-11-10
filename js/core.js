/*
 * ProctorCBT — core.js
 * Transport fetch ke GAS (text/plain, tanpa preflight CORS), dedupe baca + epoch tulis,
 * penggabung batch otomatis, SWR localStorage, pengukur Perf, warmup, polling adaptif,
 * komponen UI (toast, modal, drawer, konfirmasi), router hash, PWA.
 */
(function () {
  'use strict';
  const CFG = window.APP_CONFIG || {};
  const APP_VERSION = '1.0.0';

  // ---------------------------------------------------------------- penyimpanan lokal
  const LS = {
    get: function (k, d) { try { const v = localStorage.getItem('pcbt:' + k); return v == null ? (d === undefined ? null : d) : JSON.parse(v); } catch (e) { return d === undefined ? null : d; } },
    set: function (k, v) { try { localStorage.setItem('pcbt:' + k, JSON.stringify(v)); return true; } catch (e) { return false; } },
    del: function (k) { try { localStorage.removeItem('pcbt:' + k); } catch (e) { /* abaikan */ } },
    keys: function (prefix) { const out = []; try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k && k.indexOf('pcbt:' + prefix) === 0) out.push(k.slice(5)); } } catch (e) { /* abaikan */ } return out; }
  };
  function uuid() { return (crypto.randomUUID ? crypto.randomUUID() : 'x' + Date.now().toString(36) + Math.random().toString(36).slice(2)).replace(/-/g, '').slice(0, 24); }
  function deviceId() { let d = LS.get('dev'); if (!d) { d = 'DV' + uuid().toUpperCase(); LS.set('dev', d); } return d; }

  // ---------------------------------------------------------------- sesi
  const Sesi = {
    get data() { return LS.get('sesi'); },
    get token() { const d = LS.get('sesi'); return d && d.token; },
    get role() { const d = LS.get('sesi'); return d && d.me && d.me.role; },
    get uid() { const d = LS.get('sesi'); return d && d.me && d.me.id; },
    save: function (d) { LS.set('sesi', d); },
    patch: function (p) { const d = LS.get('sesi') || {}; Object.assign(d, p); LS.set('sesi', d); },
    clear: function () { LS.del('sesi'); LS.keys('c:').forEach(LS.del); }
  };

  // ---------------------------------------------------------------- pengukur kinerja
  const Perf = {
    rows: [],
    add: function (r) { this.rows.push(r); if (this.rows.length > 300) this.rows.shift(); },
    table: function () { console.table(this.rows.slice(-40)); },
    summary: function () {
      const g = {};
      this.rows.forEach(function (r) { const x = g[r.aksi] || (g[r.aksi] = { n: 0, total: 0, server: 0, cache: 0 }); x.n++; x.total += r.total; x.server += r.server || 0; if (r.cache) x.cache++; });
      const out = Object.keys(g).map(function (k) { const x = g[k]; return { aksi: k, panggilan: x.n, rataTotal_ms: Math.round(x.total / x.n), rataServer_ms: Math.round(x.server / x.n), cache: x.cache }; });
      console.table(out); return out;
    },
    avg: function () { const r = this.rows.slice(-20); return r.length ? Math.round(r.reduce(function (a, b) { return a + b.total; }, 0) / r.length) : 0; }
  };
  window.Perf = Perf;

  // ---------------------------------------------------------------- jam server
  let clockOffset = 0;
  function serverNow() { return Date.now() + clockOffset; }

  // ---------------------------------------------------------------- transport
  // Aksi baca (sama dengan read:true di backend) → boleh di-dedupe & digabung batch
  const READ = new Set(['pub.info', 'pub.verify', 'auth.me', 'boot', 'exam.result', 'dash.summary', 'mon.live', 'mapel.list', 'soal.list',
    'ujian.list', 'kelas.list', 'hasil.list', 'hasil.detail', 'koreksi.list', 'log.list', 'lap.stats', 'lap.rekap', 'users.list', 'set.get',
    'suara.list', 'sys.status', 'audit.list', 'notif.config', 'notif.queue', 'wa.device', 'wa.audience', 'wa.blastList', 'crm.list', 'crm.stats',
    'crm.detail', 'crm.export']);
  const BATCHABLE = new Set(Array.from(READ).filter(function (a) { return ['pub.info', 'pub.verify', 'exam.result', 'crm.export', 'wa.device'].indexOf(a) === -1; }));

  function configOk() { return !!(CFG.DEMO || (CFG.GAS_URL && /^https:\/\/script\.google\.com\/macros\/s\/[^/]+\/exec$/.test(CFG.GAS_URL) && !/GANTI|XXXX/.test(CFG.GAS_URL))); }

  async function transport(body, timeoutMs) {
    if (CFG.DEMO && window.DemoBackend) return window.DemoBackend.call(body);
    if (!configOk()) { const e = new Error('KONFIG'); throw e; }
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const tm = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 35000);
    try {
      const res = await fetch(CFG.GAS_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body), signal: ctrl ? ctrl.signal : undefined, redirect: 'follow' });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return await res.json();
    } finally { clearTimeout(tm); }
  }

  let writeEpoch = 0;
  const inflight = {};
  let onAuthLost = null;

  async function api(action, data, opts) {
    opts = opts || {};
    const isRead = READ.has(action);
    if (!isRead) writeEpoch++;
    const key = isRead ? writeEpoch + '|' + action + '|' + (Sesi.token || '').slice(-12) + '|' + JSON.stringify(data || {}) : null;
    if (key && inflight[key]) return inflight[key];
    const p = runApi(action, data, opts);
    if (key) { inflight[key] = p; p.then(function () { delete inflight[key]; }, function () { delete inflight[key]; }); }
    return p;
  }
  async function runApi(action, data, opts) {
    const t0 = performance.now(), sent = Date.now();
    let res;
    try { res = await transport({ action: action, token: opts.token || Sesi.token, data: data || {} }, opts.timeout); }
    catch (e) {
      res = e.message === 'KONFIG'
        ? { success: false, code: 'CONFIG', message: 'Konfigurasi belum lengkap: isi GAS_URL di js/config.js dengan URL /exec Apps Script.' }
        : { success: false, code: 'NET', message: navigator.onLine ? 'Server tidak merespons. Periksa koneksi lalu coba lagi.' : 'Tidak ada koneksi internet.' };
    }
    const total = Math.round(performance.now() - t0);
    if (res && res.st) { const rtt = Date.now() - sent; clockOffset = res.st - (Date.now() - rtt / 2) + 0; }
    Perf.add({ aksi: action, total: total, server: res && res.ms, net: res && res.ms ? total - res.ms : null, cache: !!(res && res.cached), ok: !!(res && res.success), t: new Date().toLocaleTimeString('id-ID') });
    if (res && res.code === 'AUTH' && !opts.noAuth && onAuthLost) onAuthLost(res.message);
    if (res && res.nq > 0) scheduleDrain();
    return res || { success: false, message: 'Respons kosong.' };
  }

  // ---- penggabung batch otomatis: banyak aksi baca di tik yang sama → 1 eksekusi GAS
  const Batcher = {
    q: null,
    add: function (action, data) {
      const self = this;
      return new Promise(function (resolve) {
        if (!self.q) { self.q = []; setTimeout(function () { self.flush(); }, 0); }
        self.q.push({ action: action, data: data || {}, resolve: resolve });
      });
    },
    flush: async function () {
      const q = this.q; this.q = null;
      if (!q || !q.length) return;
      const uniq = [], peta = {};
      q.forEach(function (it) { const k = it.action + '|' + JSON.stringify(it.data); if (!peta[k]) { peta[k] = []; uniq.push(it); } peta[k].push(it); });
      for (let i = 0; i < uniq.length; i += 10) {
        const grp = uniq.slice(i, i + 10);
        if (grp.length === 1) { const r = await api(grp[0].action, grp[0].data); peta[grp[0].action + '|' + JSON.stringify(grp[0].data)].forEach(function (x) { x.resolve(r); }); continue; }
        const r = await api('batch', { calls: grp.map(function (g) { return { action: g.action, data: g.data }; }) });
        grp.forEach(function (g, j) {
          const one = r.success ? r.data.results[j] : r;
          if (one && r.ms) one.ms = r.ms;
          peta[g.action + '|' + JSON.stringify(g.data)].forEach(function (x) { x.resolve(one); });
        });
      }
    }
  };
  READ.add('batch');
  function apiQ(action, data) { return BATCHABLE.has(action) ? Batcher.add(action, data) : api(action, data); }
  async function fetchMany(list) { return Promise.all(list.map(function (x) { return apiQ(x[0], x[1]); })); }

  // ---- antrean notifikasi: respons nq>0 → minta server mengirim (beberapa detik kemudian)
  let drainT = null, drainN = 0;
  function scheduleDrain() {
    clearTimeout(drainT);
    drainT = setTimeout(async function () {
      const r = await api('notif.drain', {}, { noAuth: true });
      if (r.success && r.data && r.data.left > 0 && drainN++ < 3) scheduleDrain(); else drainN = 0;
    }, 400);
  }

  // ---- warmup server dari browser (maks. 1×/4 menit per lingkup)
  function warmUpServer(scope) {
    if (CFG.DEMO || !configOk()) return;
    try {
      const k = 'pcbt:warm:' + scope, last = Number(sessionStorage.getItem(k) || 0);
      if (Date.now() - last < 240000) return;
      sessionStorage.setItem(k, String(Date.now()));
    } catch (e) { /* abaikan */ }
    fetch(CFG.GAS_URL + '?w=' + scope, { mode: 'no-cors' }).catch(function () {});
  }

  // ---------------------------------------------------------------- SWR (stale-while-revalidate)
  function hash(s) { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
  const SWR = {
    key: function (action, data) { return 'c:' + (Sesi.uid || 'pub') + ':' + action + ':' + JSON.stringify(data || {}); },
    peek: function (action, data) { const c = LS.get(this.key(action, data)); return c ? c.d : null; },
    /** Render dari cache lokal dulu (instan), ambil server bila basi; render ulang hanya bila data berubah. */
    load: async function (action, data, maxAgeMs, onData, opts) {
      opts = opts || {};
      const k = this.key(action, data), c = LS.get(k);
      if (c && !opts.noCache) onData(c.d, true);
      if (c && !opts.force && Date.now() - c.t < (maxAgeMs || 0)) return { success: true, data: c.d, cached: true };
      const r = await apiQ(action, data);
      if (r && r.success) {
        const h = hash(JSON.stringify(r.data));
        if (!c || c.h !== h || opts.noCache) onData(r.data, false);
        if (!LS.set(k, { t: Date.now(), h: h, d: r.data })) { this.trim(); }
      } else if (!c) onData(null, false, r);
      else if (r && r.code !== 'AUTH') toast(r.message || 'Gagal memuat data terbaru.', 'warn');
      return r;
    },
    invalidate: function (actions) {
      const pre = 'c:' + (Sesi.uid || 'pub') + ':';
      LS.keys(pre).forEach(function (k) { const a = k.slice(pre.length).split(':')[0]; if (!actions || actions.indexOf(a) > -1) LS.del(k); });
    },
    trim: function () { LS.keys('c:').slice(0, 20).forEach(LS.del); }
  };

  // ---------------------------------------------------------------- polling adaptif
  const Activity = {
    at: Date.now(), last: {},
    init: function () { const self = this; ['pointerdown', 'keydown', 'wheel', 'touchstart', 'focus'].forEach(function (ev) { addEventListener(ev, function () { self.at = Date.now(); }, { passive: true }); }); },
    idle: function () { return Date.now() - this.at > 120000; },
    due: function (key, activeMs, idleMs) {
      if (document.visibilityState !== 'visible') return false;
      if (Date.now() - (this.last[key] || 0) < (this.idle() ? idleMs : activeMs) - 500) return false;
      this.last[key] = Date.now(); return true;
    }
  };
  Activity.init();

  // ---------------------------------------------------------------- utilitas UI
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function ic(name, cls) { return '<span class="ms' + (cls ? ' ' + cls : '') + '" aria-hidden="true">' + name + '</span>'; }
  function el(html) { const t = document.createElement('template'); t.innerHTML = String(html).trim(); return t.content.firstElementChild; }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }
  function on(root, ev, sel, fn) { root.addEventListener(ev, function (e) { const t = e.target.closest(sel); if (t && root.contains(t)) fn(e, t); }); }
  const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'], BLN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  function wib(ms) { return new Date(Number(ms) + 7 * 3600e3); }
  function p2(n) { return (n < 10 ? '0' : '') + n; }
  function fmtJam(ms) { if (!ms) return '-'; const d = wib(ms); return p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()); }
  function fmtTgl(ms, jam) { if (!ms) return '-'; const d = wib(ms); return d.getUTCDate() + ' ' + BLN[d.getUTCMonth()] + ' ' + d.getUTCFullYear() + (jam === false ? '' : ' • ' + fmtJam(ms)); }
  function fmtHari(ms) { const d = wib(ms); return HARI[d.getUTCDay()] + ', ' + d.getUTCDate() + ' ' + BLN[d.getUTCMonth()]; }
  function fmtDur(sec) { sec = Math.max(0, Math.floor(sec)); return p2(Math.floor(sec / 3600)) + ':' + p2(Math.floor(sec % 3600 / 60)) + ':' + p2(sec % 60); }
  function fmtRelatif(ms) { const s = Math.round((serverNow() - ms) / 1000); if (s < 5) return 'baru saja'; if (s < 60) return s + ' dtk lalu'; if (s < 3600) return Math.round(s / 60) + ' mnt lalu'; if (s < 86400) return Math.round(s / 3600) + ' jam lalu'; return fmtTgl(ms, false); }
  function fmtNum(n, d) { if (n === null || n === undefined || n === '') return '-'; return Number(n).toLocaleString('id-ID', { maximumFractionDigits: d === undefined ? 2 : d }); }
  function toLocalInput(ms) { const d = wib(ms); return d.getUTCFullYear() + '-' + p2(d.getUTCMonth() + 1) + '-' + p2(d.getUTCDate()) + 'T' + p2(d.getUTCHours()) + ':' + p2(d.getUTCMinutes()); }
  function fromLocalInput(v) { return v ? new Date(v + ':00+07:00').getTime() : 0; }
  function avColor(s) { let h = 0; s = String(s || ''); for (let i = 0; i < s.length; i++) h = (h + s.charCodeAt(i)) % 5; return 'c' + (h + 1); }
  function inisial(n) { return String(n || '?').split(/\s+/).filter(Boolean).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); }
  function debounce(fn, ms) { let t; return function () { const a = arguments, self = this; clearTimeout(t); t = setTimeout(function () { fn.apply(self, a); }, ms); }; }
  function statusBadge(s) {
    const m = { 'Aktif': 'b-ok', 'Draft': 'b-mute', 'Selesai': 'b-info', 'Mengerjakan': 'b-ok', 'Login': 'b-mute', 'Menunggu Koreksi Essay': 'b-warn', 'Diskualifikasi': 'b-bad', 'Tidak Mengerjakan': 'b-mute', 'Nonaktif': 'b-mute' };
    return '<span class="badge ' + (m[s] || 'b-mute') + '">' + esc(s) + '</span>';
  }

  let toastBox = null;
  function toast(msg, type, ms) {
    if (!toastBox) { toastBox = el('<div class="toasts" role="status" aria-live="polite"></div>'); document.body.appendChild(toastBox); }
    const icon = type === 'err' ? 'error' : type === 'warn' ? 'warning' : 'check_circle';
    const t = el('<div class="toast ' + (type || '') + '">' + ic(icon) + '<span>' + esc(msg) + '</span></div>');
    toastBox.appendChild(t);
    setTimeout(function () { t.style.transition = 'opacity .3s'; t.style.opacity = '0'; setTimeout(function () { t.remove(); }, 300); }, ms || (type === 'err' ? 5200 : 3200));
  }

  /** modal({title, body (html|el), actions:[{label, cls, icon, onClick(close)}], size, onClose, dismiss}) */
  function modal(o) {
    const ov = el('<div class="ovl" role="dialog" aria-modal="true"><div class="modal ' + (o.size || '') + '">' +
      (o.title ? '<div class="modal-h"><h2>' + esc(o.title) + '</h2><button class="btn btn-ghost btn-icon btn-sm" data-x aria-label="Tutup">' + ic('close') + '</button></div>' : '') +
      '<div class="modal-b"></div>' + (o.actions && o.actions.length ? '<div class="modal-f"></div>' : '') + '</div></div>');
    const body = $('.modal-b', ov);
    if (typeof o.body === 'string') body.innerHTML = o.body; else if (o.body) body.appendChild(o.body);
    let closed = false;
    function close(v) { if (closed) return; closed = true; ov.remove(); document.removeEventListener('keydown', onKey); if (o.onClose) o.onClose(v); }
    function onKey(e) { if (e.key === 'Escape' && o.dismiss !== false) close(); }
    document.addEventListener('keydown', onKey);
    if (o.dismiss !== false) ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    const x = $('[data-x]', ov); if (x) x.onclick = function () { close(); };
    (o.actions || []).forEach(function (a) {
      const b = el('<button class="btn ' + (a.cls || 'btn-soft') + '">' + (a.icon ? ic(a.icon) : '') + '<span>' + esc(a.label) + '</span></button>');
      b.onclick = async function () {
        if (!a.onClick) return close(a.value);
        const lbl = b.innerHTML; b.disabled = true; b.innerHTML = '<span class="spin"></span><span>' + esc(a.busy || 'Memproses…') + '</span>';
        try { const r = await a.onClick(close, body); if (r === false) { b.disabled = false; b.innerHTML = lbl; } }
        catch (err) { toast(err.message, 'err'); b.disabled = false; b.innerHTML = lbl; }
        if (!closed) { b.disabled = false; b.innerHTML = lbl; }
      };
      $('.modal-f', ov).appendChild(b);
    });
    document.body.appendChild(ov);
    const f = $('input:not([type=hidden]),select,textarea', body); if (f && o.focus !== false) setTimeout(function () { f.focus(); }, 30);
    return { el: ov, body: body, close: close };
  }
  function confirmDlg(msg, o) {
    o = o || {};
    return new Promise(function (resolve) {
      modal({ title: o.title || 'Konfirmasi', size: 'sm', body: '<p style="color:var(--ink-2);line-height:1.6">' + msg + '</p>', onClose: function (v) { resolve(v === true); },
        actions: [{ label: o.batal || 'Batal', cls: 'btn-soft', value: false }, { label: o.ok || 'Ya, lanjutkan', cls: o.danger ? 'btn-danger' : 'btn-forest', value: true }] });
    });
  }
  function drawer(title, html, o) {
    o = o || {};
    const ov = el('<div class="ovl drawer-ovl"><aside class="drawer"><div class="modal-h" style="padding:18px 22px 10px"><h2 class="trunc">' + esc(title) + '</h2><button class="btn btn-ghost btn-icon btn-sm" data-x aria-label="Tutup">' + ic('close') + '</button></div><div class="modal-b" style="flex:1"></div></aside></div>');
    const body = $('.modal-b', ov);
    if (typeof html === 'string') body.innerHTML = html; else body.appendChild(html);
    function close() { ov.remove(); document.removeEventListener('keydown', k); if (o.onClose) o.onClose(); }
    function k(e) { if (e.key === 'Escape') close(); }
    document.addEventListener('keydown', k);
    ov.addEventListener('mousedown', function (e) { if (e.target === ov) close(); });
    $('[data-x]', ov).onclick = close;
    document.body.appendChild(ov);
    return { el: ov, body: body, close: close };
  }
  /** Tombol dengan status sibuk: busy(btn, async fn) */
  async function busy(btn, fn, label) {
    const html = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span>' + (label ? '<span>' + esc(label) + '</span>' : '');
    try { return await fn(); } finally { btn.disabled = false; btn.innerHTML = html; }
  }
  /** Panggil API, tampilkan pesan, kembalikan data atau null. */
  async function ask(action, data, o) {
    o = o || {};
    const r = await api(action, data);
    if (!r.success) { if (r.code !== 'AUTH') toast(r.message, 'err'); return null; }
    if (o.ok !== false && (o.ok || r.message)) toast(o.ok || r.message);
    if (o.invalidate) SWR.invalidate(o.invalidate);
    return r.data === null ? true : r.data;
  }

  // ---------------------------------------------------------------- pustaka CDN dimuat saat dibutuhkan
  const LIBS = {
    xlsx: ['https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js'],
    jspdf: ['https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js', 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'],
    qrcode: ['https://cdnjs.cloudflare.com/ajax/libs/qrcode-generator/1.4.4/qrcode.min.js']
  };
  const loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise(function (res, rej) {
      const s = document.createElement('script'); s.src = src; s.async = false;
      s.onload = function () { res(); }; s.onerror = function () { delete loaded[src]; rej(new Error('Gagal memuat ' + src.split('/').pop() + ' — periksa koneksi.')); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }
  async function loadLib(name) { for (const u of LIBS[name]) await loadScript(u); }

  // ---------------------------------------------------------------- router hash
  const Router = {
    routes: {}, cur: null, guard: null,
    on: function (name, fn) { this.routes[name] = fn; },
    parse: function () { const h = (location.hash || '').replace(/^#\/?/, ''); const p = h.split('/').map(decodeURIComponent); return { name: p[0] || '', args: p.slice(1), full: h }; },
    go: function (path) { if (location.hash === '#/' + path) this.render(); else location.hash = '#/' + path; },
    render: function () {
      const r = this.parse();
      if (this.guard && this.guard(r) === false) return;
      const fn = this.routes[r.name] || this.routes['*'];
      this.cur = r;
      if (fn) fn.apply(null, r.args);
    },
    start: function () { const self = this; if (!this._on) { this._on = true; addEventListener('hashchange', function () { self.render(); }); } this.render(); }
  };

  // ---------------------------------------------------------------- PWA: service worker & tombol pasang
  let installEvt = null;
  addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); installEvt = e; document.dispatchEvent(new Event('pcbt:installable')); });
  async function promptInstall() {
    if (installEvt) { installEvt.prompt(); const c = await installEvt.userChoice; if (c.outcome === 'accepted') installEvt = null; return; }
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    modal({ title: 'Pasang Aplikasi', size: 'sm', body: ios
      ? '<p>Di iPhone/iPad: ketuk tombol <b>Bagikan</b> ' + ic('ios_share') + ' di Safari, lalu pilih <b>Tambah ke Layar Utama</b>.</p>'
      : '<p>Buka menu browser (⋮) lalu pilih <b>Instal aplikasi</b> / <b>Tambahkan ke layar utama</b>.</p>', actions: [{ label: 'Mengerti', cls: 'btn-forest' }] });
  }
  function canInstall() { return !!installEvt || (/iphone|ipad|ipod/i.test(navigator.userAgent) && !navigator.standalone); }
  function isStandalone() { return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true; }
  if ('serviceWorker' in navigator && location.protocol === 'https:' && !CFG.DEMO) {
    addEventListener('load', function () { navigator.serviceWorker.register('./sw.js').catch(function (e) { console.warn('SW gagal:', e); }); });
  }

  window.PCBT = {
    CFG: CFG, VERSION: APP_VERSION, LS: LS, Sesi: Sesi, Perf: Perf, api: api, apiQ: apiQ, fetchMany: fetchMany, SWR: SWR, Activity: Activity,
    warmUpServer: warmUpServer, serverNow: serverNow, deviceId: deviceId, uuid: uuid, configOk: configOk,
    esc: esc, ic: ic, el: el, $: $, $$: $$, on: on, fmtJam: fmtJam, fmtTgl: fmtTgl, fmtHari: fmtHari, fmtDur: fmtDur, fmtRelatif: fmtRelatif, fmtNum: fmtNum,
    toLocalInput: toLocalInput, fromLocalInput: fromLocalInput, avColor: avColor, inisial: inisial, debounce: debounce, statusBadge: statusBadge,
    toast: toast, modal: modal, confirmDlg: confirmDlg, drawer: drawer, busy: busy, ask: ask, loadLib: loadLib, loadScript: loadScript, Router: Router,
    promptInstall: promptInstall, canInstall: canInstall, isStandalone: isStandalone,
    setAuthLost: function (fn) { onAuthLost = fn; }
  };
})();
