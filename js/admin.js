/*
 * ProctorCBT — admin.js (panel Guru & Admin)
 * Shell (sidebar, header, navigasi bawah ponsel), Dashboard, Live Monitoring, Jadwal Ujian.
 * Modul lain dimuat saat menu dibuka: akademik.js (bank soal, hasil, koreksi, log, laporan),
 * sistem.js (pengguna, pengaturan), notif.js (WhatsApp & CRM).
 * Semua halaman tampil instan dari cache lokal (SWR), lalu diperbarui di latar.
 */
(function () {
  'use strict';
  const P = window.PCBT, App = window.App, esc = P.esc, ic = P.ic, el = P.el, $ = P.$, $$ = P.$$;
  const root = document.getElementById('app');
  const Admin = window.Admin = {};
  const K = window.AdminKit = {};       // utilitas bersama untuk modul halaman lain
  let boot = P.SWR.peek('boot', {}) || null;
  let routeToken = 0;                   // menghentikan polling halaman lama saat pindah menu

  // ============================================================ NAVIGASI
  const NAV = [
    { id: 'dashboard', t: 'Dashboard', i: 'grid_view' },
    { id: 'bank-soal', t: 'Bank Soal', i: 'menu_book', cnt: 'soal', mod: 'akademik' },
    { id: 'jadwal', t: 'Jadwal Ujian', i: 'calendar_month' },
    { id: 'hasil', t: 'Hasil & Nilai', i: 'analytics', mod: 'akademik' },
    { id: 'monitor', t: 'Live Monitoring', i: 'videocam', live: true },
    { id: 'log', t: 'Log Pelanggaran', i: 'gavel', mod: 'akademik' },
    { id: 'laporan', t: 'Laporan & Statistik', i: 'bar_chart', mod: 'akademik' },
    { sec: 'Administrasi', admin: true },
    { id: 'pengguna', t: 'Pengguna', i: 'group', admin: true, mod: 'sistem' },
    { id: 'notifikasi', t: 'Notifikasi WA', i: 'forum', admin: true, mod: 'notif' },
    { id: 'crm', t: 'CRM Kontak', i: 'contacts', admin: true, mod: 'notif' },
    { id: 'pengaturan', t: 'Pengaturan', i: 'tune', mod: 'sistem' }
  ];
  const ROUTE_MOD = { koreksi: 'akademik' };
  NAV.forEach(function (n) { if (n.mod) ROUTE_MOD[n.id] = n.mod; });
  function me() { return (boot && boot.me) || (P.Sesi.data || {}).me || {}; }
  function isAdmin() { return me().role === 'Admin'; }
  K.me = me; K.isAdmin = isAdmin;

  Admin.start = function (fresh) {
    renderShell();
    P.Router.routes = {};
    P.Router.guard = function (r) {
      if (!P.Sesi.token) { if (!document.querySelector('.login')) App.showLogin(); return false; }
      const n = NAV.filter(function (x) { return x.id === r.name; })[0];
      if (n && n.admin && !isAdmin()) { P.Router.go('dashboard'); return false; }
      return true;
    };
    NAV.forEach(function (n) { if (n.id) P.Router.on(n.id, function () { buka(n.id, arguments); }); });
    P.Router.on('koreksi', function () { buka('koreksi', arguments); });
    P.Router.on('*', function () { P.Router.go('dashboard'); });
    if (!location.hash || location.hash === '#/' || location.hash === '#') location.hash = '#/dashboard';
    P.Router.start();
    muatBoot(fresh);
    P.warmUpServer('admin');
    // Prefetch modul halaman saat browser senggang (masuk cache SW → buka menu instan)
    const idle = window.requestIdleCallback || function (f) { setTimeout(f, 1500); };
    idle(function () { ['akademik', 'sistem'].concat(isAdmin() ? ['notif'] : []).forEach(function (m) { App.loadModule(m).catch(function () {}); }); });
    idle(function () { P.apiQ('ujian.list'); P.apiQ('mapel.list'); });
  };

  function muatBoot(fresh) {
    P.SWR.load('boot', {}, fresh ? 0 : 60000, function (d) {
      if (!d) return;
      boot = d; App.info = Object.assign(App.info || {}, d.settings);
      P.Sesi.patch({ me: d.me });
      updateSidebar();
    }, { force: fresh });
  }

  async function buka(id, args) {
    const token = ++routeToken;
    $$('.nav-a', root).forEach(function (a) { a.classList.toggle('on', a.dataset.nav === id || (id === 'koreksi' && a.dataset.nav === 'hasil')); });
    $$('.bnav [data-nav]', root).forEach(function (a) { a.classList.toggle('on', a.dataset.nav === id); });
    $('.sb', root).classList.remove('open'); const scrim = $('.sb-scrim', root); if (scrim) scrim.remove();
    Admin.onSearch = null; $('[data-gsearch]', root).value = '';
    const page = $('#page', root);
    page.scrollTop = 0; window.scrollTo(0, 0);
    const n = NAV.filter(function (x) { return x.id === id; })[0];
    document.title = (n ? n.t : 'Koreksi Essay') + ' — ProctorCBT';
    const mod = ROUTE_MOD[id];
    if (mod && !window['Page_' + mod]) {
      page.innerHTML = skeleton();
      try { await App.loadModule(mod); } catch (e) { page.innerHTML = '<div class="empty">' + ic('wifi_off') + esc(e.message) + '</div>'; return; }
      if (token !== routeToken) return;
    }
    const ctx = { page: page, args: Array.prototype.slice.call(args || []), alive: function () { return token === routeToken; } };
    const fn = PAGES[id] || (mod && window['Page_' + mod] && window['Page_' + mod][id]);
    if (fn) fn(ctx); else page.innerHTML = '<div class="empty">' + ic('construction') + 'Halaman tidak ditemukan.</div>';
  }
  K.alive = function () { return routeToken; };

  function skeleton() {
    return '<div class="page-h"><div><div class="skel" style="width:240px;height:26px"></div><div class="skel mt-8" style="width:320px;height:14px"></div></div></div>' +
      '<div class="metrics">' + '<div class="card skel" style="height:96px"></div>'.repeat(4) + '</div><div class="card skel" style="height:300px"></div>';
  }
  K.skeleton = skeleton;

  // ============================================================ SHELL
  function renderShell() {
    const m = me();
    root.innerHTML = '';
    const v = el('<div class="shell">' +
      '<aside class="sb" aria-label="Navigasi utama">' +
        '<div class="sb-brand"><div class="brand-mark">' + ic('verified_user', 'fill') + '</div><div class="bt"><div class="brand-name">ProctorCBT</div><div class="brand-sub" style="color:var(--on-dark-2)">Security Suite v' + P.VERSION + '</div></div></div>' +
        '<div class="sb-prof"><span class="av ' + P.avColor(m.nama) + '" data-av>' + esc(P.inisial(m.nama)) + '</span><div class="who"><div class="nm trunc" data-nm>' + esc(m.nama || '') + '</div><div class="rl trunc" data-rl></div><div class="em trunc" data-em>' + esc(m.email || '') + '</div></div></div>' +
        '<nav class="sb-nav">' + NAV.filter(function (n) { return !n.admin || isAdmin(); }).map(function (n) {
          if (n.sec) return '<div class="nav-sec">' + esc(n.sec) + '</div>';
          return '<a class="nav-a" href="#/' + n.id + '" data-nav="' + n.id + '" title="' + esc(n.t) + '">' + ic(n.i) + '<span class="t">' + esc(n.t) + '</span>' +
            (n.cnt ? '<span class="cnt" data-cnt="' + n.cnt + '"></span>' : '') + (n.live ? '<span class="cnt live hidden" data-live><i class="dot pulse" style="width:6px;height:6px;border-radius:50%;background:currentColor"></i>LIVE</span>' : '') + '</a>';
        }).join('') + '</nav>' +
        '<div class="sb-live"><div class="row between"><span class="label" style="color:var(--on-dark-2)">Pengguna Aktif</span><span class="row tiny" style="color:var(--gold-soft);gap:6px"><i class="ping"></i><b data-online>0</b> Online</span></div>' +
          '<div class="row between mt-8"><div class="avs" data-avs></div><span class="tiny" style="color:var(--on-dark-2)" data-lat></span></div></div>' +
      '</aside>' +
      '<div class="main"><header class="hdr">' +
        '<button class="btn btn-white btn-icon burger" data-burger aria-label="Menu">' + ic('menu') + '</button>' +
        '<label class="search input-ico">' + ic('search') + '<input class="input" data-gsearch placeholder="Cari ujian, token, peserta…" aria-label="Cari"></label>' +
        '<div class="grow"></div>' +
        '<span class="sys-pill" data-sys><i class="d"></i><span>Sistem Aktif • GAS v' + P.VERSION + '</span></span>' +
        '<div class="hdr-time"><div class="l">Waktu Server (WIB)</div><div class="v" data-clock>-</div></div>' +
        '<button class="btn btn-white btn-icon" data-bell aria-label="Notifikasi" style="position:relative">' + ic('notifications') + '<span data-bell-dot class="hidden" style="position:absolute;top:8px;right:9px;width:9px;height:9px;border-radius:50%;background:var(--err);box-shadow:0 0 0 2px #fff"></span></button>' +
        '<button class="btn btn-gold" data-cta>' + ic('add_circle') + '<span class="cta-txt">Buat Jadwal / Soal</span></button>' +
        '<button class="btn btn-white btn-icon" data-menu aria-label="Akun"><span class="av xs ' + P.avColor(m.nama) + '" style="width:30px;height:30px;font-size:11px" data-av2>' + esc(P.inisial(m.nama)) + '</span></button>' +
      '</header><div class="page" id="page"></div></div>' +
      '<nav class="bnav">' +
        [['dashboard', 'grid_view', 'Beranda'], ['monitor', 'videocam', 'Monitor'], ['jadwal', 'calendar_month', 'Jadwal'], ['hasil', 'analytics', 'Hasil']].map(function (b) { return '<a href="#/' + b[0] + '" data-nav="' + b[0] + '">' + ic(b[1]) + '<span>' + b[2] + '</span></a>'; }).join('') +
        '<button data-burger2>' + ic('menu') + '<span>Menu</span></button></nav>' +
      '</div>');
    root.appendChild(v);
    updateSidebar();
    const sb = $('.sb', v);
    function bukaSb() { sb.classList.add('open'); const s = el('<div class="sb-scrim"></div>'); s.onclick = function () { sb.classList.remove('open'); s.remove(); }; v.appendChild(s); }
    $('[data-burger]', v).onclick = bukaSb; $('[data-burger2]', v).onclick = bukaSb;
    $('[data-cta]', v).onclick = function () {
      const mo = P.modal({ title: 'Buat Baru', size: 'sm', body: '<div class="col gap-12"><button class="btn btn-soft btn-lg btn-block" data-a="ujian" style="justify-content:flex-start">' + ic('event_available') + '<span>Jadwal Ujian Baru</span></button>' +
        '<button class="btn btn-soft btn-lg btn-block" data-a="soal" style="justify-content:flex-start">' + ic('post_add') + '<span>Tambah Soal ke Bank Soal</span></button>' +
        '<button class="btn btn-soft btn-lg btn-block" data-a="import" style="justify-content:flex-start">' + ic('upload_file') + '<span>Import Soal dari Excel</span></button></div>' });
      P.on(mo.body, 'click', '[data-a]', function (e, b) {
        mo.close();
        if (b.dataset.a === 'ujian') K.formUjian(null);
        else { App.loadModule('akademik').then(function () { window.Page_akademik[b.dataset.a === 'soal' ? 'formSoal' : 'formImport'](); }); }
      });
    };
    $('[data-menu]', v).onclick = function () {
      const items = [['tune', 'Pengaturan & Ganti Sandi', function () { P.Router.go('pengaturan'); }]];
      if (P.canInstall() && !P.isStandalone()) items.push(['install_mobile', 'Pasang Aplikasi di Perangkat', P.promptInstall]);
      items.push(['logout', 'Keluar', App.logout]);
      const m2 = P.modal({ title: me().nama || 'Akun', size: 'sm', body: '<div class="small muted mb-16">' + esc(me().email || '') + ' • ' + esc(me().role || '') + '</div><div class="col">' +
        items.map(function (x, i) { return '<button class="btn btn-soft btn-block" style="justify-content:flex-start" data-i="' + i + '">' + ic(x[0]) + '<span>' + x[1] + '</span></button>'; }).join('') + '</div>' });
      P.on(m2.body, 'click', '[data-i]', function (e, b) { m2.close(); items[+b.dataset.i][2](); });
    };
    $('[data-bell]', v).onclick = function () { P.Router.go('log'); };
    $('[data-gsearch]', v).addEventListener('input', P.debounce(function (e) { if (Admin.onSearch) Admin.onSearch(e.target.value.trim()); }, 200));
    $('[data-gsearch]', v).addEventListener('keydown', function (e) { if (e.key === 'Enter' && !Admin.onSearch) { K.qJadwal = e.target.value.trim(); P.Router.go('jadwal'); } });
    // jam server berjalan
    const clock = $('[data-clock]', v);
    function jam() { const t = P.serverNow(); clock.textContent = P.fmtHari(t) + ' • ' + P.fmtJam(t) + ':' + String(new Date(t + 7 * 3600e3).getUTCSeconds()).padStart(2, '0'); }
    jam(); setInterval(jam, 1000);
    setInterval(function () {
      const last = P.Perf.rows[P.Perf.rows.length - 1], sys = $('[data-sys]', v);
      sys.classList.toggle('off', !!(last && !last.ok && last.server === undefined && !navigator.onLine));
      $('[data-lat]', v).textContent = P.Perf.avg() ? P.Perf.avg() + ' ms latensi' : '';
    }, 3000);
  }

  function updateSidebar() {
    const m = me(), v = root;
    if (!$('.sb', v)) return;
    $('[data-nm]', v).textContent = m.nama || '';
    $('[data-em]', v).textContent = m.email || '';
    $('[data-rl]', v).textContent = (m.role === 'Admin' ? 'Admin / Pengawas' : 'Guru / Instruktur') + ' • ' + App.institusi();
    $('[data-av]', v).textContent = P.inisial(m.nama); $('[data-av2]', v).textContent = P.inisial(m.nama);
    if (boot && boot.counts) {
      const c = $('[data-cnt=soal]', v); if (c) c.textContent = P.fmtNum(boot.counts.soal, 0);
      const live = $('[data-live]', v); if (live) live.classList.toggle('hidden', !boot.counts.ujianAktif);
    }
  }
  K.updateCounts = function (patch) { if (boot) { boot.counts = Object.assign({}, boot.counts, patch); updateSidebar(); } };
  K.setOnline = function (o) {
    if (!o) return;
    const n = (o.siswa || 0) + (o.staf || []).length, v = root;
    const on = $('[data-online]', v); if (on) on.textContent = n;
    const avs = $('[data-avs]', v);
    if (avs) avs.innerHTML = (o.staf || []).slice(0, 3).map(function (s) { return '<span class="av xs ' + P.avColor(s.nama) + '" title="' + esc(s.nama) + '">' + esc(s.inisial) + '</span>'; }).join('') +
      (n > 3 ? '<span class="av xs" style="background:var(--s-high);color:var(--ink-2)">+' + (n - Math.min(3, (o.staf || []).length)) + '</span>' : '');
  };

  // ============================================================ BAGAN SVG RINGAN (tanpa pustaka)
  K.donut = function (segs, size) {
    size = size || 160; const r = 15.9155, tot = segs.reduce(function (a, s) { return a + s.v; }, 0) || 1;
    let off = 0;
    return '<svg viewBox="0 0 36 36" width="' + size + '" height="' + size + '" role="img"><circle cx="18" cy="18" r="' + r + '" fill="none" stroke="rgba(0,69,46,.9)" stroke-width="3.8"/>' +
      segs.map(function (s) { const p = s.v / tot * 100; const c = '<circle cx="18" cy="18" r="' + r + '" fill="none" stroke="' + s.c + '" stroke-width="3.8" stroke-dasharray="' + Math.max(0, p - (p > 2 ? 1 : 0)) + ' ' + (100 - p) + '" stroke-dashoffset="' + (-off) + '" stroke-linecap="round"/>'; off += p; return p > 0 ? c : ''; }).join('') + '</svg>';
  };
  /** Batang vertikal: data [{l, v}], opsi {h, warna, sorot, fmt} */
  K.bars = function (data, o) {
    o = o || {}; const W = 600, H = o.h || 220, pad = { l: 34, r: 8, t: 14, b: 28 }, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const max = Math.max.apply(null, data.map(function (d) { return d.v || 0; }).concat([1])), bw = iw / Math.max(1, data.length);
    const tick = niceTicks(max);
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label || 'Grafik') + '">';
    tick.forEach(function (t) { const y = pad.t + ih - t / tick[tick.length - 1] * ih; s += '<line class="gl" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (pad.l - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + t + '</text>'; });
    const top = tick[tick.length - 1];
    data.forEach(function (d, i) {
      const w = Math.min(bw * 0.68, 72), h = (d.v || 0) / top * ih, x = pad.l + i * bw + (bw - w) / 2, y = pad.t + ih - h;
      const isMax = o.sorot && d.v === max && max > 0;
      s += '<rect x="' + x + '" y="' + y + '" width="' + w + '" height="' + Math.max(h, d.v ? 2 : 0) + '" rx="5" fill="' + (isMax ? '#f6be39' : (d.c || o.warna || '#1B4332')) + '"><title>' + esc(d.l) + ': ' + d.v + '</title></rect>';
      if (d.v) s += '<text x="' + (x + w / 2) + '" y="' + (y - 4) + '" text-anchor="middle" style="fill:#414844;font-weight:600">' + (o.fmt ? o.fmt(d.v) : d.v) + '</text>';
      s += '<text x="' + (x + w / 2) + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(String(d.l).length > 12 ? String(d.l).slice(0, 11) + '…' : d.l) + '</text>';
    });
    return s + '</svg>';
  };
  K.line = function (data, o) {
    o = o || {}; const W = 600, H = o.h || 220, pad = { l: 34, r: 14, t: 16, b: 28 }, iw = W - pad.l - pad.r, ih = H - pad.t - pad.b;
    const pts = data.filter(function (d) { return d.v !== null && d.v !== undefined; });
    if (!pts.length) return '<div class="empty">' + ic('show_chart') + 'Belum ada data nilai.</div>';
    const max = o.max || 100, step = pts.length > 1 ? iw / (pts.length - 1) : 0;
    let s = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label || 'Tren') + '">';
    [0, 25, 50, 75, 100].forEach(function (t) { const y = pad.t + ih - t / max * ih; s += '<line class="gl" x1="' + pad.l + '" x2="' + (W - pad.r) + '" y1="' + y + '" y2="' + y + '"/><text x="' + (pad.l - 6) + '" y="' + (y + 3) + '" text-anchor="end">' + t + '</text>'; });
    const xy = pts.map(function (d, i) { return [pad.l + (pts.length > 1 ? i * step : iw / 2), pad.t + ih - d.v / max * ih]; });
    s += '<path d="M' + xy.map(function (p) { return p[0] + ',' + p[1]; }).join(' L') + ' L' + xy[xy.length - 1][0] + ',' + (pad.t + ih) + ' L' + xy[0][0] + ',' + (pad.t + ih) + 'Z" fill="rgba(27,67,50,.08)"/>';
    s += '<polyline fill="none" stroke="#1B4332" stroke-width="2.5" stroke-linejoin="round" points="' + xy.map(function (p) { return p.join(','); }).join(' ') + '"/>';
    xy.forEach(function (p, i) { s += '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4.5" fill="#fff" stroke="#1B4332" stroke-width="2.5"><title>' + esc(pts[i].l) + ': ' + pts[i].v + '</title></circle>'; });
    if (pts.length <= 10) pts.forEach(function (d, i) { s += '<text x="' + xy[i][0] + '" y="' + (H - 9) + '" text-anchor="middle">' + esc(String(d.l).slice(0, 12)) + '</text>'; });
    return s + '</svg>';
  };
  function niceTicks(max) { const step = max <= 5 ? 1 : max <= 10 ? 2 : Math.ceil(max / 4 / 5) * 5; const out = []; for (let t = 0; t <= max + step - 1; t += step) out.push(t); if (out.length < 2) out.push(step); return out; }

  // ============================================================ UTIL BERSAMA
  K.metric = function (label, val, sub, icon, icCls, subCls) {
    return '<div class="card metric"><div style="min-width:0"><div class="label">' + label + '</div><div class="v">' + val + '</div><div class="s ' + (subCls || '') + '">' + sub + '</div></div><div class="ico ' + icCls + '">' + ic(icon) + '</div></div>';
  };
  K.selectUjian = function (list, cur, o) {
    o = o || {};
    return '<select class="select" data-ujian style="max-width:' + (o.w || 420) + 'px">' + (o.semua ? '<option value="">Semua ujian</option>' : '') +
      list.map(function (u) { return '<option value="' + esc(u.id) + '"' + (u.id === cur ? ' selected' : '') + '>' + esc(u.nama) + ' — ' + esc(u.namaMapel || u.mapel) + ' (' + P.fmtTgl(u.mulai, false) + ')</option>'; }).join('') + '</select>';
  };
  K.exportXlsx = async function (nama, sheets) {
    await P.loadLib('xlsx');
    const wb = XLSX.utils.book_new();
    Object.keys(sheets).forEach(function (n) {
      const ws = XLSX.utils.aoa_to_sheet(sheets[n]);
      ws['!cols'] = (sheets[n][0] || []).map(function (h, i) { const len = Math.max.apply(null, sheets[n].slice(0, 200).map(function (r) { return String(r[i] == null ? '' : r[i]).length; })); return { wch: Math.min(60, Math.max(8, len + 2)) }; });
      XLSX.utils.book_append_sheet(wb, ws, n.slice(0, 31));
    });
    XLSX.writeFile(wb, nama.replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_') + '.xlsx');
  };
  K.bacaFile = async function (file) {
    await P.loadLib('xlsx');
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: 'array', raw: false });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
    rows.forEach(function (r, i) { r._baris = i + 2; Object.keys(r).forEach(function (k) { const t = k.trim(); if (t !== k) { r[t] = r[k]; delete r[k]; } }); });
    return rows;
  };
  K.kosong = function (icon, teks, aksi) { return '<div class="empty">' + ic(icon) + '<div>' + teks + '</div>' + (aksi || '') + '</div>'; };
  K.kategoriNilai = function (n) { if (n === null || n === undefined) return ['Belum ada data', '']; if (n >= 85) return ['Sangat Baik', 'b-ok']; if (n >= 75) return ['Baik', 'b-info']; if (n >= 60) return ['Cukup', 'b-warn']; return ['Perlu Perhatian', 'b-bad']; };

  // ============================================================ HALAMAN: DASHBOARD
  const PAGES = {};
  PAGES.dashboard = function (ctx) {
    let tab = P.LS.get('dashTab') || 'berjalan', data = null, q = '';
    ctx.page.innerHTML = '';
    const v = el('<div>' +
      '<div class="card row wrap mb-16" style="padding:14px;gap:10px"><label class="input-ico grow" style="min-width:220px">' + ic('search') + '<input class="input" data-q placeholder="Cari ujian, mata pelajaran, atau kelas…" style="background:var(--canvas)"></label>' +
        '<span class="chip">' + ic('tune') + 'Semua Status</span><span class="chip" data-ta>' + ic('calendar_month') + esc((App.info && App.info.TAHUN_AJARAN) || 'Tahun ajaran') + '</span><span class="chip">' + ic('account_balance') + esc(App.institusi()) + '</span>' +
        '<button class="btn btn-gold" data-new>' + ic('add_circle') + '<span>Buat Ujian Baru</span></button></div>' +
      '<div class="metrics" data-metrics>' + '<div class="card skel" style="height:96px"></div>'.repeat(4) + '</div>' +
      '<div class="layout-3"><section class="stack"><div class="page-h" style="margin:0"><div><h2>Sesi Ujian Berlangsung &amp; Mendatang</h2><p>Pantau integritas ruang ujian berbasis sinkronisasi realtime</p></div><div class="seg" data-tabs></div></div><div class="stack" data-list><div class="card skel" style="height:120px"></div></div></section>' +
      '<aside class="stack" data-side><div class="card-forest skel" style="height:520px;opacity:.4"></div></aside></div></div>');
    ctx.page.appendChild(v);
    $('[data-new]', v).onclick = function () { K.formUjian(null); };
    $('[data-q]', v).addEventListener('input', P.debounce(function (e) { q = e.target.value.toLowerCase(); renderList(); }, 150));
    Admin.onSearch = function (s) { q = s.toLowerCase(); $('[data-q]', v).value = s; renderList(); };
    function render(d) {
      if (!d || !ctx.alive()) return;
      data = d;
      K.updateCounts({ ujianAktif: d.kartu.ujianAktif }); K.setOnline(d.online);
      const kat = K.kategoriNilai(d.kartu.rata);
      $('[data-metrics]', v).innerHTML =
        K.metric('Total Ujian Aktif', d.kartu.ujianAktif + ' <small>Sesi</small>', ic('schedule') + '<span>' + d.kartu.mendatang + ' sesi mendatang</span>', 'assignment', 'b-gold', '') +
        K.metric('Peserta Ujian Hari Ini', P.fmtNum(d.kartu.pesertaHariIni, 0) + ' <small>Siswa</small>', ic('check_circle') + '<span>' + (d.online.siswa || 0) + ' sedang online</span>', 'groups', 'b-ok', 'b-ok-t') +
        K.metric('Rata-rata Nilai CBT', (d.kartu.rata === null ? '—' : P.fmtNum(d.kartu.rata, 1)) + ' <small>/ 100</small>', ic('star') + '<span>Kategori: ' + kat[0] + '</span>', 'query_stats', 'b-info', '') +
        K.metric('Peserta Ter-flag', d.kartu.flag + ' <small>Siswa</small>', ic('warning') + '<span>' + (d.kartu.flag ? 'Perlu review' : 'Semua tertib') + '</span>', 'flag', 'b-warn', '');
      $$('.metric .s', v).forEach(function (s, i) { s.style.color = ['var(--ok)', 'var(--ok)', 'var(--info)', 'var(--warn)'][i]; });
      renderList(); renderSide();
      const dot = $('[data-bell-dot]', root); if (dot) dot.classList.toggle('hidden', !d.kartu.flag);
    }
    function renderList() {
      if (!data) return;
      const by = { berjalan: [], mendatang: [], selesai: [] };
      data.sesi.forEach(function (s) { if (!q || (s.nama + ' ' + s.mapel + ' ' + s.kelas + ' ' + s.token).toLowerCase().indexOf(q) > -1) by[s.kategori].push(s); });
      $('[data-tabs]', v).innerHTML = [['berjalan', 'Sedang Berjalan'], ['mendatang', 'Mendatang'], ['selesai', 'Selesai']].map(function (t) { return '<button class="' + (tab === t[0] ? 'on' : '') + '" data-t="' + t[0] + '">' + t[1] + ' (' + by[t[0]].length + ')</button>'; }).join('');
      $$('[data-t]', v).forEach(function (b) { b.onclick = function () { tab = b.dataset.t; P.LS.set('dashTab', tab); renderList(); }; });
      const list = by[tab];
      $('[data-list]', v).innerHTML = list.length ? list.slice(0, 30).map(tiket).join('') :
        '<div class="card">' + K.kosong(tab === 'berjalan' ? 'event_busy' : 'event_note', tab === 'berjalan' ? 'Tidak ada ujian yang sedang berlangsung.' : tab === 'mendatang' ? 'Belum ada ujian terjadwal.' : 'Belum ada ujian selesai.',
          '<button class="btn btn-gold mt-16" data-new2>' + ic('add_circle') + '<span>Buat Ujian Baru</span></button>') + '</div>';
      const n2 = $('[data-new2]', v); if (n2) n2.onclick = function () { K.formUjian(null); };
    }
    function renderSide() {
      const it = data.integritas, tot = it.aman + it.peringatan + it.dq, pct = tot ? Math.round(it.aman / tot * 100) : 100;
      const maxH = Math.max.apply(null, data.hist.concat([1]));
      $('[data-side]', v).innerHTML =
        '<div class="card-forest stack"><div class="row between"><div><div class="label">Status Integritas Realtime</div><h3 class="mt-8">Pengawasan Sesi Hari Ini</h3></div><span class="av" style="background:var(--forest-2);color:var(--gold-soft)">' + ic('shield') + '</span></div>' +
        '<div class="inset-dark" style="background:rgba(1,45,29,.4)"><div class="donut">' + K.donut([{ v: it.aman, c: '#22c55e' }, { v: it.peringatan, c: '#ffdfa0' }, { v: it.dq, c: '#ef4444' }]) +
          '<div class="c"><b>' + pct + '%</b><span class="label" style="margin-top:4px">Integritas</span></div></div>' +
          '<div class="legend"><div><span><i style="background:#22c55e"></i>Integritas Aman</span><b>' + it.aman + ' Siswa</b></div><div><span><i style="background:#ffdfa0"></i>Peringatan Pelanggaran</span><b style="color:var(--gold-soft)">' + it.peringatan + ' Siswa</b></div>' +
          '<div><span><i style="background:#ef4444"></i>Terdiskualifikasi</span><b style="color:#fecaca">' + it.dq + ' Siswa</b></div></div></div>' +
        '<div><div class="row between"><b class="small">Sebaran Nilai Sesi Terakhir</b><span class="tiny" style="color:var(--gold-soft)">' + (data.histAvg !== null ? 'Rata-rata: ' + P.fmtNum(data.histAvg, 1) : '') + '</span></div>' +
          '<div class="tiny mt-8" style="color:var(--on-dark-2)">' + esc(data.histUjian || 'Belum ada sesi bernilai') + '</div>' +
          '<div class="hbars mt-8">' + data.hist.map(function (n, i) { return '<div><i class="' + (n === maxH && n > 0 ? 'top' : '') + '" style="height:' + Math.round(n / maxH * 100) + '%" title="' + n + ' siswa"></i><span>' + ['<50', '50', '60', '70', '80', '90+'][i] + '</span></div>'; }).join('') + '</div></div>' +
        '<div class="int-row" style="flex-direction:row;align-items:center;justify-content:space-between"><div class="row"><span class="av" style="background:var(--forest-deep);color:var(--gold-soft)">' + ic('person_check') + '</span><div><div class="tiny" style="color:var(--on-dark-2)">Pengawas Online</div><b style="font-family:var(--f-head)">' + data.online.staf.length + ' Guru/Admin</b></div></div>' +
          '<button class="btn btn-gold btn-sm" data-mon>Buka Monitoring</button></div></div>' +
        '<div class="card row" style="align-items:flex-start;gap:12px"><span style="color:var(--gold-deep)">' + ic('verified_user') + '</span><div><b style="font-family:var(--f-head)">Proteksi Anti-Nyontek Aktif</b><p class="small muted mt-8">Pindah tab, keluar layar penuh, dan kehilangan fokus jendela tercatat otomatis ke Log Pelanggaran, disertai alarm & suara peringatan bertingkat di perangkat siswa.</p></div></div>';
      $('[data-mon]', v).onclick = function () { P.Router.go('monitor'); };
    }
    function load(force) { return P.SWR.load('dash.summary', {}, 30000, render, { force: force }); }
    load(false);
    const t = setInterval(function () { if (!ctx.alive()) return clearInterval(t); if (P.Activity.due('dash', 30000, 120000)) load(true); }, 5000);
  };

  function tiket(s) {
    const now = P.serverNow(), berjalan = s.kategori === 'berjalan', durWin = s.selesai - s.mulai;
    const prog = berjalan ? Math.min(100, Math.round((now - s.mulai) / durWin * 100)) : s.kategori === 'selesai' ? 100 : 0;
    const sisa = berjalan ? s.selesai - now : s.mulai - now;
    const ket = berjalan ? 'Jendela tersisa ' + durasiTeks(sisa) : s.kategori === 'mendatang' ? 'Dimulai dlm ' + durasiTeks(sisa) : 'Selesai ' + P.fmtTgl(s.selesai, false);
    const icons = ['calculate', 'science', 'translate', 'menu_book', 'functions', 'history_edu', 'mosque', 'public'];
    return '<article class="card ticket"><div class="row" style="gap:14px;align-items:flex-start;min-width:0"><div class="t-ico">' + ic(icons[Math.abs(hashStr(s.mapel)) % icons.length]) + '</div><div style="min-width:0">' +
      '<div class="row wrap" style="gap:6px">' + (berjalan ? '<span class="badge b-ok"><i class="dot pulse"></i>Sedang Berlangsung</span>' : s.status === 'Draft' ? '<span class="badge b-mute">Draft</span>' : s.kategori === 'mendatang' ? '<span class="badge b-mute">Mendatang</span>' : '<span class="badge b-info">Selesai</span>') +
        (s.kode ? '<span class="badge b-mute">' + esc(s.kode) + '</span>' : '') + '</div>' +
      '<h3 class="clamp2 mt-8" title="' + esc(s.nama) + '">' + esc(s.nama) + '</h3><div class="row wrap small muted" style="gap:6px;margin-top:4px">Token: <span class="tok">' + esc(s.token) + '</span><span>•</span><span>Durasi: ' + s.durasi + ' Menit</span></div></div></div>' +
      '<div class="t-route"><div class="tm"><span class="label">Mulai</span><b>' + P.fmtJam(s.mulai) + '</b><span class="tiny muted">' + P.fmtTgl(s.mulai, false) + '</span></div>' +
        '<div class="mid"><span class="tiny" style="font-weight:700;color:' + (berjalan ? 'var(--ok)' : 'var(--outline)') + '">' + esc(ket) + '</span><div class="bar mt-8" style="height:6px"><i style="width:' + prog + '%"></i></div>' +
        '<div class="tiny muted mt-8">' + ic('meeting_room') + ' ' + esc(s.ruang || s.kelas || '-') + '</div></div>' +
        '<div class="tm"><span class="label">Selesai</span><b>' + P.fmtJam(s.selesai) + '</b><span class="tiny muted">' + P.fmtTgl(s.selesai, false) + '</span></div></div>' +
      '<div class="col" style="align-items:flex-end;gap:10px"><div style="text-align:right"><b style="font:700 16px var(--f-head)"><span style="color:var(--ok)">' + s.peserta + '</span><span class="muted" style="font-weight:400"> / ' + (s.target === null ? '∞' : s.target) + ' Siswa</span></b>' +
        '<div class="tiny" style="font-weight:600;color:' + (s.flag ? 'var(--warn)' : 'var(--ok)') + '">' + (s.flag ? s.flag + ' Flag Terdeteksi' : '100% Integritas Aman') + '</div></div>' +
        (berjalan ? '<a class="btn btn-gold btn-sm" href="#/monitor/' + encodeURIComponent(s.id) + '">' + ic('videocam') + '<span>Pantau Live</span></a>'
          : s.kategori === 'selesai' ? '<a class="btn btn-white btn-sm" href="#/hasil/' + encodeURIComponent(s.id) + '">' + ic('analytics') + '<span>Lihat Hasil</span></a>'
          : '<a class="btn btn-white btn-sm" href="#/jadwal/' + encodeURIComponent(s.id) + '">' + ic('settings') + '<span>Kelola Sesi</span></a>') + '</div></article>';
  }
  function hashStr(s) { let h = 0; s = String(s); for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return h; }
  function durasiTeks(ms) { const m = Math.max(0, Math.round(ms / 60000)); if (m < 60) return m + ' mnt'; if (m < 1440) return Math.floor(m / 60) + ' jam ' + (m % 60) + 'm'; return Math.floor(m / 1440) + ' hari'; }
  K.tiket = tiket;

  // ============================================================ HALAMAN: LIVE MONITORING
  PAGES.monitor = async function (ctx) {
    let id = ctx.args[0] || P.LS.get('monUjian') || '', data = null, filter = 'semua', q = '', view = P.LS.get('monView') || 'grid', lastHash = '';
    const page = ctx.page;
    const listRes = await P.apiQ('ujian.list');
    if (!ctx.alive()) return;
    const ujian = (listRes.success ? listRes.data : []).slice().sort(function (a, b) { return b.mulai - a.mulai; });
    const now = P.serverNow();
    const aktif = ujian.filter(function (u) { return u.status === 'Aktif' && u.mulai <= now && u.selesai >= now; });
    if (!id || !ujian.some(function (u) { return u.id === id; })) id = (aktif[0] || ujian.filter(function (u) { return u.status === 'Aktif'; })[0] || ujian[0] || {}).id || '';
    if (!id) { page.innerHTML = '<div class="page-h"><div><h1>Live Monitoring</h1><p>Pantau peserta ujian secara langsung</p></div></div><div class="card">' + K.kosong('videocam_off', 'Belum ada jadwal ujian. Buat & aktifkan ujian terlebih dahulu.', '<button class="btn btn-gold mt-16" data-new>' + ic('add_circle') + '<span>Buat Ujian</span></button>') + '</div>'; $('[data-new]', page).onclick = function () { K.formUjian(null); }; return; }
    P.LS.set('monUjian', id);
    page.innerHTML = '';
    const v = el('<div>' +
      '<div class="card mon-deck"><div class="row wrap between"><div class="exam-switch">' + ic('assignment') + '<div class="col gap-0"><span class="label">Ujian dipantau</span><select data-sw aria-label="Pilih ujian">' +
        ujian.map(function (u) { return '<option value="' + esc(u.id) + '"' + (u.id === id ? ' selected' : '') + '>' + esc(u.nama) + (u.ruang ? ' (' + esc(u.ruang) + ')' : '') + ' — ' + esc(u.status) + '</option>'; }).join('') + '</select></div></div>' +
        '<div class="row wrap"><span class="badge b-ok" style="padding:8px 14px" data-livebadge><i class="dot pulse"></i>LIVE MONITORING <span class="tiny" style="font-weight:500">• auto-sync</span></span>' +
          '<span class="badge b-mute" style="padding:8px 14px" data-dur>' + ic('lock_clock') + '<span>-</span></span>' +
          '<button class="btn btn-white btn-sm" data-sync>' + ic('refresh') + '<span>Sinkronisasi</span></button></div></div>' +
        '<div class="row wrap between"><div class="row wrap" style="gap:6px" data-filters></div><div class="row grow" style="max-width:420px;min-width:220px"><label class="input-ico grow">' + ic('search') + '<input class="input" data-q placeholder="Cari NIS / nama…" style="background:var(--s-low)"></label>' +
          '<div class="seg"><button data-view="grid" title="Kartu">' + ic('grid_view') + '</button><button data-view="list" title="Tabel">' + ic('view_agenda') + '</button></div></div></div></div>' +
      '<div class="layout-3"><section class="stack"><div class="row between"><div class="row"><h2>Telemetri Peserta</h2><span class="badge b-mute">Tampilan real-time</span></div><span class="tiny muted" data-upd></span></div><div data-grid><div class="pgrid">' + '<div class="card skel" style="height:250px"></div>'.repeat(4) + '</div></div></section>' +
      '<aside class="stack" data-side></aside></div></div>');
    page.appendChild(v);
    $('[data-sw]', v).onchange = function () { P.Router.go('monitor/' + encodeURIComponent(this.value)); };
    $('[data-sync]', v).onclick = function () { const b = this; P.busy(b, function () { return tarik(true); }); };
    $('[data-q]', v).addEventListener('input', P.debounce(function (e) { q = e.target.value.toLowerCase(); render(); }, 150));
    Admin.onSearch = function (s) { q = s.toLowerCase(); $('[data-q]', v).value = s; render(); };
    $$('[data-view]', v).forEach(function (b) { b.classList.toggle('on', b.dataset.view === view); b.onclick = function () { view = b.dataset.view; P.LS.set('monView', view); $$('[data-view]', v).forEach(function (x) { x.classList.toggle('on', x === b); }); render(); }; });

    async function tarik(paksa) {
      const r = await P.api('mon.live', { id: id });
      if (!ctx.alive()) return;
      if (!r.success) { if (paksa) P.toast(r.message, 'err'); return; }
      const h = JSON.stringify(r.data.peserta) + JSON.stringify(r.data.hitung);
      data = r.data; $('[data-upd]', v).textContent = 'Diperbarui ' + P.fmtJam(P.serverNow()) + ' WIB';
      if (h !== lastHash || paksa) { lastHash = h; render(); renderSide(); }
      renderDur();
    }
    function cocok(p) {
      if (q && (p.nama + ' ' + p.nis + ' ' + p.kelas).toLowerCase().indexOf(q) === -1) return false;
      if (filter === 'semua') return true;
      if (filter === 'normal') return p.level === 'normal' && p.state !== 'selesai';
      if (filter === 'peringatan') return p.level === 'peringatan' && p.state !== 'selesai' && p.state !== 'dq';
      if (filter === 'kritis') return p.level === 'kritis';
      if (filter === 'selesai') return p.state === 'selesai' || p.state === 'dq';
      return true;
    }
    function renderDur() {
      if (!data) return;
      const u = data.ujian, now2 = P.serverNow(), d = $('[data-dur] span:last-child', v);
      d.innerHTML = u.status !== 'Aktif' ? 'Status: <b>' + esc(u.status) + '</b>' : now2 < u.mulai ? 'Mulai ' + P.fmtTgl(u.mulai) : now2 > u.selesai ? 'Jendela ujian berakhir' : 'Jendela: <b>' + (u.selesai - now2 > 7200e3 ? durasiTeks(u.selesai - now2) : P.fmtDur((u.selesai - now2) / 1000)) + '</b> tersisa • Durasi ' + u.durasi + ' mnt';
      $('[data-livebadge]', v).className = 'badge ' + (u.status === 'Aktif' && now2 >= u.mulai && now2 <= u.selesai ? 'b-ok' : 'b-mute');
    }
    function render() {
      if (!data) return;
      const h = data.hitung;
      $('[data-filters]', v).innerHTML = [['semua', 'Semua Peserta', h.semua, ''], ['normal', 'Normal', h.normal, 'var(--ok)'], ['peringatan', 'Peringatan / Idle', h.peringatan, '#d97706'], ['kritis', 'Ter-flag', h.kritis, 'var(--err)'], ['selesai', 'Selesai', h.selesai, 'var(--info)'], ['belum', 'Belum Hadir', h.belum, 'var(--outline)']]
        .map(function (f) { return '<button class="chip' + (filter === f[0] ? ' on' : '') + '" data-f="' + f[0] + '">' + (f[3] ? '<i style="width:8px;height:8px;border-radius:50%;background:' + f[3] + '"></i>' : '') + f[1] + '<span class="n">' + f[2] + '</span></button>'; }).join('');
      $$('[data-f]', v).forEach(function (b) { b.onclick = function () { filter = b.dataset.f; render(); }; });
      const grid = $('[data-grid]', v);
      if (filter === 'belum') {
        const bl = data.belum.filter(function (s) { return !q || (s.nama + ' ' + s.nis).toLowerCase().indexOf(q) > -1; });
        grid.innerHTML = bl.length ? '<div class="card pad-0"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Peserta</th><th>NIS</th><th>Kelas</th><th>Status</th></tr></thead><tbody>' +
          bl.map(function (s) { return '<tr><td><div class="row"><span class="av sm ' + P.avColor(s.nama) + '">' + esc(s.inisial) + '</span>' + esc(s.nama) + '</div></td><td class="mono">' + esc(s.nis) + '</td><td>' + esc(s.kelas) + '</td><td><span class="badge b-mute">Belum login</span></td></tr>'; }).join('') + '</tbody></table></div></div>'
          : '<div class="card">' + K.kosong('how_to_reg', 'Semua peserta kelas sudah hadir.') + '</div>';
        return;
      }
      const list = data.peserta.filter(cocok).sort(function (a, b) { const o = { kritis: 0, peringatan: 1, normal: 2 }; return (o[a.level] - o[b.level]) || (b.viol - a.viol) || String(a.nama).localeCompare(b.nama); });
      if (!list.length) { grid.innerHTML = '<div class="card">' + K.kosong('person_search', data.peserta.length ? 'Tidak ada peserta pada filter ini.' : 'Belum ada peserta yang login. Bagikan token <span class="tok">' + esc(data.ujian.token) + '</span> kepada peserta.') + '</div>'; return; }
      grid.innerHTML = view === 'grid' ? '<div class="pgrid">' + list.map(kartuPeserta).join('') + '</div>' :
        '<div class="card pad-0"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Peserta</th><th>Status</th><th class="num">Progres</th><th class="num">Pelanggaran</th><th>Fokus</th><th>Terakhir aktif</th><th class="num">Sisa</th><th></th></tr></thead><tbody>' +
        list.map(function (p) { return '<tr><td><div class="row"><span class="av sm ' + (p.level === 'kritis' ? 'bad' : P.avColor(p.nama)) + '">' + esc(p.inisial) + '</span><div><b>' + esc(p.nama) + '</b><div class="tiny muted">' + esc(p.nis) + ' • ' + esc(p.kelas) + '</div></div></div></td><td>' + stateBadge(p) + '</td>' +
          '<td class="num">' + p.n + '/' + p.N + '</td><td class="num"><span class="badge ' + (p.viol ? (p.level === 'kritis' ? 'b-bad' : 'b-warn') : 'b-ok') + '">' + p.viol + (p.batas ? '/' + p.batas : '') + '</span></td>' +
          '<td>' + (p.state === 'aktif' ? (p.fokus ? '<span class="badge b-ok">Di layar</span>' : '<span class="badge b-warn">Keluar layar</span>') : '-') + '</td><td class="small">' + (p.seen ? P.fmtRelatif(p.seen) : '-') + '</td><td class="num mono small">' + (p.sisa !== null && p.state !== 'selesai' && p.state !== 'dq' ? P.fmtDur(p.sisa) : '-') + '</td>' +
          '<td><button class="btn btn-soft btn-sm" data-det="' + esc(p.h) + '">Detail</button></td></tr>'; }).join('') + '</tbody></table></div></div>';
      $$('[data-det]', grid).forEach(function (b) { b.onclick = function () { detailPeserta(b.dataset.det); }; });
      $$('[data-warn]', grid).forEach(function (b) { b.onclick = function () { kirimPeringatan(b.dataset.warn); }; });
    }
    function stateBadge(p) {
      const m = { aktif: ['b-ok', 'Aktif Mengerjakan'], idle: ['b-mute', 'Idle > ' + Math.round(p.idle / 60) + ' mnt'], offline: ['b-mute', 'Offline'], login: ['b-mute', 'Belum mulai'], selesai: ['b-info', p.status === 'Menunggu Koreksi Essay' ? 'Selesai (essay)' : 'Selesai'], dq: ['b-bad', 'Diskualifikasi'] };
      let x = m[p.state] || ['b-mute', p.state];
      if (p.state === 'aktif' && !p.fokus) x = ['b-warn', 'Keluar Layar Ujian'];
      if (p.state === 'aktif' && p.level === 'kritis') x = ['b-bad', 'Kritis — ' + p.viol + ' pelanggaran'];
      return '<span class="badge ' + x[0] + (p.level !== 'normal' && p.state === 'aktif' ? ' pulse' : '') + '"><i class="dot"></i>' + esc(x[1]) + '</span>';
    }
    function kartuPeserta(p) {
      const pct = p.N ? Math.round(p.n / p.N * 100) : 0, teleCls = p.state === 'dq' || p.level === 'kritis' ? 'bad' : p.level === 'peringatan' ? 'warn' : p.state === 'offline' || p.state === 'login' || p.state === 'selesai' ? 'mute' : '';
      const barCls = p.level === 'kritis' ? 'bad' : p.level === 'peringatan' ? 'gold' : p.state === 'idle' || p.state === 'offline' ? 'mute' : '';
      const aksi = p.level === 'kritis' && p.state !== 'dq' ? '<button class="btn btn-danger btn-sm" data-det="' + esc(p.h) + '">' + ic('block') + '<span>Tinjau Diskualifikasi</span></button>'
        : p.level === 'peringatan' && p.state !== 'selesai' ? '<button class="btn btn-gold btn-sm" data-warn="' + esc(p.h) + '">' + ic('notifications_active') + '<span>Kirim Peringatan</span></button>'
        : '<button class="btn btn-soft btn-sm" data-det="' + esc(p.h) + '">Detail Sesi</button>';
      const ket = p.state === 'dq' ? '<span style="color:var(--bad)">' + ic('report') + ' Diskualifikasi</span>' : p.level === 'kritis' ? '<span style="color:var(--bad)">' + ic('report') + ' Status: Kritis</span>'
        : p.state === 'idle' ? '<span class="muted">' + ic('timer_pause') + ' Idle ' + P.fmtDur(p.idle).slice(3) + '</span>' : p.viol ? '<span style="color:var(--warn)">' + ic('visibility_off') + ' Fokus hilang ' + p.viol + '×</span>'
        : p.state === 'selesai' ? '<span style="color:var(--info)">' + ic('task_alt') + ' ' + (p.nilai !== null ? 'Nilai ' + P.fmtNum(p.nilai) : 'Terkirim') + '</span>' : '<span style="color:var(--ok)">' + ic('verified_user') + ' Integrity 100%</span>';
      return '<article class="pcard ' + p.level + '"><div class="row between" style="align-items:flex-start"><div class="row" style="min-width:0"><span class="av ' + (p.level === 'kritis' ? 'bad' : P.avColor(p.nama)) + '">' + esc(p.inisial) + '</span><div style="min-width:0"><b class="trunc" style="display:block;font-family:var(--f-head)">' + esc(p.nama) + '</b><span class="tiny muted">NIS ' + esc(p.nis) + ' • ' + esc(p.kelas) + '</span></div></div>' + stateBadge(p) + '</div>' +
        '<div class="tele ' + teleCls + '"><span class="tag badge ' + (p.viol ? (p.level === 'kritis' ? 'b-bad' : 'b-warn') : 'b-ok') + '">' + ic(p.viol ? 'warning' : 'check') + p.viol + (p.batas ? '/' + p.batas : '') + ' Pelanggaran</span>' +
          '<div><div class="k">Fokus Layar</div><div class="v">' + (p.state === 'aktif' || p.state === 'idle' ? (p.fokus ? 'Di layar ujian' : 'Keluar layar') : '—') + '</div></div>' +
          '<div style="margin-top:22px"><div class="k">Soal Aktif</div><div class="v">' + (p.c ? 'No. ' + p.c : '—') + '</div></div>' +
          '<div><div class="k">Terakhir Aktif</div><div class="v">' + (p.seen ? P.fmtRelatif(p.seen) : 'Belum ada sinyal') + '</div></div>' +
          '<div><div class="k">Koneksi</div><div class="v">' + (p.state === 'offline' ? 'Terputus' : p.seen ? 'Online' + (p.net ? ' • ' + esc(p.net.toUpperCase()) : '') : '—') + '</div></div></div>' +
        '<div><div class="row between tiny"><span style="font-weight:600;color:var(--ink-2)">Soal ' + p.n + '/' + p.N + ' (' + pct + '%)' + (p.ragu ? ' • ' + p.ragu + ' ragu' : '') + '</span><span class="muted">' + (p.sisa !== null && p.state !== 'selesai' && p.state !== 'dq' ? 'Sisa ' + P.fmtDur(p.sisa) : p.mulai ? 'Mulai ' + P.fmtJam(p.mulai) : '') + '</span></div><div class="bar mt-8 ' + barCls + '"><i style="width:' + pct + '%"></i></div></div>' +
        '<div class="row between small" style="font-weight:600">' + ket + aksi + '</div></article>';
    }
    function renderSide() {
      const h = data.hitung, hadir = h.semua, target = hadir + h.belum, terhubung = data.peserta.filter(function (p) { return p.state === 'aktif' || p.state === 'idle'; }).length;
      const kritis = data.peserta.filter(function (p) { return (p.level === 'kritis' || p.level === 'peringatan') && p.state !== 'selesai'; }).sort(function (a, b) { return b.viol - a.viol; }).slice(0, 4);
      const dots = data.peserta.slice().sort(function (a, b) { return String(a.nama).localeCompare(b.nama); }).map(function (p) {
        const c = p.state === 'dq' || p.level === 'kritis' ? 'kritis' : p.state === 'selesai' ? 'selesai' : p.state === 'offline' || p.state === 'login' ? 'off' : p.level === 'peringatan' ? 'peringatan' : '';
        return '<i class="' + c + '" title="' + esc(p.nama) + '" data-det="' + esc(p.h) + '"></i>';
      }).concat(data.belum.map(function (s) { return '<i class="belum" title="' + esc(s.nama) + ' (belum login)"></i>'; })).join('');
      const side = $('[data-side]', v);
      side.innerHTML = '<div class="card-forest stack"><div class="row between" style="align-items:flex-start"><div><div class="label">Proctor Monitor</div><h2 class="mt-8">Ringkasan Pengawasan</h2><div class="tiny" style="color:var(--gold-soft);margin-top:2px">' + esc(data.ujian.ruang || data.ujian.kelas || data.ujian.mapel) + '</div></div><span class="av" style="background:var(--forest-2);color:var(--gold-soft)">' + ic('sensors') + '</span></div>' +
        '<div class="inset-dark row between"><div><b style="font:700 36px/1 var(--f-head)">' + terhubung + '</b><div class="small" style="color:var(--on-dark-2);margin-top:4px">Peserta terhubung</div></div><div style="text-align:right"><div class="tiny" style="color:var(--mint)">' + ic('how_to_reg') + ' ' + (target ? Math.round(hadir / target * 100) : 0) + '% Hadir</div><div class="tiny" style="color:var(--on-dark-2);margin-top:4px">' + h.belum + ' belum login • ' + h.offline + ' offline</div></div></div>' +
        '<div><div class="row between"><span class="label">Denah Status Peserta</span><span class="tiny" style="color:var(--gold-soft);font-weight:700">Live Matrix</span></div><div class="dots mt-8">' + (dots || '<span class="tiny" style="color:var(--on-dark-2)">Belum ada peserta</span>') + '</div>' +
          '<div class="row between tiny mt-8" style="color:var(--on-dark-2)"><span><i class="ping" style="background:#22c55e"></i> ' + h.normal + ' Tertib</span><span style="color:var(--gold-soft)">● ' + h.peringatan + ' Peringatan</span><span style="color:#fecaca">● ' + h.kritis + ' Flagged</span></div></div>' +
        '<div><div class="row between"><b class="small">Perlu Intervensi Segera</b><span class="badge b-bad">' + kritis.filter(function (p) { return p.level === 'kritis'; }).length + ' Kritis</span></div><div class="col mt-8">' +
          (kritis.length ? kritis.map(function (p) { return '<div class="int-row"><div class="row between"><div class="row"><span class="av sm ' + (p.level === 'kritis' ? 'bad' : 'c2') + '">' + esc(p.inisial) + '</span><div><b class="small">' + esc(p.nama) + '</b><div class="tiny" style="color:var(--on-dark-2)">' + esc(p.kelas) + '</div></div></div><span class="badge ' + (p.level === 'kritis' ? 'b-bad' : 'b-warn') + '">' + p.viol + ' Pelanggaran</span></div>' +
            '<div class="row"><button class="btn btn-gold btn-sm grow" data-warn="' + esc(p.h) + '">Kirim Peringatan</button>' + (p.state === 'dq' ? '<button class="btn btn-on-dark btn-sm grow" data-det="' + esc(p.h) + '">Detail</button>' : p.level === 'kritis' ? '<button class="btn btn-sm grow" style="background:var(--err);color:#fff" data-det="' + esc(p.h) + '">Diskualifikasi</button>' : '<button class="btn btn-on-dark btn-sm grow" data-det="' + esc(p.h) + '">Detail</button>') + '</div></div>'; }).join('')
            : '<div class="int-row small" style="color:var(--on-dark-2)">' + ic('verified') + ' Tidak ada peserta yang perlu intervensi.</div>') + '</div></div>' +
        '<div class="col"><button class="btn btn-gold btn-block" data-bc>' + ic('campaign') + '<span>Siarkan Pesan ke Semua Layar</span></button>' +
          '<div class="row"><button class="btn btn-on-dark grow" data-ext>' + ic('more_time') + '<span>Tambah Waktu</span></button><button class="btn btn-on-dark grow" data-pdf>' + ic('download') + '<span>Log (PDF)</span></button></div></div></div>' +
        '<div class="card"><div class="row between"><b style="font-family:var(--f-head);color:var(--forest-deep)">Kesehatan Infrastruktur Ujian</b><span class="tiny" style="font-weight:700;color:' + (h.offline > hadir * 0.2 ? 'var(--warn)' : 'var(--ok)') + '">' + (h.offline > hadir * 0.2 ? 'PERIKSA' : 'OPTIMAL') + '</span></div><div class="grid-2 mt-12" style="gap:8px">' +
          [['Latensi API', (P.Perf.avg() || '-') + ' ms rata-rata'], ['Koneksi Putus', h.offline + ' Sesi'], ['Sinkron Peserta', 'Otomatis ±20 dtk'], ['Proteksi Layar', 'Fullscreen + Tab']].map(function (x) { return '<div class="inset" style="padding:10px 12px"><div class="tiny muted">' + x[0] + '</div><b class="small">' + x[1] + '</b></div>'; }).join('') + '</div></div>';
      $$('[data-warn]', side).forEach(function (b) { b.onclick = function () { kirimPeringatan(b.dataset.warn); }; });
      $$('[data-det]', side).forEach(function (b) { b.onclick = function () { detailPeserta(b.dataset.det); }; });
      $('[data-bc]', side).onclick = siaran;
      $('[data-ext]', side).onclick = function () { tambahWaktu(null); };
      $('[data-pdf]', side).onclick = function () { const b = this; P.busy(b, ekspor); };
    }
    async function kirimPeringatan(h, pesan) {
      const r = await P.ask('mon.warn', { h: h, pesan: pesan || 'Peringatan dari pengawas: fokus pada layar ujian Anda. Aktivitas Anda sedang dipantau.' });
      if (r) tarik(false);
    }
    function siaran() {
      const m = P.modal({ title: 'Siarkan Pesan ke Semua Layar', body: '<label class="field"><span>Pesan untuk seluruh peserta</span><textarea class="textarea" data-m maxlength="300" placeholder="Contoh: Waktu tersisa 15 menit. Periksa kembali jawaban Anda.">' + esc((data.bc && data.bc.m) || '') + '</textarea><span class="hint">Tampil sebagai banner di layar peserta (maks. 300 karakter). Kosongkan lalu kirim untuk menghapus siaran.</span></label>',
        actions: [{ label: 'Batal' }, { label: 'Siarkan', icon: 'campaign', cls: 'btn-gold', onClick: async function (close, body) { const r = await P.ask('mon.broadcast', { id: id, pesan: $('[data-m]', body).value.trim() }); if (r) { close(); tarik(true); } else return false; } }] });
      return m;
    }
    function tambahWaktu(h) {
      const mo = P.modal({ title: h ? 'Tambah Waktu Peserta' : 'Tambah Waktu Semua Peserta Aktif', size: 'sm', body: '<div class="seg" data-mn>' + [5, 10, 15, 30].map(function (n, i) { return '<button class="' + (i === 1 ? 'on' : '') + '" data-n="' + n + '">+' + n + ' mnt</button>'; }).join('') + '</div><p class="small muted mt-12">Berlaku langsung pada sinkron berikutnya di layar peserta, termasuk bila melewati jadwal selesai.</p>',
        actions: [{ label: 'Batal' }, { label: 'Tambah Waktu', icon: 'more_time', cls: 'btn-forest', onClick: async function (close, body) { const n = +$('[data-mn] .on', body).dataset.n; const r = await P.ask('mon.extend', h ? { h: h, menit: n } : { id: id, menit: n }); if (r) { close(); tarik(true); } else return false; } }] });
      P.on(mo.body, 'click', '[data-n]', function (e, b) { $$('[data-n]', mo.body).forEach(function (x) { x.classList.toggle('on', x === b); }); });
    }
    async function ekspor() {
      const r = await P.api('log.list', { id: id });
      if (!r.success) return P.toast(r.message, 'err');
      await App.loadModule('pdf');
      await window.PDFKit.tabel('Log Pelanggaran — ' + data.ujian.nama, [{ h: 'Waktu', k: function (x) { return P.fmtTgl(x.waktu); } }, { h: 'Peserta', k: 'nama' }, { h: 'NIS', k: 'nis' }, { h: 'Kelas', k: 'kelas' }, { h: 'Jenis', k: 'jenis' }, { h: 'Ke-', k: 'ke' }, { h: 'Audio', k: 'audio' }], r.data, { institusi: App.institusi(), sub: data.ujian.mapel + ' • ' + r.data.length + ' kejadian' });
    }
    async function detailPeserta(h) {
      const p = data.peserta.filter(function (x) { return x.h === h; })[0]; if (!p) return;
      const d = P.drawer(p.nama, '<div class="skel" style="height:300px"></div>');
      const lg = await P.api('log.list', { id: id });
      const logs = lg.success ? lg.data.filter(function (l) { return l.sis === p.sis; }) : [];
      const dq = p.state === 'dq', aktif = p.state !== 'selesai' && !dq;
      d.body.innerHTML = '<div class="row" style="gap:14px"><span class="av ' + (p.level === 'kritis' ? 'bad' : P.avColor(p.nama)) + '" style="width:54px;height:54px;font-size:18px">' + esc(p.inisial) + '</span><div><div class="small muted">NIS ' + esc(p.nis) + ' • ' + esc(p.kelas) + '</div><div class="mt-8">' + stateBadge(p) + '</div></div></div>' +
        '<div class="grid-2 mt-16" style="gap:8px">' + [['Progres', p.n + '/' + p.N + ' soal'], ['Pelanggaran', p.viol + (p.batas ? ' / ' + p.batas : '')], ['Mulai', p.mulai ? P.fmtJam(p.mulai) + ' WIB' : '-'], ['Sisa waktu', p.sisa !== null && aktif ? P.fmtDur(p.sisa) : '-'], ['Tambahan waktu', (p.tam || 0) + ' mnt'], ['Terakhir aktif', p.seen ? P.fmtRelatif(p.seen) : '-']].map(function (x) { return '<div class="inset" style="padding:10px 12px"><div class="tiny muted">' + x[0] + '</div><b>' + x[1] + '</b></div>'; }).join('') + '</div>' +
        '<h3 class="mt-24">Tindakan Pengawas</h3><div class="col mt-12">' +
          (aktif ? '<label class="field"><span>Pesan pribadi ke layar peserta</span><textarea class="textarea" data-msg style="min-height:70px" placeholder="Contoh: ' + esc(p.nama.split(' ')[0]) + ', mohon fokus ke layar ujian."></textarea></label><button class="btn btn-gold" data-a="warn">' + ic('notifications_active') + '<span>Kirim Peringatan</span></button>' +
            '<div class="row"><button class="btn btn-soft grow" data-a="ext">' + ic('more_time') + '<span>Tambah Waktu</span></button><button class="btn btn-soft grow" data-a="reset">' + ic('restart_alt') + '<span>Reset Login</span></button></div>' : '') +
          (dq ? '<button class="btn btn-forest" data-a="restore">' + ic('settings_backup_restore') + '<span>Batalkan Diskualifikasi</span></button>' : aktif ? '<button class="btn btn-danger" data-a="dq">' + ic('block') + '<span>Diskualifikasi Peserta</span></button>' : '') +
          (!aktif ? '<a class="btn btn-soft" href="#/hasil/' + encodeURIComponent(id) + '">' + ic('analytics') + '<span>Lihat Hasil & Jawaban</span></a>' : '') + '</div>' +
        '<h3 class="mt-24">Kronologi Pelanggaran (' + logs.length + ')</h3><div class="col mt-12" style="gap:6px">' +
          (logs.length ? logs.map(function (l) { return '<div class="inset row between" style="padding:10px 12px"><div class="row">' + ic(l.jenis === 'Pindah Tab' ? 'tab' : l.jenis === 'Keluar Fullscreen' ? 'fullscreen_exit' : 'visibility_off') + '<span><b>#' + l.ke + '</b> ' + esc(l.jenis) + '</span></div><span class="tiny muted">' + P.fmtJam(l.waktu) + ' • audio ' + esc(l.audio) + '</span></div>'; }).join('') : '<div class="inset small muted">Belum ada pelanggaran tercatat.</div>') + '</div>';
      P.on(d.body, 'click', '[data-a]', async function (e, b) {
        const a = b.dataset.a;
        if (a === 'warn') { const m = $('[data-msg]', d.body).value.trim(); await P.busy(b, function () { return kirimPeringatan(h, m || undefined); }); $('[data-msg]', d.body).value = ''; }
        if (a === 'ext') { d.close(); tambahWaktu(h); }
        if (a === 'reset' && await P.confirmDlg('Buka kunci perangkat <b>' + esc(p.nama) + '</b>? Peserta bisa login dari perangkat lain; perangkat lama akan dikeluarkan. Jawaban tetap tersimpan.', { ok: 'Reset Login' })) { await P.busy(b, function () { return P.ask('mon.reset', { h: h }); }); tarik(true); }
        if (a === 'dq') {
          const m = P.modal({ title: 'Diskualifikasi ' + p.nama + '?', size: 'sm', body: '<p class="small muted">Sesi peserta langsung dikunci & jawaban dikirim dengan status Diskualifikasi. Tindakan tercatat di audit log.</p><label class="field mt-12"><span>Alasan (wajib)</span><input class="input" data-al placeholder="Contoh: membuka catatan / bekerja sama"></label>',
            actions: [{ label: 'Batal' }, { label: 'Diskualifikasi', cls: 'btn-danger', icon: 'block', onClick: async function (close, body) { const al = $('[data-al]', body).value.trim(); if (!al) { P.toast('Isi alasan diskualifikasi.', 'warn'); return false; } const r = await P.ask('mon.dq', { h: h, alasan: al }); if (r) { close(); d.close(); tarik(true); } else return false; } }] });
          return m;
        }
        if (a === 'restore') {
          P.modal({ title: 'Batalkan Diskualifikasi', size: 'sm', body: '<p class="small muted">Pilih tindak lanjut:</p><label class="check mt-12"><input type="radio" name="rs" value="nilai" checked> Hitung nilai dari jawaban terakhir (sesi tetap selesai)</label><label class="check mt-8"><input type="radio" name="rs" value="lanjut"> Izinkan melanjutkan ujian (bila waktu masih ada) — hitungan pelanggaran direset</label>',
            actions: [{ label: 'Batal' }, { label: 'Pulihkan', cls: 'btn-forest', onClick: async function (close, body) { const lanjut = $('input[name=rs]:checked', body).value === 'lanjut'; const r = await P.ask('mon.restore', { h: h, lanjut: lanjut }); if (r) { close(); d.close(); tarik(true); } else return false; } }] });
        }
      });
    }
    P.on(v, 'click', '.dots [data-det]', function (e, b) { detailPeserta(b.dataset.det); });
    await tarik(false);
    const t = setInterval(function () { if (!ctx.alive()) return clearInterval(t); renderDur(); if (P.Activity.due('mon', 8000, 30000)) tarik(false); }, 1000);
  };

  // ============================================================ HALAMAN: JADWAL UJIAN
  PAGES.jadwal = function (ctx) {
    let filter = 'semua', q = K.qJadwal || '', list = [];
    K.qJadwal = '';
    const fokus = ctx.args[0] || '';
    ctx.page.innerHTML = '';
    const v = el('<div><div class="page-h"><div><h1>Jadwal Ujian</h1><p>Atur sesi, token akses, durasi, dan batas toleransi pelanggaran</p></div><button class="btn btn-gold" data-new>' + ic('add_circle') + '<span>Buat Ujian Baru</span></button></div>' +
      '<div class="card row wrap mb-16" style="padding:12px;gap:10px"><div class="seg" data-seg></div><label class="input-ico grow" style="min-width:200px">' + ic('search') + '<input class="input" data-q placeholder="Cari nama ujian, mapel, kelas, token…" style="background:var(--canvas)" value="' + esc(q) + '"></label></div>' +
      '<div class="stack" data-list><div class="card skel" style="height:140px"></div><div class="card skel" style="height:140px"></div></div></div>');
    ctx.page.appendChild(v);
    $('[data-new]', v).onclick = function () { K.formUjian(null); };
    $('[data-q]', v).addEventListener('input', P.debounce(function (e) { q = e.target.value.toLowerCase(); render(); }, 150));
    Admin.onSearch = function (s) { q = s.toLowerCase(); $('[data-q]', v).value = s; render(); };
    function render() {
      const cnt = { semua: list.length, Aktif: 0, Draft: 0, Selesai: 0 };
      list.forEach(function (u) { cnt[u.status] = (cnt[u.status] || 0) + 1; });
      $('[data-seg]', v).innerHTML = ['semua', 'Aktif', 'Draft', 'Selesai'].map(function (s) { return '<button class="' + (filter === s ? 'on' : '') + '" data-s="' + s + '">' + (s === 'semua' ? 'Semua' : s) + ' (' + (cnt[s] || 0) + ')</button>'; }).join('');
      $$('[data-s]', v).forEach(function (b) { b.onclick = function () { filter = b.dataset.s; render(); }; });
      const rows = list.filter(function (u) { return (filter === 'semua' || u.status === filter) && (!q || (u.nama + ' ' + u.namaMapel + ' ' + u.kelas + ' ' + u.token + ' ' + u.ruang).toLowerCase().indexOf(q.toLowerCase()) > -1); });
      $('[data-list]', v).innerHTML = rows.length ? rows.map(kartuJadwal).join('') : '<div class="card">' + K.kosong('event_note', list.length ? 'Tidak ada jadwal yang cocok.' : 'Belum ada jadwal ujian.', list.length ? '' : '<button class="btn btn-gold mt-16" data-new3>' + ic('add_circle') + '<span>Buat Ujian Pertama</span></button>') + '</div>';
      const n3 = $('[data-new3]', v); if (n3) n3.onclick = function () { K.formUjian(null); };
      if (fokus) { const f = $('[data-id="' + fokus + '"]', v); if (f) { f.scrollIntoView({ block: 'center' }); f.style.boxShadow = '0 0 0 3px var(--gold)'; } }
    }
    function kartuJadwal(u) {
      const now = P.serverNow(), berjalan = u.status === 'Aktif' && u.mulai <= now && u.selesai >= now;
      return '<article class="card" data-id="' + esc(u.id) + '"><div class="row between wrap" style="align-items:flex-start;gap:14px"><div style="min-width:0;flex:1"><div class="row wrap" style="gap:6px">' + (berjalan ? '<span class="badge b-ok"><i class="dot pulse"></i>Berlangsung</span>' : P.statusBadge(u.status)) +
        '<span class="badge b-mute">' + esc(u.namaMapel) + '</span>' + (u.kelas ? '<span class="badge b-mute">' + ic('groups') + esc(u.kelas) + '</span>' : '<span class="badge b-warn">Semua kelas</span>') + (isAdmin() ? '<span class="badge b-mute">' + ic('person') + esc(u.namaGuru) + '</span>' : '') + '</div>' +
        '<h3 class="mt-8">' + esc(u.nama) + '</h3><div class="row wrap small muted mt-8" style="gap:14px"><span>' + ic('event') + ' ' + P.fmtTgl(u.mulai) + ' → ' + P.fmtTgl(u.selesai) + '</span><span>' + ic('timer') + ' ' + u.durasi + ' mnt</span>' +
        '<span>' + ic('gpp_maybe') + ' Batas ' + (u.batas || '∞') + ' pelanggaran</span><span>' + ic(u.suara ? 'volume_up' : 'volume_off') + ' Suara ' + (u.suara ? (u.gender || 'default') : 'mati') + '</span>' + (u.ruang ? '<span>' + ic('meeting_room') + ' ' + esc(u.ruang) + '</span>' : '') + '</div></div>' +
        '<div class="col" style="align-items:flex-end"><div class="row"><span class="tiny muted">TOKEN</span><span class="tok" style="font-size:16px;padding:4px 12px">' + esc(u.token) + '</span><button class="btn btn-ghost btn-icon btn-sm" data-copy="' + esc(u.token) + '" title="Salin token">' + ic('content_copy') + '</button></div>' +
        '<div class="row wrap" style="justify-content:flex-end">' +
          (u.status === 'Draft' ? '<button class="btn btn-forest btn-sm" data-st="Aktif" data-u="' + esc(u.id) + '">' + ic('play_arrow') + '<span>Aktifkan</span></button>' : '') +
          (u.status === 'Aktif' ? '<a class="btn btn-gold btn-sm" href="#/monitor/' + encodeURIComponent(u.id) + '">' + ic('videocam') + '<span>Pantau</span></a><button class="btn btn-soft btn-sm" data-st="Selesai" data-u="' + esc(u.id) + '">' + ic('stop_circle') + '<span>Tutup</span></button>' : '') +
          (u.status === 'Selesai' ? '<a class="btn btn-white btn-sm" href="#/hasil/' + encodeURIComponent(u.id) + '">' + ic('analytics') + '<span>Hasil</span></a><button class="btn btn-soft btn-sm" data-st="Aktif" data-u="' + esc(u.id) + '">' + ic('replay') + '<span>Buka Lagi</span></button>' : '') +
          '<button class="btn btn-soft btn-sm btn-icon" data-edit="' + esc(u.id) + '" title="Edit">' + ic('edit') + '</button><button class="btn btn-soft btn-sm btn-icon" data-del="' + esc(u.id) + '" title="Hapus">' + ic('delete') + '</button></div></div></div></article>';
    }
    P.on(v, 'click', '[data-copy]', function (e, b) { navigator.clipboard && navigator.clipboard.writeText(b.dataset.copy).then(function () { P.toast('Token ' + b.dataset.copy + ' disalin.'); }); });
    P.on(v, 'click', '[data-edit]', function (e, b) { K.formUjian(list.filter(function (u) { return u.id === b.dataset.edit; })[0]); });
    P.on(v, 'click', '[data-st]', async function (e, b) {
      const u = list.filter(function (x) { return x.id === b.dataset.u; })[0], st = b.dataset.st;
      const pesan = st === 'Aktif' ? 'Aktifkan <b>' + esc(u.nama) + '</b>? Peserta dapat login dengan token <span class="tok">' + esc(u.token) + '</span> sesuai jadwal. Notifikasi jadwal dikirim ke siswa (bila diaktifkan).' : 'Tutup ujian <b>' + esc(u.nama) + '</b>? Peserta tidak bisa login lagi; yang sedang mengerjakan tetap bisa menyelesaikan.';
      if (!await P.confirmDlg(pesan, { ok: st === 'Aktif' ? 'Aktifkan' : 'Tutup Ujian' })) return;
      const r = await P.busy(b, function () { return P.ask('ujian.status', { id: u.id, status: st }, { invalidate: ['ujian.list', 'dash.summary', 'boot'] }); });
      if (r) load(true);
    });
    P.on(v, 'click', '[data-del]', async function (e, b) {
      const u = list.filter(function (x) { return x.id === b.dataset.del; })[0];
      if (!await P.confirmDlg('Hapus jadwal <b>' + esc(u.nama) + '</b>? Hanya bisa bila belum ada peserta.', { ok: 'Hapus', danger: true })) return;
      const r = await P.ask('ujian.delete', { id: u.id }, { invalidate: ['ujian.list', 'dash.summary'] });
      if (r) { list = list.filter(function (x) { return x.id !== u.id; }); render(); }
    });
    function load(force) { return P.SWR.load('ujian.list', {}, 30000, function (d) { if (d && ctx.alive()) { list = d; render(); } }, { force: force }); }
    load(false);
    K.onUjianSaved = function () { load(true); };
  };

  /** Formulir buat/edit ujian (dipakai Dashboard, Jadwal, tombol CTA). */
  K.formUjian = async function (u) {
    const [mp, kl] = await P.fetchMany([['mapel.list', {}], ['kelas.list', {}]]);
    const mapel = mp.success ? mp.data : [], kelas = kl.success ? kl.data : [];
    if (!mapel.length) {
      return P.modal({ title: 'Belum ada mata pelajaran', size: 'sm', body: '<p>Buat mata pelajaran & isi bank soal terlebih dahulu sebelum menjadwalkan ujian.</p>', actions: [{ label: 'Tutup' }, { label: 'Ke Bank Soal', cls: 'btn-forest', onClick: function (c) { c(); P.Router.go('bank-soal'); } }] });
    }
    const x = u || { durasi: 90, batas: 3, acakSoal: true, acakOpsi: true, suara: true, tampilNilai: true, mulai: Math.ceil(P.serverNow() / 1800000) * 1800000 + 1800000 };
    if (!u) x.selesai = x.mulai + 2 * 3600e3;
    const pilihKelas = String(x.kelas || '').split(',').map(function (k) { return k.trim(); }).filter(String);
    const body = el('<form class="col gap-16" novalidate>' +
      '<label class="field"><span>Nama ujian</span><input class="input" name="nama" required maxlength="150" value="' + esc(x.nama || '') + '" placeholder="Contoh: UAS Matematika Diskrit — Sesi 1"></label>' +
      '<div class="grid-2"><label class="field"><span>Mata pelajaran</span><select class="select" name="mapel">' + mapel.map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === x.mapel ? ' selected' : '') + ' data-n="' + m.soal + '">' + esc(m.nama) + ' (' + m.soal + ' soal)</option>'; }).join('') + '</select></label>' +
        '<label class="field"><span>Ruang / lokasi</span><input class="input" name="ruang" value="' + esc(x.ruang || '') + '" placeholder="Lab Komputer A"></label></div>' +
      '<div class="grid-2"><label class="field"><span>Dibuka (WIB)</span><input class="input" type="datetime-local" name="mulai" value="' + P.toLocalInput(x.mulai) + '"></label><label class="field"><span>Ditutup (WIB)</span><input class="input" type="datetime-local" name="selesai" value="' + P.toLocalInput(x.selesai) + '"></label></div>' +
      '<div class="grid-3"><label class="field"><span>Durasi (menit)</span><input class="input" type="number" min="5" max="600" name="durasi" value="' + x.durasi + '"></label>' +
        '<label class="field"><span>Batas pelanggaran</span><input class="input" type="number" min="0" max="20" name="batas" value="' + x.batas + '"><span class="hint">0 = tanpa batas</span></label>' +
        '<label class="field"><span>Jumlah soal</span><input class="input" type="number" min="0" name="jumlahSoal" value="' + (x.jumlahSoal || 0) + '"><span class="hint" data-nsoal></span></label></div>' +
      '<div class="field"><span>Kelas peserta</span><div class="row wrap" style="gap:6px" data-kelas>' + kelas.map(function (k) { return '<button type="button" class="chip' + (pilihKelas.indexOf(k.kelas) > -1 ? ' on' : '') + '" data-k="' + esc(k.kelas) + '">' + esc(k.kelas) + '<span class="n">' + k.jumlah + '</span></button>'; }).join('') +
        (kelas.length ? '' : '<span class="small muted">Belum ada data kelas siswa.</span>') + '</div><span class="hint">Tidak memilih kelas = semua siswa aktif boleh ikut.</span></div>' +
      '<div class="grid-2"><label class="field"><span>Token akses</span><div class="row"><input class="input mono" name="token" maxlength="16" value="' + esc(x.token || '') + '" placeholder="Otomatis bila kosong" style="text-transform:uppercase;letter-spacing:.1em"><button type="button" class="btn btn-soft btn-icon" data-acak title="Acak token">' + ic('casino') + '</button></div></label>' +
        '<label class="field"><span>Suara peringatan</span><select class="select" name="gender"><option value="">Default institusi</option><option' + (x.gender === 'Perempuan' ? ' selected' : '') + '>Perempuan</option><option' + (x.gender === 'Laki-laki' ? ' selected' : '') + '>Laki-laki</option></select></label></div>' +
      '<div class="inset row wrap" style="gap:18px">' + [['acakSoal', 'Acak urutan soal'], ['acakOpsi', 'Acak urutan opsi'], ['suara', 'Alarm & suara peringatan'], ['tampilNilai', 'Tampilkan nilai ke siswa']].map(function (s) { return '<label class="switch"><input type="checkbox" name="' + s[0] + '"' + (x[s[0]] ? ' checked' : '') + '><i></i>' + s[1] + '</label>'; }).join('') + '</div>' +
      '<label class="field"><span>Instruksi tambahan (opsional)</span><textarea class="textarea" name="instruksi" maxlength="3000" placeholder="Tampil di halaman instruksi sebelum ujian dimulai">' + esc(x.instruksi || '') + '</textarea></label></form>');
    function nsoal() { const o = body.mapel.selectedOptions[0]; $('[data-nsoal]', body).textContent = '0 = semua (' + (o ? o.dataset.n : 0) + ' tersedia)'; }
    body.mapel.onchange = nsoal; nsoal();
    P.on(body, 'click', '[data-k]', function (e, b) { b.classList.toggle('on'); });
    $('[data-acak]', body).onclick = function () { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; let t = ''; const r = crypto.getRandomValues(new Uint8Array(6)); r.forEach(function (n) { t += c[n % c.length]; }); body.token.value = t; };
    P.modal({ title: u ? 'Edit Jadwal Ujian' : 'Buat Jadwal Ujian', size: 'lg', body: body,
      actions: [{ label: 'Batal' }, { label: u ? 'Simpan Perubahan' : 'Simpan sebagai Draft', icon: 'save', cls: 'btn-gold', onClick: async function (close) {
        const f = body, data = { id: u && u.id, nama: f.nama.value.trim(), mapel: f.mapel.value, ruang: f.ruang.value.trim(), mulai: P.fromLocalInput(f.mulai.value), selesai: P.fromLocalInput(f.selesai.value),
          durasi: +f.durasi.value, batas: +f.batas.value, jumlahSoal: +f.jumlahSoal.value, token: f.token.value.trim(), gender: f.gender.value,
          kelas: $$('[data-k].on', f).map(function (b) { return b.dataset.k; }).join(', '), acakSoal: f.acakSoal.checked, acakOpsi: f.acakOpsi.checked, suara: f.suara.checked, tampilNilai: f.tampilNilai.checked, instruksi: f.instruksi.value };
        if (!data.nama) { P.toast('Nama ujian wajib diisi.', 'warn'); f.nama.focus(); return false; }
        const r = await P.ask('ujian.save', { ujian: data }, { invalidate: ['ujian.list', 'dash.summary'] });
        if (!r) return false;
        close();
        if (K.onUjianSaved && P.Router.cur && P.Router.cur.name === 'jadwal') K.onUjianSaved(); else P.Router.go('jadwal/' + r.id);
      } }] });
  };
})();
