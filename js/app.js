/*
 * ProctorCBT — app.js
 * Halaman login (Peserta: token + NIS/NISN · Guru/Admin: email + sandi),
 * pemuatan modul per peran (siswa hanya mengunduh modul ujian), dan pemulihan sesi.
 */
(function () {
  'use strict';
  const P = window.PCBT, esc = P.esc, ic = P.ic, el = P.el, $ = P.$;
  const root = document.getElementById('app');
  const App = window.App = { info: P.LS.get('pubinfo') || { NAMA_INSTITUSI: 'STIS Al Wafa Bogor' } };

  App.loadModule = function (name) { return P.loadScript('./js/' + name + '.js?v=' + P.VERSION); };
  App.institusi = function () { return App.info.NAMA_INSTITUSI || 'ProctorCBT'; };

  /** Payload token (bukan rahasia; tanda tangan diverifikasi server). */
  App.tokenPayload = function () {
    try { const p = String(P.Sesi.token || '').split('.')[1]; let b = p.replace(/-/g, '+').replace(/_/g, '/'); while (b.length % 4) b += '=';
      return JSON.parse(decodeURIComponent(escape(atob(b)))); } catch (e) { return {}; }
  };

  P.setAuthLost(function (msg) {
    if (window.Exam && window.Exam.active && window.Exam.active()) return;     // jangan putus di tengah ujian
    P.Sesi.clear();
    App.showLogin({ pesan: msg || 'Sesi berakhir. Silakan login kembali.', tab: 'staf' });
  });

  // Audio & suara harus "dibuka" lewat gestur pengguna (klik) — dipakai modul ujian
  App.unlockAudio = function () {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (AC && !window.__pcbtAC) window.__pcbtAC = new AC();
      if (window.__pcbtAC && window.__pcbtAC.state === 'suspended') window.__pcbtAC.resume();
      if ('speechSynthesis' in window) { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; speechSynthesis.speak(u); }
    } catch (e) { /* abaikan */ }
  };
  App.enterFullscreen = function () {
    const d = document.documentElement, fn = d.requestFullscreen || d.webkitRequestFullscreen;
    if (fn && !(document.fullscreenElement || document.webkitFullscreenElement)) { try { const p = fn.call(d, { navigationUI: 'hide' }); if (p && p.catch) p.catch(function () {}); } catch (e) { /* abaikan */ } }
  };

  // ---------------------------------------------------------------- LOGIN
  App.showLogin = function (o) {
    o = o || {};
    document.title = 'ProctorCBT — Login Sesi Ujian';
    const tab = o.tab || P.LS.get('tabLogin') || 'siswa';
    root.innerHTML = '';
    const v = el(
      '<div class="login"><div class="login-bg" aria-hidden="true"></div>' +
      '<main class="glass" aria-labelledby="ttl">' +
        '<div class="brand-row"><div class="brand-mark">' + ic('verified_user', 'fill') + '</div><div><div class="brand-name">ProctorCBT</div><div class="brand-sub" data-inst>' + esc(App.institusi()) + '</div></div></div>' +
        '<h1 id="ttl">Login</h1><p class="sub">Selamat datang, masukkan kredensial sesi Anda</p>' +
        '<div class="tabs-glass" role="tablist"><button type="button" role="tab" data-tab="siswa">Peserta Ujian</button><button type="button" role="tab" data-tab="staf">Guru &amp; Admin</button></div>' +
        '<form id="fSiswa" class="col gap-12" autocomplete="off" novalidate>' +
          '<label class="g-input tok"><span class="sr">Token akses ujian</span><input name="token" placeholder="Token Akses Ujian" maxlength="16" required autocapitalize="characters" spellcheck="false" inputmode="text">' + ic('vpn_key') + '</label>' +
          '<label class="g-input"><span class="sr">NIS atau NISN</span><input name="nis" placeholder="Nomor Induk Siswa (NIS/NISN)" maxlength="30" required inputmode="numeric">' + ic('person') + '</label>' +
          '<label class="g-check"><input type="checkbox" name="fs" checked> Mode Layar Penuh Terkunci</label>' +
          '<button class="btn-login" type="submit"><span>Mulai Ujian</span></button>' +
        '</form>' +
        '<form id="fStaf" class="col gap-12 hidden" novalidate>' +
          '<label class="g-input"><span class="sr">Email</span><input name="email" type="email" placeholder="Email" autocomplete="username" required>' + ic('mail') + '</label>' +
          '<label class="g-input"><span class="sr">Kata sandi</span><input name="password" type="password" placeholder="Kata sandi" autocomplete="current-password" required>' +
            '<button type="button" class="g-link" data-eye style="position:absolute;right:12px;top:50%;transform:translateY(-50%);text-decoration:none" aria-label="Tampilkan sandi">' + ic('visibility') + '</button></label>' +
          '<button class="btn-login" type="submit"><span>Masuk Dashboard</span></button>' +
        '</form>' +
        '<div class="g-msg" role="alert"></div>' +
        '<div class="g-note hidden" data-ann></div>' +
        '<p style="text-align:center;margin-top:16px;font-size:13px;color:rgba(255,255,255,.82)">Butuh bantuan pengawas? <button type="button" class="g-link" data-help>Bantuan</button></p>' +
        '<p class="g-foot">Portal Ujian Terproteksi • <b data-inst2>' + esc(App.institusi()) + '</b></p>' +
      '</main>' +
      '<button class="btn btn-white btn-sm install-pill hidden" data-install>' + ic('install_mobile') + '<span>Pasang Aplikasi</span></button>' +
      '</div>');
    root.appendChild(v);
    const msg = $('.g-msg', v);
    function showMsg(t) { msg.textContent = t || ''; msg.classList.toggle('show', !!t); }
    function setTab(t) {
      P.LS.set('tabLogin', t);
      v.querySelectorAll('[data-tab]').forEach(function (b) { b.classList.toggle('on', b.dataset.tab === t); b.setAttribute('aria-selected', b.dataset.tab === t); });
      $('#fSiswa', v).classList.toggle('hidden', t !== 'siswa');
      $('#fStaf', v).classList.toggle('hidden', t !== 'staf');
      showMsg('');
      const f = $(t === 'siswa' ? '#fSiswa input' : '#fStaf input', v); if (f && !('ontouchstart' in window)) f.focus();
    }
    v.querySelectorAll('[data-tab]').forEach(function (b) { b.onclick = function () { setTab(b.dataset.tab); }; });
    setTab(tab);
    if (o.pesan) showMsg(o.pesan);
    if (!P.configOk()) showMsg('Konfigurasi belum lengkap: isi GAS_URL di js/config.js dengan URL /exec Apps Script Anda.');

    $('[data-eye]', v).onclick = function () { const i = $('#fStaf [name=password]', v); i.type = i.type === 'password' ? 'text' : 'password'; this.innerHTML = ic(i.type === 'password' ? 'visibility' : 'visibility_off'); };
    $('[data-help]', v).onclick = function () {
      P.modal({ title: 'Bantuan Login', size: 'sm', body:
        '<ul class="rules">' +
        '<li>' + ic('vpn_key') + '<span><b>Token ujian</b> diberikan pengawas di ruang ujian (huruf/angka, tidak peka huruf besar-kecil).</span></li>' +
        '<li>' + ic('badge') + '<span>Isi <b>NIS/NISN</b> sesuai data sekolah. Boleh dengan atau tanpa awalan "NISN-".</span></li>' +
        '<li>' + ic('devices') + '<span>Satu akun hanya bisa aktif di <b>satu perangkat</b>. Pindah perangkat? Minta pengawas menekan <b>Reset Login</b>.</span></li>' +
        '<li>' + ic('front_hand') + '<span>Ada kendala teknis? <b>Angkat tangan</b> dan lapor pengawas ruang.</span></li></ul>',
        actions: [{ label: 'Mengerti', cls: 'btn-forest' }] });
    };
    const ib = $('[data-install]', v);
    function cekInstall() { ib.classList.toggle('hidden', !(P.canInstall() && !P.isStandalone())); }
    cekInstall(); document.addEventListener('pcbt:installable', cekInstall);
    ib.onclick = P.promptInstall;

    // ---- submit peserta
    $('#fSiswa', v).addEventListener('submit', async function (e) {
      e.preventDefault();
      const f = e.target, token = f.token.value.trim().toUpperCase(), nis = f.nis.value.trim(), btn = $('button[type=submit]', f);
      if (!token || !nis) return showMsg('Silakan masukkan Token Ujian dan NIS/NISN terlebih dahulu.');
      if (!f.fs.checked) return showMsg('Anda wajib menyetujui mode layar penuh terkunci untuk memulai.');
      showMsg('');
      App.unlockAudio();                                    // gestur klik → audio peringatan diizinkan browser
      App.loadModule('exam').catch(function () {});        // muat paralel dengan login
      const lbl = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span><span>Memeriksa sesi…</span>';
      const r = await P.api('auth.siswa', { token: token, nis: nis, device: P.deviceId() }, { noAuth: true });
      btn.disabled = false; btn.innerHTML = lbl;
      if (!r.success) return showMsg(r.message);
      P.Sesi.save({ token: r.data.token, me: r.data.me, ujian: r.data.ujian, selesai: !!r.data.selesai, exp: Date.now() + 8 * 3600e3 });
      if (!r.data.selesai) App.enterFullscreen();
      await App.loadModule('exam');
      window.Exam.afterLogin(r.data);
    });

    // ---- submit staf
    $('#fStaf', v).addEventListener('submit', async function (e) {
      e.preventDefault();
      const f = e.target, btn = $('button[type=submit]', f);
      if (!f.email.value.trim() || !f.password.value) return showMsg('Email dan kata sandi wajib diisi.');
      showMsg('');
      App.loadModule('admin').catch(function () {});
      const lbl = btn.innerHTML; btn.disabled = true; btn.innerHTML = '<span class="spin"></span><span>Masuk…</span>';
      const r = await P.api('auth.login', { email: f.email.value.trim(), password: f.password.value, appUrl: location.origin + location.pathname.replace(/index\.html$/, '') }, { noAuth: true });
      btn.disabled = false; btn.innerHTML = lbl;
      if (!r.success) return showMsg(r.message);
      P.Sesi.save({ token: r.data.token, me: r.data.me, exp: r.data.exp });
      await App.loadModule('admin');
      window.Admin.start(true);
    });

    // ---- info publik (nama institusi, pengumuman) — SWR, plus warmup server
    P.warmUpServer('pub');
    P.SWR.load('pub.info', {}, 600000, function (d) {
      if (!d) return;
      App.info = d; P.LS.set('pubinfo', d);
      v.querySelectorAll('[data-inst],[data-inst2]').forEach(function (x) { x.textContent = App.institusi(); });
      const ann = $('[data-ann]', v);
      ann.textContent = d.PENGUMUMAN_LOGIN || ''; ann.classList.toggle('hidden', !d.PENGUMUMAN_LOGIN);
    });
    // Unduh lebih dulu modul sesuai tab terakhir (masuk cache service worker)
    setTimeout(function () {
      ['exam', 'admin'].forEach(function (m) { const l = document.createElement('link'); l.rel = 'prefetch'; l.href = './js/' + m + '.js?v=' + P.VERSION; document.head.appendChild(l); });
    }, 1200);
  };

  // ---------------------------------------------------------------- MULAI
  async function start() {
    const s = P.Sesi.data;
    if (!s || !s.token || (s.exp && s.exp < Date.now())) { if (s) P.Sesi.clear(); return App.showLogin(s ? { pesan: 'Sesi berakhir. Silakan login kembali.' } : {}); }
    root.innerHTML = '<div style="min-height:100vh;display:flex;align-items:center;justify-content:center"><span class="spin" style="color:var(--forest);width:28px;height:28px"></span></div>';
    try {
      if (s.me.role === 'Siswa') { await App.loadModule('exam'); window.Exam.resume(); }
      else { await App.loadModule('admin'); window.Admin.start(false); }
    } catch (e) { root.innerHTML = '<div class="empty">' + ic('wifi_off') + 'Gagal memuat aplikasi. Periksa koneksi lalu muat ulang.<br><br><button class="btn btn-forest" onclick="location.reload()">Muat ulang</button></div>'; }
  }
  App.logout = async function () {
    P.api('auth.logout', {}, { noAuth: true });
    P.Sesi.clear();
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    location.hash = '';
    App.showLogin();
  };
  start();
})();
