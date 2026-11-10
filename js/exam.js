/*
 * ProctorCBT — exam.js  (ruang ujian siswa)
 * Instruksi → layar penuh terkunci → soal PG/Essay → navigasi Terjawab/Ragu/Belum →
 * timer server → autosave terenkripsi (AES-GCM) + sinkron berkala → deteksi pelanggaran
 * (pindah tab, keluar fullscreen, blur) + alarm & suara peringatan bertingkat →
 * submit manual/otomatis → hasil / diskualifikasi.
 */
(function () {
  'use strict';
  const P = window.PCBT, App = window.App, esc = P.esc, ic = P.ic, el = P.el, $ = P.$, $$ = P.$$;
  const root = document.getElementById('app');
  const Exam = window.Exam = {};
  let S = null;                         // state sesi ujian berjalan
  const timers = [];

  Exam.active = function () { return !!(S && !S.done); };

  // =============================================================== PENYIMPANAN LOKAL TERENKRIPSI
  const enc = new TextEncoder(), dec = new TextDecoder();
  function b64(buf) { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function unb64(s) { const bin = atob(s), b = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) b[i] = bin.charCodeAt(i); return b; }
  const Vault = {
    key: null, h: '',
    init: async function (h) {
      this.h = h;
      if (!(window.crypto && crypto.subtle)) return;
      const raw = await crypto.subtle.digest('SHA-256', enc.encode('pcbt|' + P.deviceId() + '|' + h + '|v1'));
      this.key = await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
    },
    save: async function (obj) {
      const json = JSON.stringify(obj);
      if (!this.key) return P.LS.set('ans:' + this.h, { p: btoa(unescape(encodeURIComponent(json))) });
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, this.key, enc.encode(json));
      P.LS.set('ans:' + this.h, { iv: b64(iv), ct: b64(ct) });
    },
    load: async function () {
      const v = P.LS.get('ans:' + this.h);
      if (!v) return null;
      try {
        if (v.p) return JSON.parse(decodeURIComponent(escape(atob(v.p))));
        if (!this.key) return null;
        const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(v.iv) }, this.key, unb64(v.ct));
        return JSON.parse(dec.decode(pt));
      } catch (e) { return null; }
    },
    clear: function () { P.LS.del('ans:' + this.h); P.LS.del('vq:' + this.h); P.LS.del('ex:' + this.h); }
  };
  async function gzip64(str) {
    if (!('CompressionStream' in window) || str.length < 1500) return null;
    try { const s = new Blob([str]).stream().pipeThrough(new CompressionStream('gzip')); return b64(await new Response(s).arrayBuffer()); } catch (e) { return null; }
  }

  // =============================================================== AUDIO: ALARM + SUARA (TTS / file)
  const Suara = {
    voices: [],
    ctx: function () { const AC = window.AudioContext || window.webkitAudioContext; if (!window.__pcbtAC && AC) window.__pcbtAC = new AC(); return window.__pcbtAC; },
    aktif: function () { return S && S.suara && S.suara.aktif; },
    out: function (c) {                      // kompresor → volume rata (tidak memekakkan, tetap terdengar di headset)
      if (!c.__comp) { const k = c.createDynamicsCompressor(); k.threshold.value = -18; k.knee.value = 12; k.ratio.value = 6; k.connect(c.destination); c.__comp = k; }
      return c.__comp;
    },
    alarm: function () {
      if (!this.aktif()) return false;
      const c = this.ctx(); if (!c) return false;
      if (c.state === 'suspended') c.resume();
      try {
        const t = c.currentTime, g = c.createGain(); g.connect(this.out(c));
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t + 0.04);
        g.gain.setValueAtTime(0.32, t + 1.25); g.gain.exponentialRampToValueAtTime(0.0001, t + 1.45);
        ['sawtooth', 'square'].forEach(function (type, i) {
          const o = c.createOscillator(); o.type = type; o.connect(g);
          for (let k = 0; k < 4; k++) { o.frequency.setValueAtTime(i ? 660 : 880, t + k * 0.36); o.frequency.linearRampToValueAtTime(i ? 990 : 1320, t + k * 0.36 + 0.18); }
          o.start(t); o.stop(t + 1.5);
        });
      } catch (e) { return false; }
      return c.state === 'running';
    },
    beep: function (f) {
      const c = this.ctx(); if (!c) return;
      try { const t = c.currentTime, o = c.createOscillator(), g = c.createGain(); o.frequency.value = f || 880; g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.2, t + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35); o.connect(g); g.connect(this.out(c)); o.start(t); o.stop(t + 0.4); } catch (e) { /* abaikan */ }
    },
    pilihSuara: function (gender) {
      if (!('speechSynthesis' in window)) return null;
      if (!this.voices.length) this.voices = speechSynthesis.getVoices();
      const id = this.voices.filter(function (v) { return /^id|ind/i.test(v.lang); });
      const pria = /andika|ardi|male|pria|laki|budi|rizky/i, wanita = /gadis|damayanti|female|wanita|perempuan|google|siti/i;
      const cocok = id.filter(function (v) { return gender === 'Laki-laki' ? pria.test(v.name) : wanita.test(v.name) || !pria.test(v.name); });
      return { voice: cocok[0] || id[0] || null, pitchFix: !cocok.length };
    },
    /** Level: 1 netral, 2 tegas, 3 peringatan terakhir (satu sebelum batas). */
    level: function (n) { const b = S.ujian.batas; if (b > 0 && n >= b - 1) return 3; return n <= 1 ? 1 : 2; },
    bicara: function (lv, jenis) {
      const self = this;
      return new Promise(function (resolve) {
        if (!self.aktif()) return resolve(false);
        const items = S.suara.items || [];
        const it = items.filter(function (x) { return x.j === jenis && x.lv === lv; })[0] || items.filter(function (x) { return x.j === 'Semua' && x.lv === lv; })[0] || items[0];
        if (!it) return resolve(false);
        if (it.url) {
          const a = new Audio(it.url); a.volume = 1;
          a.play().then(function () { resolve(true); }, function () { self.tts(it.teks, resolve); });
          return;
        }
        self.tts(it.teks, resolve);
      });
    },
    tts: function (teks, done) {
      if (!('speechSynthesis' in window) || !teks) return done(false);
      try {
        speechSynthesis.cancel();
        const u = new SpeechSynthesisUtterance(teks), pv = this.pilihSuara(S.suara.gender);
        u.lang = 'id-ID'; u.rate = 1; u.volume = 1;
        if (pv && pv.voice) u.voice = pv.voice;
        u.pitch = pv && pv.pitchFix ? (S.suara.gender === 'Laki-laki' ? 0.75 : 1.2) : 1;
        let ok = false; u.onstart = function () { ok = true; done(true); };
        u.onerror = function () { if (!ok) done(false); };
        speechSynthesis.speak(u);
        setTimeout(function () { if (!ok) done(speechSynthesis.speaking); }, 1500);
      } catch (e) { done(false); }
    }
  };
  if ('speechSynthesis' in window) speechSynthesis.onvoiceschanged = function () { Suara.voices = speechSynthesis.getVoices(); };

  // =============================================================== ALUR MASUK
  Exam.afterLogin = function (d) {
    if (d.selesai) return showResult();
    showInstruksi();
  };
  Exam.resume = function () {
    const s = P.Sesi.data, tp = App.tokenPayload();
    if (s.selesai) return showResult();
    if (P.LS.get('ex:' + tp.h)) return startRoom(true);
    showInstruksi();
  };

  function showInstruksi() {
    const s = P.Sesi.data, u = s.ujian || {}, me = s.me || {};
    document.title = 'Instruksi — ' + (u.nama || 'Ujian');
    root.innerHTML = '';
    const v = el('<div class="exam"><div class="ex-top">' + topIdentity(u, me) +
      '<button class="btn btn-on-dark btn-sm" data-out>' + ic('logout') + '<span>Keluar</span></button></div>' +
      '<div class="instr card" style="padding:30px">' +
        '<span class="label">Instruksi Ujian</span><h1 style="margin-top:6px">' + esc(u.nama) + '</h1>' +
        '<p class="muted" style="margin-top:4px">' + esc(u.mapel) + (u.ruang ? ' • ' + esc(u.ruang) : '') + '</p>' +
        '<div class="grid-3 mt-16">' +
          infoCell('timer', 'Durasi', u.durasi + ' menit') + infoCell('quiz', 'Jumlah Soal', u.jumlahSoal + ' butir') +
          infoCell('gpp_maybe', 'Batas Pelanggaran', u.batas > 0 ? u.batas + ' kali' : 'Tidak dibatasi') + '</div>' +
        (u.instruksi ? '<div class="inset mt-16" style="white-space:pre-wrap">' + esc(u.instruksi) + '</div>' : '') +
        '<ul class="rules">' +
          '<li>' + ic('fullscreen') + '<span>Ujian berjalan dalam <b>layar penuh terkunci</b>. Keluar dari layar penuh dicatat sebagai pelanggaran.</span></li>' +
          '<li>' + ic('tab') + '<span>Dilarang <b>berpindah tab/aplikasi</b>. Setiap pelanggaran memicu alarm, suara peringatan, dan tercatat di log pengawas.</span></li>' +
          '<li>' + ic('content_copy') + '<span>Salin-tempel, klik kanan, dan pintasan developer <b>dinonaktifkan</b>.</span></li>' +
          '<li>' + ic('cloud_done') + '<span>Jawaban <b>tersimpan otomatis</b> di perangkat (terenkripsi) & dikirim ke server berkala — aman walau koneksi putus.</span></li>' +
          '<li>' + ic('flag') + '<span>Tandai <b>Ragu-ragu</b> untuk soal yang ingin dicek ulang. Ujian terkirim otomatis saat waktu habis' + (u.batas > 0 ? ' atau setelah <b>' + u.batas + ' pelanggaran</b> (diskualifikasi)' : '') + '.</span></li>' +
          '<li>' + ic('volume_up') + '<span>Pastikan suara perangkat menyala atau headset terpasang.</span></li>' +
        '</ul>' +
        '<label class="check" style="margin:6px 0 18px"><input type="checkbox" data-agree> Saya telah membaca dan menyetujui tata tertib ujian.</label>' +
        '<button class="btn btn-gold btn-lg btn-block" data-start disabled>' + ic('lock') + '<span>Masuk Ruang Ujian & Kunci Layar</span></button>' +
      '</div></div>');
    root.appendChild(v);
    $('[data-agree]', v).onchange = function () { $('[data-start]', v).disabled = !this.checked; };
    $('[data-out]', v).onclick = function () { App.logout(); };
    $('[data-start]', v).onclick = function () {
      App.unlockAudio(); App.enterFullscreen();
      P.busy(this, function () { return startRoom(false); }, 'Menyiapkan soal…');
    };
  }
  function infoCell(icon, k, val) { return '<div class="inset"><div class="row muted small">' + ic(icon) + '<span>' + k + '</span></div><div style="font:700 17px var(--f-head);margin-top:4px">' + esc(val) + '</div></div>'; }
  function topIdentity(u, me) {
    return '<div class="ex-id"><div class="ex-shield">' + ic('verified_user') + '</div><div class="grow"><div class="row" style="gap:8px;flex-wrap:wrap"><span class="ex-title trunc">' + esc(u.nama || 'Ujian') + '</span>' +
      (me.kelas ? '<span class="ex-kls">' + esc(me.kelas) + '</span>' : '') + '</div><div class="ex-meta">' + ic('badge') + '<b>' + esc(me.nama) + '</b><span style="opacity:.4">•</span><span class="mono">NIS: ' + esc(me.nis) + '</span></div></div></div>';
  }

  // =============================================================== RUANG UJIAN
  async function startRoom(resume) {
    const tp = App.tokenPayload();
    const r = await P.api('exam.start', {}, { timeout: 45000 });
    if (!r.success) {
      if (r.code === 'AUTH') { P.Sesi.clear(); return App.showLogin({ pesan: r.message }); }
      if (resume) { root.innerHTML = '<div class="result-wrap"><div class="res-card" style="text-align:center"><h2>Gagal memuat ujian</h2><p class="muted mt-8">' + esc(r.message) + '</p><button class="btn btn-forest mt-16" onclick="location.reload()">' + ic('refresh') + '<span>Coba lagi</span></button></div></div>'; return; }
      P.toast(r.message, 'err'); return;
    }
    const d = r.data;
    if (d.cmd === 'dq' || d.cmd === 'done') { P.Sesi.patch({ selesai: true }); return showResult(); }
    if (d.cmd === 'kicked') return kicked();
    await Vault.init(tp.h);
    const lokal = await Vault.load();
    S = {
      h: tp.h, ujian: d.ujian, siswa: d.siswa, soal: d.soal, idx: 0, ans: Object.assign({}, d.jawaban || {}, (lokal && lokal.ans) || {}),
      rev: (lokal && lokal.rev) || 0, sentRev: -1, viol: d.viol || 0, pendingV: P.LS.get('vq:' + tp.h) || [], deadline: d.deadline,
      suara: d.suara || { aktif: false, items: [] }, syncMs: Math.max(10, d.syncDetik || 20) * 1000, idleMs: (d.idleMenit || 3) * 60000,
      lastInput: Date.now(), online: navigator.onLine, lastSync: 0, graceUntil: Date.now() + 2500, done: false, warned: {}, seenBc: P.LS.get('bc:' + tp.h) || ''
    };
    if (lokal && typeof lokal.idx === 'number' && lokal.idx < S.soal.length) S.idx = lokal.idx;
    if (S.rev === 0) S.rev = 1;
    P.LS.set('ex:' + S.h, 1);
    document.title = S.ujian.nama + ' — Ruang Ujian';
    renderRoom();
    pasangPenjaga();
    if (d.bc) tampilSiaran(d.bc);
    const jitter = Math.floor(Math.random() * 4000);           // sebar beban server saat semua mulai bersamaan
    timers.push(setTimeout(function () { sync('awal'); timers.push(setInterval(function () { sync('berkala'); }, S.syncMs)); }, 2000 + jitter));
    timers.push(setInterval(tickTimer, 1000));
    tickTimer();
    // permintaan fullscreen dari klik "Mulai" bisa masih tertunda → beri jeda sebelum memeriksa
    timers.push(setTimeout(cekLayarPenuh, 900));
  }

  function renderRoom() {
    const u = S.ujian, me = P.Sesi.data.me || {};
    root.innerHTML = '';
    const v = el('<div class="exam" id="room">' +
      '<header class="ex-top">' + topIdentity(u, me) +
        '<div class="timer" data-timer>' + ic('timer') + '<span class="t" data-t>--:--:--</span><span class="tiny" style="color:var(--gold-soft);letter-spacing:.06em">TERSISA</span></div>' +
        '<div class="row" style="gap:10px"><span class="save-pill" data-save><i class="d"></i><span class="tx">Tersimpan ke Lokal & Cloud</span></span>' +
        '<button class="btn btn-finish btn-sm" data-finish>' + ic('exit_to_app') + '<span>Selesaikan Ujian</span></button></div>' +
      '</header>' +
      '<div data-bc></div>' +
      '<div class="ex-grid"><section>' +
        '<div class="ex-sub"><div class="row wrap"><span class="badge b-forest" style="font-size:13px;padding:6px 14px" data-no></span><span class="badge b-mute" data-bobot></span><span class="badge b-mute" data-tipe></span></div>' +
          '<div class="row"><button class="btn btn-soft btn-sm qdrawer-btn" data-qnav>' + ic('grid_view') + '<span>Daftar Soal</span></button><button class="btn btn-warn btn-sm" data-ragu>' + ic('flag') + '<span>Tandai Ragu-ragu</span></button></div></div>' +
        '<article class="qbox" data-q></article>' +
        '<div class="shield"><div class="row" style="gap:12px"><div class="ic">' + ic('security') + '</div><div><div class="row wrap" style="gap:8px"><b style="font-family:var(--f-head)">Proctor Integrity Shield Aktif</b><span class="badge" data-vbadge></span></div>' +
          '<div class="small" style="opacity:.9;margin-top:2px">Layar penuh terkunci. Berpindah tab atau aplikasi dicatat sebagai pelanggaran resmi.</div></div></div>' +
          '<span class="badge b-warn mono hidden" data-fsinfo>' + ic('fullscreen') + '<span>Layar penuh</span></span></div>' +
      '</section>' +
      '<aside class="ex-aside" data-aside><div class="navcard">' +
        '<div class="row between"><div class="row">' + ic('grid_view') + '<h3>Navigasi Soal</h3></div><span class="badge b-mute mono" data-total></span></div>' +
        '<div class="nav-legend"><div><i style="background:var(--ok-bg);box-shadow:inset 0 0 0 4px var(--ok-bg),inset 0 0 0 7px var(--ok)"></i><b data-cAns>0</b> Terjawab</div>' +
          '<div><i style="background:var(--warn-bg);box-shadow:inset 0 0 0 2px #f59e0b"></i><b data-cRagu>0</b> Ragu-ragu</div><div><i style="background:var(--s-high)"></i><b data-cKosong>0</b> Belum Dijawab</div></div>' +
        '<div class="qnums" data-nums></div>' +
        '<div class="conn"><span class="av sm c3">' + ic('wifi') + '</span><div class="grow"><b class="small" data-conn>Terhubung</b><div class="tiny muted" data-connsub>Sinkron otomatis</div></div></div>' +
        '<button class="btn btn-soft btn-block mt-12 qdrawer-btn" data-closenav>' + ic('close') + '<span>Tutup</span></button>' +
      '</div></aside></div></div>');
    root.appendChild(v);
    S.v = v;
    $('[data-total]', v).textContent = S.soal.length + ' Butir';
    // tombol angka dibuat sekali; selanjutnya hanya kelas yang diperbarui (cepat)
    const nums = $('[data-nums]', v);
    nums.innerHTML = S.soal.map(function (q, i) { return '<button class="qn" data-go="' + i + '" aria-label="Soal ' + (i + 1) + '">' + (i + 1) + '</button>'; }).join('');
    P.on(nums, 'click', '[data-go]', function (e, b) { goto(+b.dataset.go); $('[data-aside]', v).classList.remove('open'); });
    $('[data-ragu]', v).onclick = toggleRagu;
    $('[data-finish]', v).onclick = konfirmasiSelesai;
    $('[data-qnav]', v).onclick = function () { $('[data-aside]', v).classList.add('open'); };
    $('[data-closenav]', v).onclick = function () { $('[data-aside]', v).classList.remove('open'); };
    renderSoal(); renderNav(); renderViol(); renderSave();
  }

  function cur() { return S.soal[S.idx]; }
  function jaw(id) { return S.ans[id] || {}; }
  function terisi(id) { const a = S.ans[id]; return !!(a && String(a.v || '').trim()); }

  function renderSoal() {
    const q = cur(), a = jaw(q.id), v = S.v;
    $('[data-no]', v).innerHTML = 'Soal No. ' + q.no + ' <span style="opacity:.6;font-weight:500">/ ' + S.soal.length + '</span>';
    $('[data-bobot]', v).textContent = 'Bobot: ' + q.b + ' Poin';
    $('[data-tipe]', v).textContent = q.t === 'PG' ? 'Pilihan Ganda' : 'Essay';
    const rg = $('[data-ragu]', v);
    rg.className = 'btn btn-sm ' + (a.r ? 'btn-gold' : 'btn-warn');
    rg.querySelector('span:last-child').textContent = a.r ? 'Ditandai Ragu-ragu' : 'Tandai Ragu-ragu';
    const box = $('[data-q]', v);
    let h = '<div class="label row" style="gap:6px">' + ic(q.t === 'PG' ? 'psychology' : 'edit_note') + '<span>' + (q.t === 'PG' ? 'Pilih satu jawaban yang paling tepat' : 'Tulis jawaban Anda dengan lengkap') + '</span></div>' +
      '<div class="q-text mt-12">' + esc(q.q) + '</div>' + (q.g ? '<img class="q-img" src="' + esc(q.g) + '" alt="Gambar soal" referrerpolicy="no-referrer" draggable="false">' : '');
    if (q.t === 'PG') {
      h += '<div class="optlist" role="radiogroup">' + q.o.map(function (o, i) {
        const label = String.fromCharCode(65 + i), on = a.v === o.k;
        return '<button type="button" class="opt' + (on ? ' on' : '') + '" role="radio" aria-checked="' + on + '" data-k="' + esc(o.k) + '"><span class="k">' + label + '</span><span class="t">' + esc(o.t) +
          (on ? '<span class="tiny" style="display:block;color:var(--gold-deep);font-weight:600;margin-top:2px">Jawaban Anda saat ini</span>' : '') + '</span><span class="r">' + (on ? ic('check') : '') + '</span></button>';
      }).join('') + '</div>';
    } else {
      h += '<textarea class="essay" data-essay placeholder="Ketik jawaban essay Anda di sini…" spellcheck="false">' + esc(a.v || '') + '</textarea><div class="row between tiny muted mt-8"><span>Tersimpan otomatis saat mengetik</span><span data-cc>' + String(a.v || '').length + ' karakter</span></div>';
    }
    h += '<div class="q-foot"><button class="btn btn-soft" data-prev ' + (S.idx === 0 ? 'disabled' : '') + '>' + ic('arrow_back') + '<span>Soal Sebelumnya</span></button>' +
      '<div class="row"><button class="btn btn-warn" data-ragu2>' + ic('flag') + '<span>Ragu-ragu</span></button>' +
      (S.idx < S.soal.length - 1 ? '<button class="btn btn-forest" data-next><span>Soal Berikutnya</span>' + ic('arrow_forward') + '</button>'
        : '<button class="btn btn-gold" data-done>' + ic('task_alt') + '<span>Selesai & Periksa</span></button>') + '</div></div>';
    box.innerHTML = h;
    box.querySelectorAll('[data-k]').forEach(function (b) { b.onclick = function () { pilih(b.dataset.k); }; });
    const ta = $('[data-essay]', box);
    if (ta) {
      const simpan = P.debounce(function () { setJawab(ta.value); }, 350);
      ta.addEventListener('input', function () { $('[data-cc]', box).textContent = ta.value.length + ' karakter'; S.lastInput = Date.now(); simpan(); });
      ta.addEventListener('blur', function () { setJawab(ta.value); });
    }
    $('[data-prev]', box).onclick = function () { goto(S.idx - 1); };
    const nx = $('[data-next]', box); if (nx) nx.onclick = function () { goto(S.idx + 1); };
    const dn = $('[data-done]', box); if (dn) dn.onclick = konfirmasiSelesai;
    $('[data-ragu2]', box).onclick = toggleRagu;
    box.scrollIntoView({ block: 'nearest' });
  }
  function renderNav() {
    let nAns = 0, nRagu = 0;
    $$('.qn', S.v).forEach(function (b, i) {
      const q = S.soal[i], a = jaw(q.id), isi = terisi(q.id);
      if (isi) nAns++; if (a.r) nRagu++;
      b.className = 'qn' + (i === S.idx ? ' cur' : a.r ? ' ragu' : isi ? ' ans' : '');
    });
    $('[data-cAns]', S.v).textContent = nAns; $('[data-cRagu]', S.v).textContent = nRagu; $('[data-cKosong]', S.v).textContent = S.soal.length - nAns;
  }
  function jumlahViol() { return S.viol + S.pendingV.length; }
  function renderViol() {
    const n = jumlahViol(), b = S.ujian.batas, el2 = $('[data-vbadge]', S.v);
    el2.className = 'badge ' + (n === 0 ? 'b-ok' : b > 0 && n >= b - 1 ? 'b-bad' : 'b-warn');
    el2.textContent = 'Pelanggaran ' + n + (b > 0 ? ' / ' + b : '');
  }
  function renderSave(state) {
    if (!S || !S.v) return;
    const p = $('[data-save]', S.v), tx = $('.tx', p);
    state = state || (!S.online ? 'off' : S.rev > S.sentRev ? 'lokal' : 'ok');
    p.className = 'save-pill' + (state === 'off' ? ' off' : state === 'busy' || state === 'lokal' ? ' busy' : '');
    tx.textContent = state === 'off' ? 'Offline — tersimpan di perangkat' : state === 'busy' ? 'Menyimpan ke cloud…' : state === 'lokal' ? 'Tersimpan lokal' : 'Tersimpan ke Lokal & Cloud';
    $('[data-conn]', S.v).textContent = S.online ? 'Terhubung ke server' : 'Koneksi terputus';
    $('[data-connsub]', S.v).textContent = S.lastSync ? 'Sinkron terakhir ' + P.fmtJam(P.serverNow() - (Date.now() - S.lastSync)) + ' WIB' : 'Menunggu sinkron pertama…';
  }

  function goto(i) {
    if (i < 0 || i >= S.soal.length) return;
    const ta = $('[data-essay]', S.v); if (ta) setJawab(ta.value, true);
    S.idx = i; S.lastInput = Date.now();
    renderSoal(); renderNav(); simpanLokal();
  }
  function pilih(k) { const q = cur(); S.ans[q.id] = Object.assign({}, jaw(q.id), { v: k }); ubah(); renderSoal(); renderNav(); }
  function setJawab(text, diam) {
    const q = cur(); if (q.t !== 'Essay') return;
    const lama = jaw(q.id).v || '';
    if (lama === text) return;
    S.ans[q.id] = Object.assign({}, jaw(q.id), { v: text }); ubah(); if (!diam) renderNav(); else renderNav();
  }
  function toggleRagu() { const q = cur(), a = jaw(q.id); S.ans[q.id] = Object.assign({}, a, { r: a.r ? 0 : 1 }); ubah(); renderSoal(); renderNav(); }
  function ubah() { S.rev++; S.lastInput = Date.now(); simpanLokal(); renderSave(); }
  const simpanLokal = P.debounce(function () { if (S) Vault.save({ rev: S.rev, ans: S.ans, idx: S.idx }); }, 250);

  // =============================================================== TIMER (berdasar jam server)
  function sisaDetik() { return Math.floor((S.deadline - P.serverNow()) / 1000); }
  function tickTimer() {
    if (!S || S.done) return;
    const s = sisaDetik(), t = $('[data-t]', S.v), box = $('[data-timer]', S.v);
    t.textContent = P.fmtDur(s);
    box.classList.toggle('low', s <= 300);
    [[600, '10 menit'], [300, '5 menit'], [60, '1 menit']].forEach(function (w) {
      if (s <= w[0] && s > w[0] - 5 && !S.warned[w[0]]) { S.warned[w[0]] = 1; P.toast('Waktu tersisa ' + w[1] + '. Periksa kembali jawaban Anda.', 'warn', 6000); Suara.beep(660); }
    });
    if (s <= 0 && !S.submitting) kirim('waktu');
  }

  // =============================================================== SINKRON
  async function sync(alasan) {
    if (!S || S.done || S.submitting || S.syncing) return;
    S.syncing = true;
    const kirimJawab = S.rev > S.sentRev, rev = S.rev, vKirim = S.pendingV.slice(0, 10);
    const ans = S.soal.length ? S.ans : {};
    let nAns = 0, nRagu = 0; S.soal.forEach(function (q) { if (terisi(q.id)) nAns++; if (jaw(q.id).r) nRagu++; });
    const data = { rev: rev, v: vKirim, hb: { c: S.idx + 1, n: nAns, N: S.soal.length, r: nRagu, f: document.visibilityState === 'visible' && document.hasFocus() ? 1 : 0,
      i: Math.round((Date.now() - S.lastInput) / 1000), net: (navigator.connection && navigator.connection.effectiveType) || '' } };
    if (kirimJawab) { const json = JSON.stringify(ans), gz = await gzip64(json); if (gz) { data.a = gz; data.z = 1; } else data.a = json; }
    if (kirimJawab) renderSave('busy');
    const r = await P.api('exam.sync', data, { timeout: 25000 });
    S.syncing = false;
    if (!S || S.done) return;
    if (!r.success) {
      S.online = r.code === 'NET' ? false : S.online;
      renderSave();
      if (r.code === 'AUTH') { tampilKunci('Sesi tidak valid', 'Token sesi berakhir atau dicabut. Hubungi pengawas.', true); }
      return;
    }
    S.online = true; S.lastSync = Date.now();
    const d = r.data || {};
    if (d.cmd) return perintah(d.cmd, d);
    if (kirimJawab && d.rev >= rev) S.sentRev = Math.max(S.sentRev, rev);
    if (vKirim.length) { const ids = vKirim.map(function (x) { return x.id; }); S.pendingV = S.pendingV.filter(function (x) { return ids.indexOf(x.id) === -1; }); P.LS.set('vq:' + S.h, S.pendingV); }
    if (typeof d.viol === 'number') S.viol = d.viol;
    if (d.deadline && d.deadline !== S.deadline) { if (d.deadline > S.deadline) P.toast('Pengawas menambah waktu ujian Anda.', '', 5000); S.deadline = d.deadline; }
    (d.msgs || []).forEach(tampilPesan);
    if (d.bc) tampilSiaran(d.bc);
    renderViol(); renderSave();
  }
  function perintah(cmd, d) {
    if (cmd === 'dq') return selesai(true);
    if (cmd === 'done') return selesai(false);
    if (cmd === 'timeup') return kirim('waktu');
    if (cmd === 'kicked') return kicked();
    if (cmd === 'start') return startRoom(true);
  }
  function tampilPesan(m) {
    Suara.beep(990); setTimeout(function () { Suara.beep(990); }, 250);
    P.modal({ title: 'Pesan dari Pengawas', size: 'sm', dismiss: false, body: '<div class="row" style="align-items:flex-start;gap:12px"><span class="av bad">' + ic('campaign') + '</span><div><p style="font-size:15px;font-weight:600">' + esc(m.m) + '</p><p class="tiny muted mt-8">' + esc(m.dari || 'Pengawas') + ' • ' + P.fmtJam(m.t) + ' WIB</p></div></div>',
      actions: [{ label: 'Saya mengerti', cls: 'btn-forest', onClick: function (close) { close(); App.enterFullscreen(); } }] });
  }
  function tampilSiaran(bc) {
    if (!bc || !S || !S.v) return;
    const box = $('[data-bc]', S.v);
    box.innerHTML = '<div class="bc-banner">' + ic('campaign') + '<span class="grow">' + esc(bc.m) + '</span><span class="tiny" style="opacity:.75">' + P.fmtJam(bc.t) + '</span></div>';
    if (S.seenBc !== bc.id) { S.seenBc = bc.id; P.LS.set('bc:' + S.h, bc.id); Suara.beep(880); P.toast('Pengumuman pengawas: ' + bc.m, 'warn', 6000); }
  }

  // =============================================================== PENJAGA INTEGRITAS
  const BLOK = /^(F12|F5)$/;
  function pasangPenjaga() {
    const ac = new AbortController(), o = { signal: ac.signal };
    S.ac = ac;
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'hidden') { if (!S.unloading) pelanggaran('Pindah Tab', 'halaman tersembunyi'); }
      else { if (S.ucapNanti) { const lv = S.ucapNanti; S.ucapNanti = 0; setTimeout(function () { ucapkan(lv); }, 350); } sync('kembali'); }
    }, o);
    window.addEventListener('blur', function () {
      setTimeout(function () { if (S && !S.done && document.visibilityState === 'visible' && !document.hasFocus() && !S.unloading) pelanggaran('Blur Focus', 'jendela kehilangan fokus'); }, 400);
    }, o);
    ['fullscreenchange', 'webkitfullscreenchange'].forEach(function (ev) {
      document.addEventListener(ev, function () {
        const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
        if (!fs && S.fsWajib && !S.unloading && !S.done) pelanggaran('Keluar Fullscreen', 'mode layar penuh ditinggalkan');
        $('[data-fsinfo]', S.v).classList.toggle('hidden', !fs);
      }, o);
    });
    document.addEventListener('contextmenu', function (e) { e.preventDefault(); }, o);
    ['copy', 'cut', 'paste', 'drop', 'dragstart', 'selectstart'].forEach(function (ev) {
      document.addEventListener(ev, function (e) { if (ev === 'selectstart' && e.target.closest && e.target.closest('.essay')) return; e.preventDefault(); if (ev !== 'selectstart' && ev !== 'dragstart') P.toast('Salin-tempel dinonaktifkan selama ujian.', 'warn'); }, o);
    });
    document.addEventListener('keydown', function (e) {
      const k = e.key || '', ctrl = e.ctrlKey || e.metaKey;
      const devtools = BLOK.test(k) || (ctrl && e.shiftKey && /^[ijckICJK]$/.test(k)) || (ctrl && e.altKey && /^[ijIJ]$/.test(k));
      const pintas = ctrl && /^[cvxupsaCVXUPSA]$/.test(k) && !(k.toLowerCase() === 'a' && e.target.closest && e.target.closest('.essay'));
      if (devtools || pintas || (ctrl && k === 'r') || (e.altKey && k === 'ArrowLeft')) { e.preventDefault(); e.stopPropagation(); P.toast('Pintasan keyboard dinonaktifkan selama ujian.', 'warn', 1800); return; }
      S.lastInput = Date.now();
      if (!ctrl && !e.altKey && !(e.target.closest && e.target.closest('.essay'))) {           // navigasi cepat keyboard
        if (k === 'ArrowRight') goto(S.idx + 1); else if (k === 'ArrowLeft') goto(S.idx - 1);
        else if (/^[a-dA-D]$/.test(k) && cur().t === 'PG') { const o2 = cur().o[k.toUpperCase().charCodeAt(0) - 65]; if (o2) pilih(o2.k); }
      }
    }, Object.assign({ capture: true }, o));
    document.addEventListener('keyup', function (e) { if (e.key === 'PrintScreen') { try { navigator.clipboard.writeText(''); } catch (x) { /* abaikan */ } P.toast('Tangkapan layar tidak diizinkan selama ujian.', 'warn'); } }, o);
    ['pointerdown', 'touchstart', 'wheel'].forEach(function (ev) { document.addEventListener(ev, function () { S.lastInput = Date.now(); }, Object.assign({ passive: true }, o)); });
    window.addEventListener('beforeunload', function (e) {
      if (!S || S.done) return;
      S.unloading = true; setTimeout(function () { if (S) S.unloading = false; }, 1500);   // muat ulang bukan pelanggaran
      Vault.save({ rev: S.rev, ans: S.ans, idx: S.idx });
      e.preventDefault(); e.returnValue = '';
    }, o);
    window.addEventListener('online', function () { S.online = true; renderSave(); sync('online'); }, o);
    window.addEventListener('offline', function () { S.online = false; renderSave(); P.toast('Koneksi terputus. Jawaban tetap tersimpan aman di perangkat.', 'warn', 5000); }, o);
  }
  function lepasPenjaga() { if (S && S.ac) S.ac.abort(); timers.forEach(function (t) { clearInterval(t); clearTimeout(t); }); timers.length = 0; }

  /** Kumpulkan peristiwa beruntun (mis. pindah tab sekaligus keluar fullscreen) menjadi 1 pelanggaran. */
  function pelanggaran(jenis, ket) {
    if (!S || S.done || S.submitting || Date.now() < S.graceUntil) return;
    if (S.burst) { if (S.burst.lain.indexOf(jenis) === -1 && jenis !== S.burst.jenis) S.burst.lain.push(jenis); return; }
    const alarm = Suara.alarm();
    S.burst = { jenis: jenis, lain: [], t: P.serverNow(), audio: alarm, ket: ket };
    setTimeout(catatPelanggaran, 1200);
  }
  function catatPelanggaran() {
    const b = S.burst; S.burst = null;
    if (!S || S.done) return;
    const v = { id: P.uuid(), j: b.jenis, t: b.t, a: b.audio ? 1 : 0, k: b.lain.length ? 'bersamaan: ' + b.lain.join(', ') : b.ket };
    S.pendingV.push(v); P.LS.set('vq:' + S.h, S.pendingV);
    const n = jumlahViol(), lv = Suara.level(n);
    renderViol();
    tampilModalPelanggaran(n, b.jenis, v);
    if (document.visibilityState === 'visible') ucapkan(lv, b.jenis); else S.ucapNanti = lv;
    if (S.ujian.batas > 0 && n >= S.ujian.batas) { tampilKunci('Batas pelanggaran tercapai', 'Mengirim lembar jawaban ke server…'); sync('batas').then(function () { if (S && !S.done) kirim('pelanggaran'); }); }
    else sync('pelanggaran');
  }
  function ucapkan(lv, jenis) { Suara.bicara(lv, jenis || 'Semua'); }

  let vModal = null;
  function tampilModalPelanggaran(n, jenis, v) {
    if (vModal) vModal.close();
    const b = S.ujian.batas, sisa = b > 0 ? Math.max(0, b - n) : null;
    const judul = jenis === 'Keluar Fullscreen' ? 'Keluar dari Layar Penuh Terdeteksi!' : jenis === 'Blur Focus' ? 'Jendela Ujian Kehilangan Fokus!' : 'Perpindahan Tab / Jendela Terdeteksi!';
    const body = el('<div class="vmodal-body" style="text-align:center">' +
      '<div class="v-ico"><span>' + ic('warning') + '</span></div>' +
      '<span class="badge b-bad" style="letter-spacing:.08em;text-transform:uppercase"><i class="dot pulse"></i>Pelanggaran Terdeteksi (Peringatan ' + n + (b > 0 ? ' / ' + b : '') + ')</span>' +
      '<h2 style="margin-top:14px;font-size:22px;line-height:28px">' + judul + '</h2>' +
      '<p class="muted mt-8" style="line-height:1.6">Aktivitas browser Anda tercatat oleh sistem pengawas otomatis <b style="color:var(--ink)">ProctorCBT</b>. Tetaplah di jendela resmi ujian.</p>' +
      (b > 0 ? '<div class="v-quota"><div class="row" style="justify-content:center;color:var(--warn);font:700 15px var(--f-head)">' + ic('gpp_maybe') + '<span>Sisa Batas Toleransi: <span style="color:var(--err)">' + (sisa > 0 ? sisa + ' Kali Lagi' : 'Habis') + '</span></span></div>' +
        '<p class="tiny muted mt-8">Jika pelanggaran mencapai ' + b + ' kali, sesi ujian dihentikan otomatis dan lembar jawaban dikirim paksa dengan status diskualifikasi.</p></div>' : '<div class="mt-16"></div>') +
      '<div class="v-log">' + ic('receipt_long') + ' ' + esc(jenis) + ' • ' + P.fmtJam(v.t) + ' WIB • Log #' + v.id.slice(0, 8).toUpperCase() + '</div>' +
      '</div>');
    vModal = P.modal({ body: body, size: 'sm', dismiss: false, focus: false, onClose: function () { vModal = null; },
      actions: [{ label: S.fsWajib ? 'Kembali ke Ujian & Kunci Layar Penuh' : 'Kembali ke Ujian', icon: 'fullscreen', cls: 'btn-forest btn-block', onClick: function (close) {
        S.graceUntil = Date.now() + 1500; App.enterFullscreen(); close();
      } }] });
    $('.modal', vModal.el).classList.add('vmodal');
  }

  function cekLayarPenuh() {
    const d = document.documentElement;
    S.fsWajib = !!(d.requestFullscreen || d.webkitRequestFullscreen) && (document.fullscreenEnabled || document.webkitFullscreenEnabled);
    const fs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (S.fsWajib && !fs) {
      // Browser hanya mengizinkan layar penuh lewat klik → minta peserta mengeklik (bukan pelanggaran)
      P.modal({ title: 'Kunci Layar Penuh', size: 'sm', dismiss: false, focus: false, body: '<p class="muted">Ujian harus dikerjakan dalam layar penuh. Klik tombol di bawah untuk melanjutkan.</p>',
        actions: [{ label: 'Masuk Layar Penuh', icon: 'fullscreen', cls: 'btn-forest btn-block', onClick: function (close) { S.graceUntil = Date.now() + 1500; App.unlockAudio(); App.enterFullscreen(); close(); } }] });
    }
  }

  // =============================================================== SELESAI / KIRIM
  function konfirmasiSelesai() {
    const ta = $('[data-essay]', S.v); if (ta) setJawab(ta.value, true);
    let kosong = 0, ragu = 0; S.soal.forEach(function (q) { if (!terisi(q.id)) kosong++; if (jaw(q.id).r) ragu++; });
    P.modal({ title: 'Selesaikan Ujian?', size: 'sm', body:
      '<div class="grid-2"><div class="inset" style="text-align:center"><div class="label">Belum Dijawab</div><b style="font:700 26px var(--f-head);color:' + (kosong ? 'var(--err)' : 'var(--ok)') + '">' + kosong + '</b></div>' +
      '<div class="inset" style="text-align:center"><div class="label">Ragu-ragu</div><b style="font:700 26px var(--f-head);color:var(--warn)">' + ragu + '</b></div></div>' +
      '<p class="muted mt-12">Setelah dikirim, jawaban tidak dapat diubah lagi.</p>',
      actions: [{ label: 'Periksa Lagi', cls: 'btn-soft' }, { label: 'Kirim Jawaban', icon: 'send', cls: 'btn-gold', onClick: function (close) { close(); kirim('manual'); } }] });
  }
  async function kirim(alasan) {
    if (!S || S.submitting || S.done) return;
    S.submitting = true;
    const ta = $('[data-essay]', S.v); if (ta) { const q = cur(); S.ans[q.id] = Object.assign({}, jaw(q.id), { v: ta.value }); }
    await Vault.save({ rev: S.rev, ans: S.ans, idx: S.idx });
    tampilKunci(alasan === 'waktu' ? 'Waktu habis' : alasan === 'pelanggaran' ? 'Batas pelanggaran tercapai' : 'Mengirim jawaban', 'Lembar jawaban sedang dikirim ke server. Jangan tutup halaman ini.');
    const json = JSON.stringify(S.ans), gz = await gzip64(json);
    for (let i = 0; i < 200; i++) {
      if (S.pendingV.length) { S.submitting = false; await sync('sebelum-kirim'); S.submitting = true; if (S.done) return; }
      const r = await P.api('exam.submit', gz ? { a: gz, z: 1, alasan: alasan } : { a: json, alasan: alasan }, { timeout: 45000 });
      if (r.success) { selesai(r.data.status === 'Diskualifikasi', r.data); return; }
      if (r.code === 'AUTH') { tampilKunci('Sesi berakhir', 'Hubungi pengawas. Jawaban Anda tersimpan aman di perangkat ini.', true); return; }
      const msg = $('[data-kunci-sub]'); if (msg) msg.textContent = (r.code === 'NET' ? 'Koneksi terputus' : r.message) + ' — mencoba lagi otomatis… (percobaan ' + (i + 1) + ')';
      await new Promise(function (res) { setTimeout(res, Math.min(15000, 3000 + i * 1000)); });
    }
  }
  function selesai(dq, hasil) {
    if (!S) return;
    S.done = true;
    lepasPenjaga();
    try { speechSynthesis.cancel(); } catch (e) { /* abaikan */ }
    Vault.clear();
    P.Sesi.patch({ selesai: true });
    if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(function () {});
    const kunci = document.querySelector('.lock-ovl'); if (kunci) kunci.remove();
    showResult(hasil);
  }
  function kicked() {
    if (S) { S.done = true; lepasPenjaga(); }
    tampilKunci('Sesi dipindahkan', 'Pengawas mereset login Anda. Sesi ujian sekarang hanya bisa dilanjutkan dari perangkat lain.', true);
  }
  function tampilKunci(judul, sub, keluar) {
    let o = document.querySelector('.lock-ovl');
    if (!o) { o = el('<div class="lock-ovl"><div style="max-width:440px"><span class="spin" style="width:34px;height:34px;color:var(--gold)"></span><h2 style="color:#fff;margin-top:18px" data-kunci-j></h2><p style="opacity:.85;margin-top:8px" data-kunci-sub></p><div data-kunci-btn class="mt-16"></div></div></div>'); document.body.appendChild(o); }
    $('[data-kunci-j]', o).textContent = judul; $('[data-kunci-sub]', o).textContent = sub;
    if (keluar) { $('.spin', o).classList.add('hidden'); $('[data-kunci-btn]', o).innerHTML = '<button class="btn btn-gold">' + ic('logout') + '<span>Keluar</span></button>'; $('[data-kunci-btn] button', o).onclick = function () { o.remove(); App.logout(); }; }
  }

  // =============================================================== HASIL & DISKUALIFIKASI
  async function showResult(pra) {
    lepasPenjaga();
    if (vModal) vModal.close();
    document.querySelectorAll('.ovl').forEach(function (o) { o.remove(); });   // modal pelanggaran/pesan tidak boleh menutupi hasil
    root.innerHTML = '<div class="result-wrap"><div class="res-card"><div class="skel" style="height:24px;width:60%;margin:0 auto"></div><div class="skel mt-16" style="height:160px"></div></div></div>';
    const r = await P.api('exam.result', {});
    if (!r.success) { root.innerHTML = '<div class="result-wrap"><div class="res-card" style="text-align:center"><h2>Hasil belum dapat dimuat</h2><p class="muted mt-8">' + esc(r.message) + '</p><div class="row mt-16" style="justify-content:center"><button class="btn btn-soft" onclick="location.reload()">Muat ulang</button><button class="btn btn-forest" data-out>Keluar</button></div></div></div>'; $('[data-out]').onclick = App.logout; return; }
    const d = r.data;
    S = null;
    document.title = 'Hasil Ujian — ' + d.ujian.nama;
    if (d.status === 'Diskualifikasi') return renderDq(d);
    const menunggu = d.status === 'Menunggu Koreksi Essay', persen = d.total ? Math.round(d.terjawab / d.total * 100) : 0;
    root.innerHTML = '';
    const v = el('<div class="result-wrap">' +
      '<header class="res-head"><div class="row"><span class="av c3">' + ic('verified_user', 'fill') + '</span><div><b style="font-family:var(--f-head)">' + esc(d.institusi) + '</b><div class="tiny muted">PROCTORCBT INTEGRITY SYSTEM</div></div></div>' +
        '<span class="badge ' + (menunggu ? 'b-warn' : 'b-ok') + '"><i class="dot"></i>' + esc(d.status) + '</span></header>' +
      '<div class="res-card" style="text-align:center">' +
        '<div class="res-hero" style="background:var(--ok-bg)"><span style="background:var(--forest)">' + ic('task_alt', 'fill') + '</span></div>' +
        '<h1>Ujian Selesai</h1><p class="muted mt-8">Terima kasih, <b style="color:var(--ink)">' + esc(d.siswa.nama) + '</b>. Lembar jawaban Anda sudah tersimpan di server.</p>' +
        (d.nilai !== null && d.nilai !== '' ? '<div class="mt-24"><div class="label">Nilai Akhir</div><div class="score-big mt-8">' + P.fmtNum(d.nilai) + '</div>' +
          (d.ringkas ? '<div class="row mt-12" style="justify-content:center;gap:8px"><span class="badge b-ok">' + d.ringkas.benar + ' benar</span><span class="badge b-bad">' + d.ringkas.salah + ' salah</span><span class="badge b-mute">' + d.ringkas.kosong + ' kosong</span></div>' : '') + '</div>'
          : '<div class="inset mt-24" style="text-align:left">' + ic('hourglass_top') + ' <b>' + (menunggu ? 'Nilai menunggu koreksi essay oleh guru.' : 'Nilai akan diumumkan oleh guru pengampu.') + '</b></div>') +
        '<div class="res-grid mt-24" style="text-align:left">' +
          cell('Identitas', d.siswa.nama, 'NIS: ' + d.siswa.nis + ' • ' + d.siswa.kelas) + cell('Mata Ujian', d.ujian.mapel, d.ujian.nama) +
          cell('Waktu Kirim', P.fmtJam(d.submit) + ' WIB', P.fmtTgl(d.submit, false)) + '</div>' +
        '<div class="inset mt-12" style="text-align:left"><div class="row between small"><span class="label">Soal Terjawab</span><b>' + d.terjawab + ' / ' + d.total + ' (' + persen + '%)</b></div><div class="bar mt-8"><i style="width:' + persen + '%"></i></div>' +
          '<div class="row between small mt-12"><span class="label">Pelanggaran Tercatat</span><b>' + d.viol + (d.batas > 0 ? ' / ' + d.batas : '') + '</b></div></div>' +
        '<div class="row mt-24" style="justify-content:center;flex-wrap:wrap">' +
          (d.status === 'Selesai' ? '<button class="btn btn-gold" data-pdf>' + ic('download') + '<span>Unduh Kartu Hasil (PDF)</span></button>' : '') +
          '<button class="btn btn-forest" data-out>' + ic('logout') + '<span>Keluar Sesi</span></button></div>' +
      '</div><p class="tiny muted" style="text-align:center">Dilindungi oleh ProctorCBT Multi-Layer Integrity Shield</p></div>');
    root.appendChild(v);
    $('[data-out]', v).onclick = App.logout;
    const pdf = $('[data-pdf]', v); if (pdf) pdf.onclick = function () { P.busy(pdf, async function () { await App.loadModule('pdf'); await window.PDFKit.kartuHasil(Object.assign({}, d, { appUrl: appUrl() })); }, 'Menyiapkan PDF…'); };
  }
  function cell(k, v, s) { return '<div class="res-cell"><div class="label">' + k + '</div><div class="trunc" style="font:700 15px var(--f-head);margin-top:4px">' + esc(v) + '</div><div class="small muted">' + esc(s) + '</div></div>'; }
  function appUrl() { return location.origin + location.pathname.replace(/index\.html$/, ''); }

  function renderDq(d) {
    const persen = d.total ? Math.round(d.terjawab / d.total * 100) : 0;
    root.innerHTML = '';
    const v = el('<div class="result-wrap">' +
      '<header class="res-head"><div class="row"><span class="av" style="background:var(--forest);color:#fff">' + ic('security', 'fill') + '</span><div><b style="font-family:var(--f-head);color:var(--forest-deep)">' + esc(d.institusi) + '</b><div class="tiny muted">PROCTORCBT INTEGRITY SYSTEM</div></div></div>' +
        '<div class="row wrap"><span class="badge b-bad"><i class="dot pulse"></i>SESI DIKUNCI / DISKUALIFIKASI</span><span class="badge b-mute">' + ic('schedule') + ' ' + P.fmtTgl(d.submit) + ' WIB</span></div></header>' +
      '<div class="res-card"><div style="text-align:center">' +
        '<div class="res-hero" style="background:var(--bad-bg);position:relative"><span style="background:var(--err)">' + ic('gavel', 'fill') + '</span></div>' +
        '<span class="badge b-mute" style="text-transform:uppercase;letter-spacing:.06em">' + ic('notification_important') + ' Protokol Penegakan Integritas Otomatis</span>' +
        '<h1 style="margin-top:12px;color:var(--forest-deep)">Sesi Ujian Dihentikan &amp; Diserahkan Otomatis</h1>' +
        '<p class="muted mt-12" style="max-width:640px;margin-left:auto;margin-right:auto;line-height:1.65">' + esc(d.alasan || 'Batas toleransi pelanggaran telah terlampaui.') +
          '. Sesi pengerjaan dibekukan dan seluruh jawaban telah dikirim ke server dengan status <b style="color:var(--err)">Diskualifikasi</b>.</p></div>' +
      '<div class="inset mt-24" style="background:var(--canvas)"><div class="row between mb-16"><div class="row">' + ic('assignment_ind') + '<b style="font-family:var(--f-head)">Metadata Sesi &amp; Hasil Eksekusi</b></div><span class="badge b-mute mono">#' + esc(String(d.verifikasi.id).slice(-12)) + '</span></div>' +
        '<div class="res-grid">' + cell('Identitas Siswa', d.siswa.nama, 'NIS: ' + d.siswa.nis + ' • ' + d.siswa.kelas) + cell('Mata Ujian', d.ujian.mapel, d.ujian.nama) +
          '<div class="res-cell"><div class="label">Waktu Pemutusan</div><div style="font:700 15px var(--f-head);color:var(--err);margin-top:4px">' + P.fmtJam(d.submit) + ' WIB</div><div class="small muted">' + d.viol + ' pelanggaran tercatat</div></div></div>' +
        '<div class="grid-2 mt-12" style="grid-template-columns:2fr 1fr"><div class="res-cell"><div class="row between"><span class="label">Progres Lembar Jawaban Terkunci</span><b class="small">' + d.terjawab + ' / ' + d.total + ' (' + persen + '%)</b></div><div class="bar mt-8"><i style="width:' + persen + '%"></i></div>' +
          '<p class="tiny mt-8" style="color:var(--warn)">' + ic('lock_clock') + ' Lembar respon telah diunggah ke server dan dikunci permanen.</p></div>' +
          '<div class="res-cell" style="background:var(--bad-bg)"><div class="label" style="color:var(--bad)">Status Perekaman</div><div class="row mt-8"><span style="color:var(--err)">' + ic('cancel') + '</span><div><b style="color:var(--bad);font-family:var(--f-head)">Diskualifikasi</b><div class="tiny" style="color:var(--bad)">Skor: ditangguhkan</div></div></div></div></div></div>' +
      '<div class="mt-16"><b style="font-family:var(--f-head)">Log Insiden Pelanggaran (' + d.logs.length + (d.batas > 0 ? '/' + d.batas : '') + ')</b><div class="col mt-8" style="gap:6px">' +
        (d.logs.length ? d.logs.map(function (l) { return '<div class="row between inset" style="padding:10px 14px"><div class="row">' + ic('warning') + '<span><b>#' + l.ke + '</b> ' + esc(l.jenis) + '</span></div><span class="small muted mono">' + P.fmtJam(l.waktu) + ' WIB · audio: ' + esc(l.audio) + '</span></div>'; }).join('')
          : '<div class="inset small muted">Diskualifikasi oleh pengawas.</div>') + '</div></div>' +
      '<div class="row mt-16" style="align-items:flex-start;gap:12px;padding:16px;border-radius:16px;background:var(--warn-bg);color:var(--warn)">' + ic('info', 'fill') + '<div><b class="tiny" style="letter-spacing:.06em">INSTRUKSI &amp; REGULASI AKADEMIK</b><p class="small mt-8" style="line-height:1.6">Berkas ujian ini masuk kategori <b>"Tinjauan Etik / Diskualifikasi"</b>. Bila kejadian dipicu malfungsi perangkat atau kendala teknis, segera <b>angkat tangan dan lapor kepada pengawas</b> sebelum meninggalkan meja ujian.</p></div></div>' +
      '<div class="row mt-24 between wrap"><button class="btn btn-gold" data-ba>' + ic('download_for_offline') + '<span>Unduh Berita Acara Insiden (PDF)</span></button>' +
        '<div class="row"><button class="btn btn-soft" data-call>' + ic('support_agent') + '<span>Panggil Pengawas</span></button><button class="btn btn-forest" data-out>' + ic('logout') + '<span>Keluar Sesi</span></button></div></div>' +
      '</div><p class="tiny muted" style="text-align:center">Dilindungi oleh ProctorCBT Multi-Layer Integrity Shield • Log tersimpan di server akademik ' + esc(d.institusi) + '</p></div>');
    root.appendChild(v);
    $('[data-out]', v).onclick = App.logout;
    $('[data-call]', v).onclick = function () { P.modal({ title: 'Panggil Pengawas', size: 'sm', body: '<p>Angkat tangan dan sampaikan kepada pengawas ruang <b>' + esc(d.ujian.ruang || '') + '</b>. Bila diskualifikasi terjadi karena kendala teknis, pengawas dapat memulihkan sesi Anda dari panel Live Monitoring.</p>', actions: [{ label: 'Mengerti', cls: 'btn-forest' }] }); };
    $('[data-ba]', v).onclick = function () { const b = this; P.busy(b, async function () { await App.loadModule('pdf'); await window.PDFKit.beritaAcara(d); }, 'Menyiapkan PDF…'); };
  }
})();
