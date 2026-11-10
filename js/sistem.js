/*
 * ProctorCBT — sistem.js (dimuat saat menu dibuka)
 * Manajemen Pengguna (Admin) dan Pengaturan: Umum, Suara Peringatan, Akun & Sandi,
 * Migrasi Data (gas-migrasi-database), Status Sistem & Audit.
 * Rahasia (token Fonnte, secret sesi, ID spreadsheet) TIDAK pernah tampil — hanya status ada/tidak.
 */
(function () {
  'use strict';
  const P = window.PCBT, App = window.App, K = window.AdminKit, Admin = window.Admin;
  const esc = P.esc, ic = P.ic, el = P.el, $ = P.$, $$ = P.$$;
  const Pg = window.Page_sistem = {};
  const PER_HAL = 50;

  function tampilSandi(nama, sandi, extra) {
    const m = P.modal({ title: 'Sandi untuk ' + nama, size: 'sm', dismiss: false, body: '<p class="small muted">' + (extra || 'Catat & sampaikan secara pribadi. Sandi ini <b>hanya tampil sekali</b> dan tidak disimpan dalam bentuk asli.') + '</p>' +
      '<div class="inset row between mt-12"><span class="tok" style="font-size:18px" data-s>' + esc(sandi) + '</span><button class="btn btn-soft btn-sm" data-c>' + ic('content_copy') + '<span>Salin</span></button></div>',
      actions: [{ label: 'Sudah dicatat', cls: 'btn-forest' }] });
    $('[data-c]', m.body).onclick = function () { navigator.clipboard && navigator.clipboard.writeText(sandi).then(function () { P.toast('Sandi disalin.'); }); };
  }

  // ============================================================ PENGGUNA
  Pg.pengguna = function (ctx) {
    let users = null, role = P.LS.get('usrRole') || 'Siswa', fKls = '', q = '', hal = 1;
    ctx.page.innerHTML = '';
    const v = el('<div><div class="page-h"><div><h1>Pengguna</h1><p>Akun Admin, Guru, dan Siswa. Siswa login dengan NIS/NISN + token ujian; Guru/Admin dengan email + sandi.</p></div>' +
      '<div class="row wrap"><button class="btn btn-white" data-tpl>' + ic('description') + '<span>Template Siswa</span></button><button class="btn btn-white" data-exp>' + ic('download') + '<span>Ekspor</span></button>' +
      '<button class="btn btn-white" data-imp>' + ic('group_add') + '<span>Impor Siswa</span></button><button class="btn btn-gold" data-add>' + ic('person_add') + '<span>Tambah Pengguna</span></button></div></div>' +
      '<div class="card pad-0"><div class="row wrap between" style="padding:14px 16px;gap:10px"><div class="seg" data-roles></div><div class="row wrap grow" style="justify-content:flex-end;gap:8px">' +
        '<select class="select" data-kls style="width:150px"><option value="">Semua kelas</option></select><label class="input-ico" style="min-width:220px;flex:1;max-width:360px">' + ic('search') + '<input class="input" data-q placeholder="Cari nama, email, NIS…" style="background:var(--canvas)"></label></div></div>' +
      '<div data-tbl><div class="skel" style="height:300px;margin:0 16px 16px"></div></div></div></div>');
    ctx.page.appendChild(v);
    $('[data-add]', v).onclick = function () { form(null); };
    $('[data-imp]', v).onclick = imporSiswa;
    $('[data-tpl]', v).onclick = function () { const b = this; P.busy(b, function () { return K.exportXlsx('Template_Siswa_ProctorCBT', { Siswa: [['NIS', 'Nama', 'Kelas', 'Email', 'No_WA'], ['0012345678', 'Ahmad Fauzi', 'XII IPA 1', 'ahmad@contoh.sch.id', '081234567890']], Petunjuk: [['Kolom', 'Keterangan'], ['NIS', 'Wajib. NIS/NISN — format kolom TEKS agar angka 0 di depan tidak hilang'], ['Nama', 'Wajib'], ['Kelas', 'Disarankan (untuk penjadwalan per kelas)'], ['Email', 'Opsional'], ['No_WA', 'Opsional, contoh 08123456789 (untuk notifikasi)'], ['Upsert', 'NIS yang sudah terdaftar → datanya diperbarui, bukan diduplikasi']] }); }); };
    $('[data-exp]', v).onclick = function () { const b = this; P.busy(b, async function () { const l = rows(); if (!l.length) return P.toast('Tidak ada data.', 'warn'); await K.exportXlsx('Pengguna_' + (role || 'Semua'), { Pengguna: [['Nama', 'Peran', 'Email', 'NIS', 'Kelas', 'No_WA', 'Status WA', 'Status']].concat(l.map(function (u) { return [u.nama, u.role, u.email, u.nis, u.kelas, u.wa, u.statusWA, u.aktif ? 'Aktif' : 'Nonaktif']; })) }); }); };
    $('[data-q]', v).addEventListener('input', P.debounce(function (e) { q = e.target.value.trim(); hal = 1; render(); }, 150));
    $('[data-kls]', v).onchange = function () { fKls = this.value; hal = 1; render(); };
    Admin.onSearch = function (s) { q = s; $('[data-q]', v).value = s; hal = 1; render(); };
    P.on(v, 'click', '[data-r]', function (e, b) { role = b.dataset.r; P.LS.set('usrRole', role); hal = 1; render(); });

    function rows() {
      const ql = q.toLowerCase();
      return (users || []).filter(function (u) { return (!role || u.role === role) && (!fKls || u.kelas === fKls) && (!ql || (u.nama + ' ' + u.email + ' ' + u.nis + ' ' + u.kelas + ' ' + u.wa).toLowerCase().indexOf(ql) > -1); })
        .sort(function (a, b) { return String(a.kelas + a.nama).localeCompare(b.kelas + b.nama); });
    }
    function render() {
      if (!users) return;
      const cnt = { '': users.length, Admin: 0, Guru: 0, Siswa: 0 }; users.forEach(function (u) { cnt[u.role]++; });
      $('[data-roles]', v).innerHTML = [['Siswa', 'Siswa'], ['Guru', 'Guru'], ['Admin', 'Admin'], ['', 'Semua']].map(function (r) { return '<button class="' + (role === r[0] ? 'on' : '') + '" data-r="' + r[0] + '">' + r[1] + ' (' + cnt[r[0]] + ')</button>'; }).join('');
      const kls = Array.from(new Set(users.filter(function (u) { return u.role === 'Siswa' && u.kelas; }).map(function (u) { return u.kelas; }))).sort(), sk = $('[data-kls]', v);
      sk.classList.toggle('hidden', role !== 'Siswa' && role !== '');
      if (sk.options.length !== kls.length + 1) sk.innerHTML = '<option value="">Semua kelas</option>' + kls.map(function (k) { return '<option' + (k === fKls ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('');
      const l = rows(), box = $('[data-tbl]', v);
      if (!l.length) { box.innerHTML = K.kosong('group', users.length ? 'Tidak ada pengguna yang cocok.' : 'Belum ada pengguna.'); return; }
      const maxHal = Math.ceil(l.length / PER_HAL); if (hal > maxHal) hal = maxHal;
      const me = K.me().id;
      box.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nama</th><th>Peran</th><th>' + (role === 'Siswa' ? 'NIS / Kelas' : 'Email / NIS') + '</th><th>WhatsApp</th><th>Status</th><th></th></tr></thead><tbody>' +
        l.slice((hal - 1) * PER_HAL, hal * PER_HAL).map(function (u) {
          const wa = u.wa ? '<span class="mono small">' + esc(u.wa) + '</span> <span class="wa-badge ' + (u.statusWA === 'Terdaftar' ? 'ya' : u.statusWA === 'Tidak Terdaftar' ? 'tidak' : 'belum') + '">' + (u.statusWA === 'Terdaftar' ? 'WA ✓' : u.statusWA === 'Tidak Terdaftar' ? 'Bukan WA' : 'Belum dicek') + '</span>' : '<span class="muted small">-</span>';
          return '<tr' + (u.aktif ? '' : ' style="opacity:.6"') + '><td><div class="row"><span class="av sm ' + P.avColor(u.nama) + '">' + esc(P.inisial(u.nama)) + '</span><b>' + esc(u.nama) + '</b>' + (u.id === me ? ' <span class="badge b-gold">Anda</span>' : '') + '</div></td>' +
            '<td><span class="badge ' + (u.role === 'Admin' ? 'b-forest' : u.role === 'Guru' ? 'b-info' : 'b-mute') + '">' + u.role + '</span></td>' +
            '<td class="small">' + (u.role === 'Siswa' ? '<span class="mono">' + esc(u.nis) + '</span><div class="tiny muted">' + esc(u.kelas || '-') + '</div>' : esc(u.email)) + '</td><td>' + wa + '</td>' +
            '<td><label class="switch" title="' + (u.aktif ? 'Nonaktifkan' : 'Aktifkan') + '"><input type="checkbox" data-tg="' + esc(u.id) + '"' + (u.aktif ? ' checked' : '') + (u.id === me ? ' disabled' : '') + '><i></i><span class="small">' + (u.aktif ? 'Aktif' : 'Nonaktif') + '</span></label></td>' +
            '<td class="nowrap"><button class="btn btn-ghost btn-icon btn-sm" data-ed="' + esc(u.id) + '" title="Edit">' + ic('edit') + '</button>' + (u.role !== 'Siswa' ? '<button class="btn btn-ghost btn-icon btn-sm" data-rs="' + esc(u.id) + '" title="Reset sandi">' + ic('key') + '</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      const pg = el('<div class="pager small muted" style="padding:12px 16px"><span>' + l.length + ' pengguna</span><div class="row"><button class="btn btn-soft btn-sm btn-icon" data-p="-1"' + (hal <= 1 ? ' disabled' : '') + '>' + ic('chevron_left') + '</button><span>Hal. ' + hal + '/' + maxHal + '</span><button class="btn btn-soft btn-sm btn-icon" data-p="1"' + (hal >= maxHal ? ' disabled' : '') + '>' + ic('chevron_right') + '</button></div></div>');
      P.on(pg, 'click', '[data-p]', function (e, b) { hal += Number(b.dataset.p); render(); });
      box.appendChild(pg);
    }
    P.on(v, 'change', '[data-tg]', async function (e, b) {
      const u = users.filter(function (x) { return x.id === b.dataset.tg; })[0], aktif = b.checked;
      if (!aktif && !await P.confirmDlg('Nonaktifkan <b>' + esc(u.nama) + '</b>? Sesi login yang sedang aktif akan diputus.', { ok: 'Nonaktifkan', danger: true })) { b.checked = true; return; }
      const r = await P.ask('users.toggle', { id: u.id, aktif: aktif }, { invalidate: ['users.list', 'kelas.list'] });
      if (r) u.aktif = aktif; else b.checked = !aktif;
      render();
    });
    P.on(v, 'click', '[data-ed]', function (e, b) { form(users.filter(function (x) { return x.id === b.dataset.ed; })[0]); });
    P.on(v, 'click', '[data-rs]', async function (e, b) {
      const u = users.filter(function (x) { return x.id === b.dataset.rs; })[0];
      if (!await P.confirmDlg('Buat sandi baru untuk <b>' + esc(u.nama) + '</b>? Sandi lama tidak berlaku & sesi aktifnya diputus.', { ok: 'Reset Sandi' })) return;
      const r = await P.ask('users.resetSandi', { id: u.id }, { ok: false });
      if (r) tampilSandi(u.nama, r.sandi);
    });

    function form(u) {
      const x = u || { role: role || 'Siswa' };
      const body = el('<form class="col gap-16" novalidate><div class="field"><span>Peran</span><div class="seg" data-rl>' + ['Siswa', 'Guru', 'Admin'].map(function (r) { return '<button type="button" data-v="' + r + '" class="' + (x.role === r ? 'on' : '') + '">' + r + '</button>'; }).join('') + '</div></div>' +
        '<label class="field"><span>Nama lengkap</span><input class="input" name="nama" maxlength="120" value="' + esc(x.nama || '') + '"></label>' +
        '<div class="grid-2" data-sis><label class="field"><span>NIS / NISN</span><input class="input mono" name="nis" inputmode="numeric" maxlength="30" value="' + esc(x.nis || '') + '"></label><label class="field"><span>Kelas</span><input class="input" name="kelas" maxlength="40" value="' + esc(x.kelas || '') + '" list="dl-kelas" placeholder="XII IPA 1"></label></div>' +
        '<datalist id="dl-kelas">' + Array.from(new Set((users || []).map(function (u2) { return u2.kelas; }).filter(String))).map(function (k) { return '<option value="' + esc(k) + '">'; }).join('') + '</datalist>' +
        '<div class="grid-2"><label class="field"><span data-el>Email</span><input class="input" type="email" name="email" value="' + esc(x.email || '') + '"></label><label class="field"><span>No. WhatsApp</span><input class="input" name="wa" inputmode="tel" value="' + esc(x.wa || '') + '" placeholder="08123456789"></label></div>' +
        '<p class="tiny muted" data-info></p></form>');
      let rl = x.role;
      function setRole(r) { rl = r; $$('[data-v]', body).forEach(function (b) { b.classList.toggle('on', b.dataset.v === r); }); $('[data-sis]', body).classList.toggle('hidden', r !== 'Siswa'); $('[data-el]', body).textContent = r === 'Siswa' ? 'Email (opsional)' : 'Email (untuk login)';
        $('[data-info]', body).textContent = r === 'Siswa' ? 'Siswa tidak memakai sandi: login cukup dengan token ujian + NIS/NISN.' : u ? '' : 'Sandi awal dibuat otomatis & ditampilkan sekali setelah disimpan (juga dikirim via WA/Email bila notifikasi aktif).'; }
      setRole(rl);
      P.on(body, 'click', '[data-v]', function (e, b) { setRole(b.dataset.v); });
      P.modal({ title: u ? 'Edit Pengguna' : 'Tambah Pengguna', body: body, actions: [{ label: 'Batal' }, { label: 'Simpan', icon: 'save', cls: 'btn-gold', onClick: async function (close) {
        const data = { id: u && u.id, role: rl, nama: body.nama.value.trim(), nis: body.nis.value.trim(), kelas: body.kelas.value.trim(), email: body.email.value.trim(), wa: body.wa.value.trim() };
        const r = await P.ask('users.save', { user: data }, { invalidate: ['users.list', 'kelas.list'], ok: false });
        if (!r) return false;
        close(); P.toast(u ? 'Pengguna diperbarui.' : 'Pengguna ditambahkan.');
        if (r.sandi) tampilSandi(data.nama, r.sandi);
        load(true);
      } }] });
    }
    function imporSiswa() {
      let rows = null, lap = null;
      const body = el('<div class="col gap-16"><label class="inset col" style="align-items:center;text-align:center;cursor:pointer;border:2px dashed var(--outline-2);padding:26px">' + ic('upload_file') + '<b class="mt-8" data-fn>Pilih file .xlsx / .csv</b><span class="tiny muted">Kolom: NIS, Nama, Kelas, Email, No_WA — NIS yang sudah ada diperbarui (upsert)</span><input type="file" accept=".xlsx,.xls,.csv" hidden data-file></label><div data-rep></div></div>');
      const m = P.modal({ title: 'Impor Siswa', size: 'lg', body: body, actions: [{ label: 'Tutup' }, { label: 'Impor', icon: 'publish', cls: 'btn-gold', onClick: async function (close) {
        if (!lap) return false;
        const r = await P.ask('users.import', { rows: rows }, { invalidate: ['users.list', 'kelas.list'] });
        if (!r) return false; close(); load(true);
      } }] });
      const go = $$('.modal-f .btn', m.el).pop(); go.disabled = true;
      $('[data-file]', body).onchange = async function () {
        const f = this.files[0]; if (!f) return;
        $('[data-fn]', body).textContent = f.name; $('[data-rep]', body).innerHTML = '<div class="inset small row"><span class="spin"></span> Membaca & memvalidasi…</div>';
        try { rows = await K.bacaFile(f); } catch (e) { $('[data-rep]', body).innerHTML = '<div class="inset small" style="color:var(--err)">' + esc(e.message) + '</div>'; return; }
        // Excel kerap menghapus 0 di depan NIS — beri tahu bila terdeteksi pola NISN 9 digit
        const sembilan = rows.filter(function (r) { return /^\d{9}$/.test(String(r.NIS || r.NISN || r.nis || '').trim()); }).length;
        const res = await P.api('users.import', { rows: rows, dryRun: true });
        if (!res.success) { $('[data-rep]', body).innerHTML = '<div class="inset small" style="color:var(--err)">' + esc(res.message) + '</div>'; return; }
        lap = res.data;
        $('[data-rep]', body).innerHTML = '<div class="stat-tiles"><div class="tile"><span class="tiny muted">Baris</span><b>' + rows.length + '</b></div><div class="tile"><span class="tiny muted">Siswa baru</span><b style="color:var(--ok)">' + lap.baru + '</b></div><div class="tile"><span class="tiny muted">Diperbarui</span><b style="color:var(--info)">' + lap.diperbarui + '</b></div><div class="tile"><span class="tiny muted">Gagal</span><b style="color:' + (lap.gagal.length ? 'var(--err)' : 'var(--ok)') + '">' + lap.gagal.length + '</b></div></div>' +
          (sembilan ? '<div class="inset small mt-12" style="color:var(--warn)">' + ic('warning') + ' ' + sembilan + ' NIS berisi 9 digit — kemungkinan angka 0 di depan NISN hilang oleh Excel. Atur kolom NIS sebagai <b>Teks</b> lalu ekspor ulang bila perlu.</div>' : '') +
          (lap.gagal.length ? '<div class="tbl-wrap mt-12" style="max-height:200px"><table class="tbl"><thead><tr><th>Baris</th><th>Alasan</th></tr></thead><tbody>' + lap.gagal.slice(0, 200).map(function (g) { return '<tr><td class="mono">' + g.baris + '</td><td>' + esc(g.alasan) + '</td></tr>'; }).join('') + '</tbody></table></div>' : '');
        go.disabled = !(lap.baru + lap.diperbarui); $('span', go).textContent = 'Impor ' + (lap.baru + lap.diperbarui) + ' Siswa';
      };
    }
    function load(force) { return P.SWR.load('users.list', {}, 30000, function (d) { if (d && ctx.alive()) { users = d; render(); } }, { force: force }); }
    load(false);
  };

  // ============================================================ PENGATURAN
  Pg.pengaturan = function (ctx) {
    const adm = K.isAdmin();
    const TABS = (adm ? [['umum', 'Umum', 'tune'], ['suara', 'Suara Peringatan', 'record_voice_over']] : [['suara', 'Suara Peringatan', 'record_voice_over']])
      .concat([['akun', 'Akun & Sandi', 'manage_accounts']]).concat(adm ? [['migrasi', 'Migrasi Data', 'move_up'], ['sistem', 'Status Sistem', 'monitor_heart']] : []);
    let tab = P.LS.get('setTab'); if (!TABS.some(function (t) { return t[0] === tab; })) tab = TABS[0][0];
    ctx.page.innerHTML = '';
    const v = el('<div><div class="page-h"><div><h1>Pengaturan</h1><p>' + (adm ? 'Konfigurasi institusi, suara peringatan, keamanan akun, migrasi data, dan kesehatan sistem' : 'Suara peringatan & keamanan akun Anda') + '</p></div></div>' +
      '<div class="row wrap mb-16" style="gap:6px" data-tabs>' + TABS.map(function (t) { return '<button class="chip" data-t="' + t[0] + '">' + ic(t[2]) + t[1] + '</button>'; }).join('') + '</div><div data-body></div></div>');
    ctx.page.appendChild(v);
    P.on(v, 'click', '[data-t]', function (e, b) { tab = b.dataset.t; P.LS.set('setTab', tab); buka(); });
    function buka() {
      $$('[data-t]', v).forEach(function (b) { b.classList.toggle('on', b.dataset.t === tab); });
      const body = $('[data-body]', v); body.innerHTML = '<div class="card skel" style="height:320px"></div>';
      ({ umum: tabUmum, suara: tabSuara, akun: tabAkun, migrasi: tabMigrasi, sistem: tabSistem })[tab](body, ctx);
    }
    buka();
  };

  function tabUmum(body, ctx) {
    P.SWR.load('set.get', {}, 0, function (d) {
      if (!d || !ctx.alive()) return;
      const f = el('<form class="card col gap-16" novalidate>' + d.map(function (s) {
        let input;
        if (s.kunci === 'GENDER_SUARA_DEFAULT') input = '<select class="select" name="' + s.kunci + '">' + ['Perempuan', 'Laki-laki'].map(function (g) { return '<option' + (g === s.nilai ? ' selected' : '') + '>' + g + '</option>'; }).join('') + '</select>';
        else if (s.kunci === 'PENGUMUMAN_LOGIN') input = '<textarea class="textarea" name="' + s.kunci + '" maxlength="500" style="min-height:70px">' + esc(s.nilai) + '</textarea>';
        else input = '<input class="input" name="' + s.kunci + '" value="' + esc(s.nilai) + '"' + (/DETIK|MENIT/.test(s.kunci) ? ' type="number"' : '') + '>';
        return '<label class="field"><span>' + esc(s.kunci.replace(/_/g, ' ').toLowerCase().replace(/^\w/, function (c) { return c.toUpperCase(); })) + '</span>' + input + '<span class="hint">' + esc(s.ket) + '</span></label>';
      }).join('') + '<div class="row" style="justify-content:flex-end"><button class="btn btn-gold" type="submit">' + ic('save') + '<span>Simpan Pengaturan</span></button></div></form>');
      body.innerHTML = ''; body.appendChild(f);
      f.addEventListener('submit', async function (e) {
        e.preventDefault();
        const nilai = {}; d.forEach(function (s) { nilai[s.kunci] = f[s.kunci].value; });
        const r = await P.busy($('button[type=submit]', f), function () { return P.ask('set.save', { nilai: nilai }, { ok: 'Pengaturan tersimpan.', invalidate: ['set.get', 'boot', 'pub.info'] }); });
        if (r) { App.info = Object.assign(App.info || {}, nilai); P.LS.set('pubinfo', App.info); }
      });
    }, { force: true });
  }

  // ---- uji suara (TTS) — sama dengan logika ruang ujian
  function ujiSuara(teks, gender, url) {
    if (url) { const a = new Audio(url); a.play().catch(function () { P.toast('Audio tidak bisa diputar — periksa link (harus https & dibagikan publik).', 'warn'); }); return; }
    if (!('speechSynthesis' in window)) return P.toast('Browser ini tidak mendukung suara sintetis.', 'warn');
    speechSynthesis.cancel();
    const voices = speechSynthesis.getVoices().filter(function (x) { return /^id|ind/i.test(x.lang); });
    const pria = /andika|ardi|male|pria|laki|budi|rizky/i, wanita = /gadis|damayanti|female|wanita|perempuan|google|siti/i;
    const cocok = voices.filter(function (x) { return gender === 'Laki-laki' ? pria.test(x.name) : wanita.test(x.name) || !pria.test(x.name); });
    const u = new SpeechSynthesisUtterance(teks); u.lang = 'id-ID';
    if (cocok[0] || voices[0]) u.voice = cocok[0] || voices[0];
    u.pitch = cocok.length ? 1 : (gender === 'Laki-laki' ? 0.75 : 1.2);
    speechSynthesis.speak(u);
    if (!voices.length) P.toast('Suara Bahasa Indonesia tidak terpasang di perangkat ini — memakai suara bawaan.', 'warn');
  }
  function tabSuara(body, ctx) {
    const adm = K.isAdmin();
    P.SWR.load('suara.list', {}, 0, function (d) {
      if (!d || !ctx.alive()) return;
      const rows = d.slice().sort(function (a, b) { return String(a.Gender_Suara + a.Level_Eskalasi).localeCompare(b.Gender_Suara + b.Level_Eskalasi); });
      const card = el('<div class="card pad-0"><div style="padding:16px 18px" class="row between wrap"><div><h3>Suara Peringatan Bertingkat</h3><p class="small muted mt-8">Diputar di perangkat siswa saat pelanggaran: Level 1 netral → 2 tegas → 3 peringatan terakhir (satu sebelum batas). Kosongkan URL untuk memakai suara sintetis (TTS) dari teks.</p></div></div>' +
        '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Suara</th><th>Level</th><th style="min-width:280px">Teks peringatan</th><th style="min-width:200px">URL audio (opsional)</th><th>Aktif</th><th></th></tr></thead><tbody>' +
        rows.map(function (s) {
          return '<tr data-id="' + esc(s.ID_Suara) + '"><td><span class="badge ' + (s.Gender_Suara === 'Laki-laki' ? 'b-info' : 'b-gold') + '">' + ic(s.Gender_Suara === 'Laki-laki' ? 'man' : 'woman') + esc(s.Gender_Suara) + '</span><div class="tiny muted mt-8">' + esc(s.Jenis_Pelanggaran) + '</div></td><td><b>' + esc(s.Level_Eskalasi) + '</b></td>' +
            '<td><textarea class="textarea" data-k="Teks_Peringatan" style="min-height:64px"' + (adm ? '' : ' disabled') + '>' + esc(s.Teks_Peringatan) + '</textarea></td>' +
            '<td><input class="input" data-k="URL_File_Audio" value="' + esc(s.URL_File_Audio) + '" placeholder="https://drive.google.com/…"' + (adm ? '' : ' disabled') + '></td>' +
            '<td><label class="switch"><input type="checkbox" data-k="Aktif"' + (/ya|true|aktif/i.test(String(s.Aktif)) ? ' checked' : '') + (adm ? '' : ' disabled') + '><i></i></label></td>' +
            '<td><button class="btn btn-soft btn-sm" data-uji>' + ic('play_arrow') + '<span>Uji</span></button></td></tr>';
        }).join('') + '</tbody></table></div>' + (adm ? '<div class="row" style="justify-content:flex-end;padding:14px 18px"><button class="btn btn-gold" data-sv>' + ic('save') + '<span>Simpan Suara</span></button></div>' : '') + '</div>');
      body.innerHTML = ''; body.appendChild(card);
      P.on(card, 'click', '[data-uji]', function (e, b) { const tr = b.closest('tr'), s = rows.filter(function (x) { return x.ID_Suara === tr.dataset.id; })[0]; ujiSuara($('[data-k=Teks_Peringatan]', tr).value, s.Gender_Suara, $('[data-k=URL_File_Audio]', tr).value.trim()); });
      const sv = $('[data-sv]', card);
      if (sv) sv.onclick = function () {
        const out = $$('tr[data-id]', card).map(function (tr) { return { ID_Suara: tr.dataset.id, Teks_Peringatan: $('[data-k=Teks_Peringatan]', tr).value.trim(), URL_File_Audio: $('[data-k=URL_File_Audio]', tr).value.trim(), Aktif: $('[data-k=Aktif]', tr).checked ? 'Ya' : 'Tidak' }; });
        if (out.some(function (x) { return x.URL_File_Audio && !/^https:\/\//.test(x.URL_File_Audio); })) return P.toast('URL audio harus diawali https://', 'warn');
        P.busy(sv, function () { return P.ask('suara.save', { rows: out }, { invalidate: ['suara.list'] }); });
      };
    }, { force: true });
  }

  function tabAkun(body) {
    const me = K.me();
    const c = el('<div class="grid-2" style="align-items:start"><form class="card col gap-16" novalidate><h3>Ganti Kata Sandi</h3>' +
      '<label class="field"><span>Sandi lama</span><input class="input" type="password" name="lama" autocomplete="current-password"></label>' +
      '<label class="field"><span>Sandi baru</span><input class="input" type="password" name="baru" autocomplete="new-password"><span class="hint">Minimal 8 karakter, berisi huruf dan angka.</span></label>' +
      '<label class="field"><span>Ulangi sandi baru</span><input class="input" type="password" name="ulang" autocomplete="new-password"></label>' +
      '<p class="tiny muted">Setelah diganti, semua sesi lain akun ini otomatis keluar.</p><div class="row" style="justify-content:flex-end"><button class="btn btn-gold" type="submit">' + ic('lock_reset') + '<span>Ganti Sandi</span></button></div></form>' +
      '<div class="stack"><div class="card"><div class="row"><span class="av ' + P.avColor(me.nama) + '" style="width:52px;height:52px;font-size:18px">' + esc(P.inisial(me.nama)) + '</span><div><h3>' + esc(me.nama || '') + '</h3><div class="small muted">' + esc(me.email || '') + ' • ' + esc(me.role || '') + '</div></div></div></div>' +
      '<div class="card"><h3>Aplikasi di Perangkat</h3><p class="small muted mt-8">Pasang ProctorCBT di HP/laptop agar terbuka seperti aplikasi (layar penuh, ikon di beranda).</p><div class="row mt-12"><button class="btn btn-forest btn-sm" data-ins>' + ic('install_mobile') + '<span>' + (P.isStandalone() ? 'Sudah terpasang' : 'Pasang Aplikasi') + '</span></button><button class="btn btn-soft btn-sm" data-out>' + ic('logout') + '<span>Keluar</span></button></div></div></div></div>');
    body.innerHTML = ''; body.appendChild(c);
    $('[data-ins]', c).disabled = P.isStandalone();
    $('[data-ins]', c).onclick = P.promptInstall;
    $('[data-out]', c).onclick = App.logout;
    const f = $('form', c);
    f.addEventListener('submit', async function (e) {
      e.preventDefault();
      if (f.baru.value !== f.ulang.value) return P.toast('Ulangan sandi baru tidak sama.', 'warn');
      if (f.baru.value.length < 8 || !/\d/.test(f.baru.value) || !/[A-Za-z]/.test(f.baru.value)) return P.toast('Sandi baru minimal 8 karakter, berisi huruf dan angka.', 'warn');
      const r = await P.busy($('button[type=submit]', f), function () { return P.ask('auth.gantiSandi', { lama: f.lama.value, baru: f.baru.value }); });
      if (r && r.token) { P.Sesi.patch({ token: r.token }); f.reset(); }
    });
  }

  function tabMigrasi(body) {
    const SHEETS = [['Users', 'Pengguna (Guru & Siswa)'], ['Mapel', 'Mata pelajaran'], ['BankSoal', 'Bank soal'], ['JadwalUjian', 'Jadwal ujian'], ['HasilUjian', 'Hasil ujian'], ['LogPelanggaran', 'Log pelanggaran']];
    const c = el('<div class="grid-2" style="align-items:start"><form class="card col gap-16" novalidate><div><h3>Migrasi dari App Lama</h3><p class="small muted mt-8">Salin data dari spreadsheet app CBT lama ke database ini. Aman diulang: data yang sudah ada tidak diduplikasi. Selalu <b>Pindai</b> dulu — belum ada data yang ditulis.</p></div>' +
      '<label class="field"><span>URL / ID spreadsheet app lama</span><input class="input" name="src" placeholder="https://docs.google.com/spreadsheets/d/…"><span class="hint">Harus bisa dibuka oleh akun pemilik Apps Script ini.</span></label>' +
      '<div class="field"><span>Sheet yang dipindah</span><div class="col gap-4">' + SHEETS.map(function (s, i) { return '<label class="check"><input type="checkbox" name="sh" value="' + s[0] + '"' + (i < 5 ? ' checked' : '') + '> ' + s[1] + ' <span class="tiny muted mono">(' + s[0] + ')</span></label>'; }).join('') + '</div></div>' +
      '<label class="switch"><input type="checkbox" name="ow"><i></i>Perbarui baris yang sudah ada (timpa kolom yang berubah)</label>' +
      '<div class="row" style="justify-content:flex-end"><button class="btn btn-white" type="button" data-scan>' + ic('search_check') + '<span>Pindai (uji kering)</span></button><button class="btn btn-gold" type="button" data-run disabled>' + ic('move_up') + '<span>Jalankan Import</span></button></div></form>' +
      '<div class="card" data-rep><h3>Laporan</h3><p class="small muted mt-8">Hasil pindai akan tampil di sini: jumlah baris sumber, yang akan ditambah, diperbarui, dan dilewati per sheet.</p>' +
      '<ul class="rules mt-16"><li>' + ic('lock') + '<span>Kata sandi Guru tidak ikut dipindah — reset dari menu Pengguna.</span></li><li>' + ic('pin') + '<span>NISN 9 digit otomatis dipulihkan menjadi 10 digit (angka 0 di depan).</span></li><li>' + ic('sync') + '<span>Jalankan ulang kapan saja menjelang cutover untuk menyalin data terbaru (delta).</span></li></ul></div></div>');
    body.innerHTML = ''; body.appendChild(c);
    const f = $('form', c);
    function opsi(dry) { return { source: f.src.value.trim(), sheets: $$('input[name=sh]:checked', f).map(function (x) { return x.value; }), overwrite: f.ow.checked, dryRun: dry }; }
    async function jalan(dry, btn) {
      const o = opsi(dry);
      if (!o.source) return P.toast('Tempel URL spreadsheet app lama.', 'warn');
      if (!o.sheets.length) return P.toast('Pilih minimal satu sheet.', 'warn');
      if (!dry && !await P.confirmDlg('Tulis data ke database sekarang? Proses ini tercatat di audit log.', { ok: 'Jalankan Import' })) return;
      const r = await P.busy(btn, function () { return P.api('migrasi.run', o, { timeout: 330000 }); }, dry ? 'Memindai…' : 'Mengimpor…');
      if (!r.success) return P.toast(r.message, 'err');
      const d = r.data, rep = $('[data-rep]', c);
      rep.innerHTML = '<div class="row between"><h3>' + (d.dryRun ? 'Hasil Pindai' : 'Import Selesai') + '</h3><span class="badge ' + (d.dryRun ? 'b-info' : 'b-ok') + '">' + (d.dryRun ? 'Uji kering' : 'Tertulis') + '</span></div><p class="small muted mt-8">Sumber: <b>' + esc(d.source.name) + '</b> <span class="mono tiny">' + esc(d.source.id) + '</span></p>' +
        '<div class="tbl-wrap mt-12"><table class="tbl"><thead><tr><th>Sheet</th><th class="num">Sumber</th><th class="num">Tambah</th><th class="num">Perbarui</th><th class="num">Lewati</th></tr></thead><tbody>' +
        Object.keys(d.report).map(function (k) { const x = d.report[k]; return '<tr><td><b>' + esc(k) + '</b>' + (x.info ? '<div class="tiny muted">' + esc(x.info) + '</div>' : '') + '</td><td class="num">' + (x.source || 0) + '</td><td class="num" style="color:var(--ok)"><b>' + (x.inserted || 0) + '</b></td><td class="num" style="color:var(--info)">' + (x.updated || 0) + '</td><td class="num muted">' + (x.skipped || 0) + '</td></tr>'; }).join('') + '</tbody></table></div>' +
        (d.warnings.length ? '<div class="col mt-12" style="gap:6px">' + d.warnings.map(function (w) { return '<div class="inset small" style="color:var(--warn)">' + ic('warning') + ' ' + esc(w) + '</div>'; }).join('') + '</div>' : '');
      $('[data-run]', c).disabled = !d.dryRun;
      if (!d.dryRun) { P.toast(r.message); P.SWR.invalidate(); }
    }
    $('[data-scan]', c).onclick = function () { jalan(true, this); };
    $('[data-run]', c).onclick = function () { jalan(false, this); };
  }

  function tabSistem(body, ctx) {
    Promise.all([P.api('sys.status', {}), P.apiQ('audit.list', {})]).then(function (res) {
      if (!ctx.alive()) return;
      const s = res[0].success ? res[0].data : null, au = res[1].success ? res[1].data : [];
      if (!s) { body.innerHTML = '<div class="card">' + K.kosong('error', esc(res[0].message)) + '</div>'; return; }
      const cek = function (b) { return b ? '<span class="badge b-ok">' + ic('check') + 'Tersimpan</span>' : '<span class="badge b-bad">' + ic('close') + 'Belum ada</span>'; };
      const perf = (function () { const g = {}; P.Perf.rows.forEach(function (r) { const x = g[r.aksi] || (g[r.aksi] = { n: 0, t: 0, s: 0, c: 0 }); x.n++; x.t += r.total; x.s += r.server || 0; if (r.cache) x.c++; }); return Object.keys(g).map(function (k) { const x = g[k]; return { aksi: k, n: x.n, total: Math.round(x.t / x.n), server: Math.round(x.s / x.n), cache: x.c }; }).sort(function (a, b) { return b.n - a.n; }); })();
      body.innerHTML = '<div class="grid-2" style="align-items:start"><div class="stack"><div class="card"><div class="card-h"><h3>Kesehatan Server</h3><span class="badge b-mute">v' + esc(s.versi) + '</span></div><div class="col" style="gap:10px">' +
        [['Trigger "tick" (antrean, penutupan ujian, warmup)', s.tickAktif ? '<span class="badge b-ok">Aktif</span>' : '<span class="badge b-bad">Belum dipasang</span>'],
          ['Keep-warm (cegah cold start)', s.keepWarm ? '<span class="badge b-ok">Nyala</span>' : '<span class="badge b-mute">Mati</span>'],
          ['Warmup terakhir', s.warmTerakhir ? P.fmtRelatif(new Date(s.warmTerakhir.at).getTime()) + ' (' + esc(s.warmTerakhir.scope) + ')' : '-'],
          ['Antrean notifikasi', s.antreanAda ? '<span class="badge b-warn">Ada antrean</span>' : '<span class="badge b-ok">Kosong</span>'],
          ['Sisa kuota email hari ini', s.emailSisa === null ? '-' : P.fmtNum(s.emailSisa, 0)],
          ['Ukuran Script Properties', P.fmtNum(s.ukuranProps / 1024, 1) + ' KB / 500 KB'],
          ['Cache tabel (Users / Jadwal / Soal)', [s.cache.users, s.cache.jadwal, s.cache.soal].map(function (b) { return b ? '✓' : '–'; }).join(' / ')],
          ['Trigger terpasang', esc((s.trigger || []).join(', ') || '-')]].map(function (r) { return '<div class="row between small" style="gap:12px"><span class="muted">' + r[0] + '</span><span style="text-align:right">' + r[1] + '</span></div>'; }).join('') + '</div></div>' +
        '<div class="card"><div class="card-h"><h3>Rahasia (Script Properties)</h3>' + ic('lock') + '</div><p class="tiny muted">Nilai rahasia tidak pernah dikirim ke browser — hanya status ada/tidak.</p><div class="col mt-12" style="gap:10px">' +
          [['SESSION_SECRET (tanda tangan sesi)', s.secretAda.sesi], ['PASS_PEPPER (hash sandi)', s.secretAda.pepper], ['VERIFY_SECRET (QR kartu hasil)', s.secretAda.verifikasi], ['FONNTE_TOKEN (WhatsApp)', s.secretAda.fonnte]].map(function (r) { return '<div class="row between small"><span class="mono tiny">' + r[0] + '</span>' + cek(r[1]) + '</div>'; }).join('') +
          '<div class="row between small"><span class="mono tiny">SPREADSHEET_ID</span><span class="mono tiny">' + esc(s.spreadsheetId || '-') + '</span></div></div></div></div>' +
        '<div class="stack"><div class="card"><div class="card-h"><h3>Kinerja dari Browser Ini</h3><button class="btn btn-soft btn-sm" data-wu>' + ic('bolt') + '<span>Warmup</span></button></div>' +
          (perf.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Aksi</th><th class="num">Panggilan</th><th class="num">Rata total</th><th class="num">Server</th><th class="num">Cache</th></tr></thead><tbody>' + perf.slice(0, 14).map(function (p) { return '<tr><td class="mono tiny">' + esc(p.aksi) + '</td><td class="num">' + p.n + '</td><td class="num">' + p.total + ' ms</td><td class="num">' + p.server + ' ms</td><td class="num">' + p.cache + '</td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="small muted">Belum ada data.</p>') +
          '<p class="tiny muted mt-12">Tip: buka konsol browser lalu ketik <span class="mono">Perf.table()</span> atau <span class="mono">Perf.summary()</span> untuk detail.</p></div>' +
        '<div class="card pad-0"><div style="padding:16px 18px 6px"><h3>Audit Log</h3><p class="tiny muted">300 aktivitas terakhir</p></div><div class="tbl-wrap" style="max-height:420px"><table class="tbl"><thead><tr><th>Waktu</th><th>Aktor</th><th>Aksi</th><th>Detail</th></tr></thead><tbody>' +
          (au.length ? au.map(function (a) { return '<tr><td class="tiny nowrap">' + (a.Waktu ? P.fmtTgl(new Date(a.Waktu).getTime()) : '-') + '</td><td class="small">' + esc(a.Aktor) + '</td><td><span class="badge b-mute">' + esc(a.Aksi) + '</span></td><td class="tiny" style="max-width:260px;word-break:break-word">' + esc(a.Entitas) + (a.Detail ? ' — ' + esc(String(a.Detail).slice(0, 160)) : '') + '</td></tr>'; }).join('') : '<tr><td colspan="4" class="muted small">Belum ada aktivitas.</td></tr>') + '</tbody></table></div></div></div></div>';
      $('[data-wu]', body).onclick = function () { const b = this; P.busy(b, async function () { const t0 = performance.now(); await P.api('pub.info', {}); P.toast('Server merespons dalam ' + Math.round(performance.now() - t0) + ' ms.'); }); };
    });
  }
})();
