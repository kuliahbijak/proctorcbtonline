/*
 * ProctorCBT — notif.js (Admin; dimuat saat menu dibuka)
 * Notifikasi WhatsApp & Email (pola gas-notifikasi-wa-crm): Blast per batch 10/20/50, Antrean,
 * Konfigurasi (saklar, token Fonnte tersamar, matriks event, template) + CRM Kontak (Nama · Email · WA).
 * Token Fonnte hanya dikirim sekali saat diganti; server menyimpannya di Script Properties dan
 * hanya mengembalikan versi tersamar.
 */
(function () {
  'use strict';
  const P = window.PCBT, App = window.App, K = window.AdminKit, Admin = window.Admin;
  const esc = P.esc, ic = P.ic, el = P.el, $ = P.$, $$ = P.$$;
  const Pg = window.Page_notif = {};
  const VARS = ['{nama}', '{kelas}', '{nis}', '{institusi}', '{link}'];

  function isi(tpl, v) { return String(tpl || '').replace(/\{(\w+)\}/g, function (m, k) { return v[k] !== undefined && v[k] !== '' ? v[k] : m; }); }
  function waFmt(s) { return esc(s).replace(/\*([^*\n]+)\*/g, '<b>$1</b>').replace(/_([^_\n]+)_/g, '<i>$1</i>'); }
  function waBadge(s) { return '<span class="wa-badge ' + (s === 'Terdaftar' ? 'ya' : s === 'Tidak Terdaftar' ? 'tidak' : 'belum') + '">' + (s === 'Terdaftar' ? 'WA ✓' : s === 'Tidak Terdaftar' ? 'Bukan WA' : 'Belum dicek') + '</span>'; }

  // ============================================================ NOTIFIKASI WA
  Pg.notifikasi = function (ctx) {
    let tab = P.LS.get('ntTab') || 'blast';
    if (K.blastIds && K.blastIds.length) tab = 'blast';
    ctx.page.innerHTML = '';
    const v = el('<div><div class="page-h"><div><h1>Notifikasi WhatsApp &amp; Email</h1><p>Kirim massal per batch, pantau antrean, dan atur kapan notifikasi otomatis dikirim</p></div><div class="row" data-stat></div></div>' +
      '<div class="row wrap mb-16" style="gap:6px">' + [['blast', 'Blast WhatsApp', 'campaign'], ['antrean', 'Antrean & Riwayat', 'schedule_send'], ['konfig', 'Konfigurasi', 'settings']].map(function (t) { return '<button class="chip" data-t="' + t[0] + '">' + ic(t[2]) + t[1] + '</button>'; }).join('') + '</div><div data-body></div></div>');
    ctx.page.appendChild(v);
    P.on(v, 'click', '[data-t]', function (e, b) { tab = b.dataset.t; P.LS.set('ntTab', tab); buka(); });
    P.SWR.load('notif.config', {}, 60000, function (c) {
      if (!c || !ctx.alive()) return;
      $('[data-stat]', v).innerHTML = '<span class="badge ' + (c.waAktif ? 'b-ok' : 'b-mute') + '" style="padding:8px 12px">' + ic('chat') + 'WA ' + (c.waAktif ? 'Aktif' : 'Mati') + '</span><span class="badge ' + (c.emailAktif ? 'b-ok' : 'b-mute') + '" style="padding:8px 12px">' + ic('mail') + 'Email ' + (c.emailAktif ? 'Aktif' : 'Mati') + '</span>';
    });
    function buka() {
      $$('[data-t]', v).forEach(function (b) { b.classList.toggle('on', b.dataset.t === tab); });
      const body = $('[data-body]', v); body.innerHTML = '<div class="card skel" style="height:360px"></div>';
      ({ blast: tabBlast, antrean: tabAntrean, konfig: tabKonfig })[tab](body, ctx);
    }
    buka();
  };

  function tabBlast(body, ctx) {
    let aud = null, ukuran = 20, hanyaWA = true;
    const ids = K.blastIds || null; K.blastIds = null;
    const c = el('<div><div class="layout-3" style="grid-template-columns:minmax(0,1fr) minmax(280px,380px)"><section class="stack">' +
      '<div class="card col gap-16"><div class="card-h" style="margin:0"><h3>1. Pilih Penerima</h3><span class="tiny muted">dari CRM Kontak</span></div>' +
        (ids ? '<div class="inset small row between"><span>' + ic('checklist') + ' <b>' + ids.length + ' kontak</b> dipilih dari CRM</span><button class="btn btn-soft btn-sm" data-lepas>Ganti sasaran</button></div>' : '') +
        '<div class="col gap-12" data-src' + (ids ? ' hidden' : '') + '><div class="seg" data-sumber><button data-s="crm" class="on">Segmen CRM</button><button data-s="manual">Daftar manual</button></div>' +
          '<div class="grid-3" data-crm><label class="field"><span>Segmen</span><select class="select" name="segmen"><option value="">Semua</option><option>Siswa</option><option>Guru</option><option>Admin</option><option>Umum</option></select></label>' +
            '<label class="field"><span>Kelas</span><select class="select" name="kelas"><option value="">Semua kelas</option></select></label><label class="field"><span>Tag</span><select class="select" name="tag"><option value="">Semua tag</option></select></label></div>' +
          '<label class="field hidden" data-man><span>Satu baris per penerima: <span class="mono">08xxxx | Nama</span></span><textarea class="textarea" name="manual" style="min-height:110px" placeholder="081234567890 | Bapak Ahmad&#10;081298765432 | Ibu Siti"></textarea></label></div>' +
        '<div class="row"><button class="btn btn-forest" data-muat>' + ic('group') + '<span>Muat Penerima</span></button><label class="switch"><input type="checkbox" data-hwa checked><i></i>Lewati nomor yang terdeteksi bukan WA</label></div><div data-aud></div></div>' +
      '<div class="card col gap-16"><div class="card-h" style="margin:0"><h3>2. Tulis Pesan</h3></div><label class="field"><span>Judul blast (internal)</span><input class="input" name="judul" maxlength="120" placeholder="Pengumuman jadwal UAS"></label>' +
        '<label class="field"><span>Isi pesan</span><textarea class="textarea" name="pesan" style="min-height:160px" maxlength="3000" placeholder="Assalamu\'alaikum {nama}, …"></textarea><span class="hint">Format WA: *tebal* _miring_. Variabel: ' + VARS.map(function (x) { return '<button type="button" class="chip" style="height:24px;padding:0 8px;font-size:11px" data-var="' + x + '">' + x + '</button>'; }).join(' ') + '</span></label></div>' +
      '<div class="card col gap-16"><div class="card-h" style="margin:0"><h3>3. Kirim per Batch</h3></div><div class="row wrap" style="gap:18px"><div class="field"><span>Ukuran batch</span><div class="seg" data-uk>' + [10, 20, 50].map(function (n) { return '<button type="button" data-n="' + n + '">' + n + ' / batch</button>'; }).join('') + '</div></div>' +
        '<label class="field" style="width:160px"><span>Jeda antarpesan (dtk)</span><input class="input" name="jeda" value="5" placeholder="5 atau 3-8"></label></div>' +
        '<p class="small muted">Satu batch dikirim tiap ±1 menit oleh server (trigger). Jeda acak (mis. 3-8) membantu nomor WA tidak ditandai spam. Kontak opt-out & nomor ganda otomatis dilewati.</p>' +
        '<div class="row" style="justify-content:flex-end"><button class="btn btn-gold btn-lg" data-kirim disabled>' + ic('send') + '<span>Kirim Blast</span></button></div></div></section>' +
      '<aside class="stack" style="position:sticky;top:calc(var(--hdr-h) + 12px);align-self:start"><div class="card"><div class="card-h"><h3>Pratinjau</h3><span class="tiny muted" data-pvn></span></div><div class="wa-preview"><div class="wa-bubble" data-pv>Pesan akan tampil di sini…</div></div></div>' +
        '<div class="card"><div class="card-h"><h3>Riwayat Blast</h3><button class="btn btn-ghost btn-icon btn-sm" data-rf>' + ic('refresh') + '</button></div><div class="col" style="gap:10px" data-hist><div class="skel" style="height:80px"></div></div></div></aside></div></div>');
    body.innerHTML = ''; body.appendChild(c);
    const f = { segmen: $('[name=segmen]', c), kelas: $('[name=kelas]', c), tag: $('[name=tag]', c), manual: $('[name=manual]', c), judul: $('[name=judul]', c), pesan: $('[name=pesan]', c), jeda: $('[name=jeda]', c) };
    let sumber = 'crm';
    P.SWR.load('notif.config', {}, 60000, function (cf) { if (cf && ctx.alive()) { ukuran = cf.batchDefault || 20; f.jeda.value = cf.jeda || '5'; setUk(); } });
    P.SWR.load('crm.list', { per: 10 }, 60000, function (d) {
      if (!d || !ctx.alive()) return;
      f.kelas.innerHTML = '<option value="">Semua kelas</option>' + Object.keys(d.facet.kelas).sort().map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('');
      f.tag.innerHTML = '<option value="">Semua tag</option>' + Object.keys(d.facet.tag).sort().map(function (k) { return '<option>' + esc(k) + '</option>'; }).join('');
    });
    function setUk() { $$('[data-n]', c).forEach(function (b) { b.classList.toggle('on', +b.dataset.n === ukuran); }); renderAud(); }
    P.on(c, 'click', '[data-n]', function (e, b) { ukuran = +b.dataset.n; setUk(); });
    P.on(c, 'click', '[data-s]', function (e, b) { sumber = b.dataset.s; $$('[data-s]', c).forEach(function (x) { x.classList.toggle('on', x === b); }); $('[data-crm]', c).classList.toggle('hidden', sumber !== 'crm'); $('[data-man]', c).classList.toggle('hidden', sumber !== 'manual'); aud = null; renderAud(); });
    P.on(c, 'click', '[data-var]', function (e, b) { const t = f.pesan, s = t.selectionStart || t.value.length; t.value = t.value.slice(0, s) + b.dataset.var + t.value.slice(t.selectionEnd || s); t.focus(); t.selectionStart = t.selectionEnd = s + b.dataset.var.length; pratinjau(); });
    const lepas = $('[data-lepas]', c); if (lepas) lepas.onclick = function () { $('[data-src]', c).hidden = false; this.parentElement.remove(); aud = null; renderAud(); muatIds = null; };
    let muatIds = ids;
    $('[data-hwa]', c).onchange = function () { hanyaWA = this.checked; renderAud(); };
    f.pesan.addEventListener('input', pratinjau); f.judul.addEventListener('input', cekSiap);
    function penerimaFinal() {
      if (!aud) return [];
      const seen = {};
      return aud.rows.filter(function (r) { if (!r.valid || r.ganda || r.optOut || seen[r.hp]) return false; if (hanyaWA && r.statusWA === 'Tidak Terdaftar') return false; seen[r.hp] = 1; return true; });
    }
    function pratinjau() {
      const p = penerimaFinal()[0] || { nama: 'Ahmad Fauzi', kelas: 'XII IPA 1', nis: '0012345678' };
      $('[data-pv]', c).innerHTML = f.pesan.value.trim() ? waFmt(isi(f.pesan.value, { nama: p.nama, kelas: p.kelas || '', nis: p.nis || '', institusi: App.institusi(), link: (P.SWR.peek('boot', {}) || { settings: {} }).settings.APP_URL || location.origin })) : 'Pesan akan tampil di sini…';
      $('[data-pvn]', c).textContent = 'untuk ' + p.nama;
      cekSiap();
    }
    function cekSiap() { $('[data-kirim]', c).disabled = !(penerimaFinal().length && f.pesan.value.trim() && f.judul.value.trim()); }
    function renderAud() {
      const box = $('[data-aud]', c);
      if (!aud) { box.innerHTML = ''; cekSiap(); return; }
      const r = aud.ringkas, n = penerimaFinal().length;
      box.innerHTML = '<div class="stat-tiles">' + [['Total', r.total, ''], ['Siap dikirim', n, 'var(--ok)'], ['Nomor tidak valid', r.tidakValid, r.tidakValid ? 'var(--err)' : ''], ['Ganda', r.ganda, ''], ['Terdaftar WA', r.terdaftarWA, 'var(--ok)'], ['Bukan WA', r.tidakTerdaftarWA, r.tidakTerdaftarWA ? 'var(--warn)' : ''], ['Opt-out', r.optOut, '']]
        .map(function (t) { return '<div class="tile"><span class="tiny muted">' + t[0] + '</span><b style="color:' + (t[2] || 'var(--ink)') + '">' + t[1] + '</b></div>'; }).join('') + '</div>' +
        '<p class="small mt-12">' + ic('layers') + ' <b>' + n + ' pesan</b> → <b>' + Math.ceil(n / ukuran) + ' batch</b> × ' + ukuran + ' (±' + Math.ceil(n / ukuran) + ' menit)</p>';
      pratinjau();
    }
    $('[data-muat]', c).onclick = function () {
      const b = this;
      const d = muatIds ? { ids: muatIds } : sumber === 'manual' ? { sumber: 'manual', manual: f.manual.value } : { segmen: f.segmen.value, kelas: f.kelas.value, tag: f.tag.value };
      P.busy(b, async function () { const r = await P.api('wa.audience', d); if (!r.success) return P.toast(r.message, 'err'); aud = r.data; renderAud(); if (!aud.rows.length) P.toast('Tidak ada penerima pada sasaran ini.', 'warn'); });
    };
    $('[data-kirim]', c).onclick = async function () {
      const pen = penerimaFinal();
      if (!await P.confirmDlg('Kirim <b>' + esc(f.judul.value) + '</b> ke <b>' + pen.length + ' nomor</b> dalam ' + Math.ceil(pen.length / ukuran) + ' batch?', { ok: 'Kirim Blast' })) return;
      const sas = muatIds ? muatIds.length + ' kontak terpilih' : sumber === 'manual' ? 'Daftar manual' : [f.segmen.value || 'Semua segmen', f.kelas.value, f.tag.value].filter(String).join(' • ');
      const r = await P.busy(this, function () { return P.ask('wa.blastCreate', { judul: f.judul.value.trim(), pesan: f.pesan.value, ukuranBatch: ukuran, jeda: f.jeda.value.trim(), sasaran: sas, hanyaWA: hanyaWA,
        penerima: pen.map(function (p) { return { hp: p.hp, nama: p.nama, kelas: p.kelas, nis: p.nis, statusWA: p.statusWA }; }) }, { invalidate: ['wa.blastList', 'notif.queue'] }); });
      if (r) { f.judul.value = ''; f.pesan.value = ''; aud = null; renderAud(); pratinjau(); riwayat(true); P.api('wa.blastProcess', { blastId: r.blastId }).then(function () { riwayat(true); }); }
    };
    function riwayat(force) {
      return P.SWR.load('wa.blastList', {}, 8000, function (d) {
        if (!d || !ctx.alive()) return;
        const box = $('[data-hist]', c);
        box.innerHTML = d.length ? d.slice(0, 12).map(function (b) {
          const jalan = b.status === 'Berjalan';
          return '<div class="inset" style="padding:12px"><div class="row between"><b class="small trunc" style="max-width:190px">' + esc(b.judul) + '</b><span class="badge ' + (jalan ? 'b-info' : b.status === 'Selesai' ? 'b-ok' : 'b-mute') + '">' + esc(b.status) + '</span></div>' +
            '<div class="tiny muted mt-8">' + P.fmtTgl(b.tanggal) + ' • ' + esc(b.sasaran || '-') + '</div><div class="bar mt-8"><i style="width:' + b.persen + '%"></i></div>' +
            '<div class="row between tiny mt-8"><span><b style="color:var(--ok)">' + b.terkirim + '</b> terkirim • <b style="color:var(--err)">' + b.gagal + '</b> gagal • ' + b.sisa + ' sisa</span><span>' + b.persen + '%</span></div>' +
            (jalan ? '<div class="row mt-8"><button class="btn btn-soft btn-sm grow" data-proc="' + esc(b.id) + '">' + ic('fast_forward') + '<span>Batch berikut</span></button><button class="btn btn-ghost btn-sm" data-stop="' + esc(b.id) + '">' + ic('stop_circle') + '<span>Hentikan</span></button></div>' : '') + '</div>';
        }).join('') : '<div class="small muted">Belum ada blast.</div>';
        if (d.some(function (b) { return b.status === 'Berjalan'; })) { clearTimeout(c._t); c._t = setTimeout(function () { if (ctx.alive() && document.body.contains(c)) riwayat(true); }, 12000); }
      }, { force: force });
    }
    $('[data-rf]', c).onclick = function () { riwayat(true); };
    P.on(c, 'click', '[data-proc]', function (e, b) { P.busy(b, async function () { const r = await P.api('wa.blastProcess', { blastId: b.dataset.proc }); if (!r.success) P.toast(r.message, 'err'); else P.toast('Batch diproses: ' + ((r.data.proses && r.data.proses.dikirim) || 0) + ' terkirim.'); riwayat(true); }); });
    P.on(c, 'click', '[data-stop]', async function (e, b) { if (await P.confirmDlg('Hentikan blast ini? Pesan yang belum terkirim dibatalkan.', { ok: 'Hentikan', danger: true })) { await P.ask('wa.blastStop', { blastId: b.dataset.stop }); riwayat(true); } });
    setUk(); riwayat(false);
    if (ids) $('[data-muat]', c).click();
  }

  function tabAntrean(body, ctx) {
    let st = '', kanal = '';
    const c = el('<div><div class="metrics" data-kpi></div><div class="card pad-0"><div class="row wrap between" style="padding:14px 16px;gap:10px"><div class="seg" data-k><button data-v="" class="on">Semua kanal</button><button data-v="WA">WhatsApp</button><button data-v="EMAIL">Email</button></div>' +
      '<div class="row"><button class="btn btn-white btn-sm" data-retry>' + ic('replay') + '<span>Ulangi yang gagal</span></button><button class="btn btn-forest btn-sm" data-now>' + ic('send') + '<span>Proses sekarang</span></button></div></div><div data-tbl><div class="skel" style="height:260px;margin:0 16px 16px"></div></div></div></div>');
    body.innerHTML = ''; body.appendChild(c);
    P.on(c, 'click', '[data-k] [data-v]', function (e, b) { kanal = b.dataset.v; $$('[data-k] [data-v]', c).forEach(function (x) { x.classList.toggle('on', x === b); }); load(); });
    P.on(c, 'click', '[data-st]', function (e, b) { st = st === b.dataset.st ? '' : b.dataset.st; load(); });
    $('[data-now]', c).onclick = function () { const b = this; P.busy(b, async function () { const r = await P.api('notif.processNow', {}); if (r.success) P.toast(r.data.info ? 'Antrean kosong.' : 'Diproses: ' + (r.data.dikirim || 0) + ' terkirim, ' + (r.data.gagal || 0) + ' gagal.'); else P.toast(r.message, 'err'); load(); }); };
    $('[data-retry]', c).onclick = function () { const b = this; P.busy(b, async function () { if (await P.ask('notif.retry', {})) load(); }); };
    function load() {
      const d = {}; if (st) d.status = st; if (kanal) d.kanal = kanal;
      return P.SWR.load('notif.queue', d, 0, function (x) {
        if (!x || !ctx.alive()) return;
        const r = x.ringkas;
        $('[data-kpi]', c).innerHTML = [['Antri', r.Antri, 'hourglass_top', 'b-gold'], ['Terkirim', r.Terkirim, 'done_all', 'b-ok'], ['Gagal', r.Gagal, 'error', 'b-bad'], ['Batal', r.Batal, 'block', 'b-mute']].map(function (k) {
          return '<div class="card metric kpi-click" data-st="' + k[0] + '" style="' + (st === k[0] ? 'box-shadow:0 0 0 2px var(--forest)' : '') + '"><div><div class="label">' + k[0] + '</div><div class="v">' + (k[1] || 0) + '</div><div class="s muted">' + (st === k[0] ? 'Filter aktif' : 'Klik untuk filter') + '</div></div><div class="ico ' + k[3] + '">' + ic(k[2]) + '</div></div>'; }).join('');
        $('[data-tbl]', c).innerHTML = x.rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Dibuat</th><th>Kanal</th><th>Penerima</th><th>Event</th><th>Pesan</th><th>Status</th><th>Respons</th></tr></thead><tbody>' +
          x.rows.map(function (q) { return '<tr><td class="tiny nowrap">' + P.fmtTgl(q.dibuat) + '</td><td>' + (q.kanal === 'WA' ? '<span class="badge b-ok">' + ic('chat') + 'WA</span>' : '<span class="badge b-info">' + ic('mail') + 'Email</span>') + '</td>' +
            '<td class="small"><b>' + esc(q.nama || '-') + '</b><div class="tiny muted mono">' + esc(q.tujuan) + '</div></td><td class="tiny">' + esc(q.event) + '</td><td class="tiny" style="max-width:260px">' + esc(q.pesan) + '</td>' +
            '<td>' + P.statusBadge(q.status).replace('b-mute', q.status === 'Terkirim' ? 'b-ok' : q.status === 'Gagal' ? 'b-bad' : q.status === 'Antri' || q.status === 'Proses' ? 'b-gold' : 'b-mute') + (q.coba > 1 ? '<div class="tiny muted">' + q.coba + '× coba</div>' : '') + '</td><td class="tiny" style="max-width:200px">' + esc(String(q.respon || '').slice(0, 120)) + '</td></tr>'; }).join('') + '</tbody></table></div>'
          : K.kosong('outbox', 'Antrean kosong.');
      }, { noCache: false });
    }
    load();
  }

  function tabKonfig(body, ctx) {
    P.SWR.load('notif.config', {}, 0, function (cf) {
      if (!cf || !ctx.alive()) return;
      let matriks = cf.matriks.map(function (m) { return Object.assign({}, m); }), tokenBaru = '';
      const c = el('<div class="grid-2" style="align-items:start"><div class="stack">' +
        '<div class="card col gap-16"><div class="card-h" style="margin:0"><h3>Saklar Utama</h3></div>' +
          '<label class="switch"><input type="checkbox" name="waAktif"' + (cf.waAktif ? ' checked' : '') + '><i></i><b>WhatsApp (Fonnte)</b></label><label class="switch"><input type="checkbox" name="emailAktif"' + (cf.emailAktif ? ' checked' : '') + '><i></i><b>Email (Gmail akun pemilik script)</b></label>' +
          '<p class="tiny muted">Bila dimatikan, tidak ada notifikasi otomatis yang dibuat. Sisa kuota email hari ini: <b>' + (cf.emailSisa === null ? '-' : cf.emailSisa) + '</b>. Trigger antrean: ' + (cf.trigger ? '<b style="color:var(--ok)">aktif</b>' : '<b style="color:var(--err)">belum terpasang</b>') + '</p></div>' +
        '<div class="card col gap-16"><div class="card-h" style="margin:0"><h3>Token Fonnte</h3>' + ic('key') + '</div>' +
          '<div class="inset row between"><span class="mono small">' + (cf.tokenAda ? esc(cf.token) : '<span class="muted">Belum diisi</span>') + '</span>' + (cf.tokenAda ? '<button class="btn btn-ghost btn-sm" data-hapus>' + ic('delete') + '<span>Hapus</span></button>' : '') + '</div>' +
          '<label class="field"><span>' + (cf.tokenAda ? 'Ganti token' : 'Tempel token dari dashboard Fonnte') + '</span><input class="input mono" type="password" name="token" autocomplete="off" placeholder="Token perangkat Fonnte"><span class="hint">Disimpan di Script Properties server — tidak pernah ditampilkan utuh.</span></label>' +
          '<div class="row wrap"><button class="btn btn-soft btn-sm" data-dev>' + ic('smartphone') + '<span>Cek perangkat</span></button></div><div data-devinfo></div>' +
          '<div class="row"><input class="input grow" name="tesWa" placeholder="08xxxxxxxxxx" inputmode="tel"><button class="btn btn-soft btn-sm" data-teswa>' + ic('send') + '<span>Tes WA</span></button></div>' +
          '<div class="row"><input class="input grow" name="tesEmail" type="email" placeholder="email@contoh.com"><button class="btn btn-soft btn-sm" data-tesem>' + ic('mail') + '<span>Tes Email</span></button></div></div>' +
        '<div class="card col gap-16"><div class="card-h" style="margin:0"><h3>Pengiriman</h3></div><div class="field"><span>Ukuran batch default</span><div class="seg" data-bd>' + [10, 20, 50].map(function (n) { return '<button type="button" data-n="' + n + '" class="' + (cf.batchDefault === n ? 'on' : '') + '">' + n + '</button>'; }).join('') + '</div></div>' +
          '<label class="field"><span>Jeda antarpesan (detik)</span><input class="input" name="jeda" value="' + esc(cf.jeda) + '" placeholder="5 atau 3-8"></label>' +
          '<label class="switch"><input type="checkbox" name="deteksi"' + (cf.deteksiOtomatis ? ' checked' : '') + '><i></i>Deteksi otomatis nomor terdaftar WA (kontak baru)</label>' +
          '<label class="field"><span>Nama pengirim email</span><input class="input" name="namaPengirim" value="' + esc(cf.namaPengirim || '') + '" maxlength="60"></label>' +
          '<label class="field"><span>URL aplikasi ({link} & QR verifikasi)</span><input class="input" name="appUrl" value="' + esc(cf.appUrl || '') + '" placeholder="https://username.github.io/proctorcbt/"></label></div></div>' +
        '<div class="card pad-0"><div style="padding:18px 18px 8px"><h3>Matriks Notifikasi Otomatis</h3><p class="small muted mt-8">Centang kanal per kejadian. Klik <b>Template</b> untuk mengubah isi pesan.</p></div><div class="tbl-wrap"><table class="tbl matrix"><thead><tr><th>Kejadian</th><th>WA</th><th>Email</th><th></th></tr></thead><tbody data-mx></tbody></table></div>' +
          '<div class="row" style="justify-content:flex-end;padding:16px 18px"><button class="btn btn-gold" data-save>' + ic('save') + '<span>Simpan Konfigurasi</span></button></div></div></div>');
      body.innerHTML = ''; body.appendChild(c);
      function mx() {
        $('[data-mx]', c).innerHTML = matriks.map(function (m, i) { return '<tr><td><b class="small">' + esc(m.label) + '</b><div class="tiny muted mono">' + esc(m.kode) + '</div></td><td><input type="checkbox" data-w="' + i + '"' + (m.wa ? ' checked' : '') + ' aria-label="WA"></td><td><input type="checkbox" data-e="' + i + '"' + (m.email ? ' checked' : '') + ' aria-label="Email"></td><td><button class="btn btn-soft btn-sm" data-tpl="' + i + '">' + ic('edit_note') + '<span>Template</span></button></td></tr>'; }).join('');
      }
      mx();
      let batch = cf.batchDefault;
      P.on(c, 'click', '[data-bd] [data-n]', function (e, b) { batch = +b.dataset.n; $$('[data-bd] [data-n]', c).forEach(function (x) { x.classList.toggle('on', x === b); }); });
      P.on(c, 'change', '[data-w]', function (e, b) { matriks[+b.dataset.w].wa = b.checked; });
      P.on(c, 'change', '[data-e]', function (e, b) { matriks[+b.dataset.e].email = b.checked; });
      P.on(c, 'click', '[data-tpl]', function (e, b) {
        const m = matriks[+b.dataset.tpl];
        const f = el('<div class="grid-2" style="align-items:start"><div class="col gap-12"><label class="field"><span>Subjek email</span><input class="input" data-sj value="' + esc(m.subjek) + '"></label><label class="field"><span>Isi pesan</span><textarea class="textarea" data-ps style="min-height:220px">' + esc(m.pesan) + '</textarea>' +
          '<span class="hint">Variabel umum: {nama} {institusi} {link}. Lihat template bawaan untuk variabel khusus kejadian ini.</span></label><button type="button" class="btn btn-ghost btn-sm" data-rst style="align-self:flex-start">' + ic('restart_alt') + '<span>Kembalikan bawaan</span></button></div>' +
          '<div class="wa-preview"><div class="wa-bubble" data-pv></div></div></div>');
        function pv() { $('[data-pv]', f).innerHTML = waFmt(isi($('[data-ps]', f).value, { nama: 'Ahmad Fauzi', institusi: App.institusi(), link: cf.appUrl || 'https://…', ujian: 'UAS Matematika', mapel: 'Matematika', nilai: '87,5', mulai: '12 Nov 2026 • 08:00 WIB', durasi: 90, ruang: 'Lab A', alasan: 'Batas pelanggaran tercapai', pelanggaran: 3, siswa: 'Ahmad Fauzi', nis: '0012345678', kelas: 'XII IPA 1', peserta: 32, selesai: 31, rata: 81.2, tertinggi: 98, flag: 3, dq: 1, essay: 0, email: 'guru@sekolah.sch.id', sandi: '••••••••', peran: 'Guru' })); }
        f.oninput = pv; pv();
        $('[data-rst]', f).onclick = function () { $('[data-sj]', f).value = m.subjekDefault; $('[data-ps]', f).value = m.pesanDefault; pv(); };
        P.modal({ title: 'Template — ' + m.label, size: 'lg', body: f, actions: [{ label: 'Batal' }, { label: 'Pakai', cls: 'btn-forest', onClick: function (close) { m.subjek = $('[data-sj]', f).value; m.pesan = $('[data-ps]', f).value; close(); P.toast('Template diubah — klik Simpan Konfigurasi.'); } }] });
      });
      $('[name=token]', c).addEventListener('input', function () { tokenBaru = this.value.trim(); });
      const hp = $('[data-hapus]', c);
      if (hp) hp.onclick = async function () { if (await P.confirmDlg('Hapus token Fonnte dari server? WhatsApp otomatis dimatikan.', { ok: 'Hapus Token', danger: true })) { const r = await P.ask('notif.configSave', { token: '__HAPUS__', waAktif: false }, { invalidate: ['notif.config'] }); if (r) tabKonfig(body, ctx); } };
      $('[data-dev]', c).onclick = function () { const b = this; P.busy(b, async function () { const r = await P.api('wa.device', {}); $('[data-devinfo]', c).innerHTML = r.success ? '<div class="inset small">' + [['Nomor', r.data.nomor], ['Status', r.data.status], ['Paket', r.data.paket], ['Kuota', r.data.kuota], ['Kedaluwarsa', r.data.kedaluwarsa]].map(function (x) { return '<div class="row between"><span class="muted">' + x[0] + '</span><b>' + esc(x[1]) + '</b></div>'; }).join('') + '</div>' : '<div class="inset small" style="color:var(--err)">' + esc(r.message) + '</div>'; }); };
      $('[data-teswa]', c).onclick = function () { const b = this; P.busy(b, function () { return P.ask('wa.test', { nomor: $('[name=tesWa]', c).value }); }); };
      $('[data-tesem]', c).onclick = function () { const b = this; P.busy(b, function () { return P.ask('email.test', { email: $('[name=tesEmail]', c).value }); }); };
      $('[data-save]', c).onclick = function () {
        const b = this;
        P.busy(b, async function () {
          const d = { waAktif: $('[name=waAktif]', c).checked, emailAktif: $('[name=emailAktif]', c).checked, batchDefault: batch, jeda: $('[name=jeda]', c).value.trim(), deteksiOtomatis: $('[name=deteksi]', c).checked,
            namaPengirim: $('[name=namaPengirim]', c).value, appUrl: $('[name=appUrl]', c).value.trim(), matriks: matriks };
          if (tokenBaru) d.token = tokenBaru;
          const r = await P.ask('notif.configSave', d, { invalidate: ['notif.config', 'boot'] });
          if (r) { tokenBaru = ''; tabKonfig(body, ctx); }
        });
      };
    }, { force: true });
  }

  // ============================================================ CRM KONTAK
  Pg.crm = function (ctx) {
    const f = Object.assign({ segmen: '', statusWA: '', kelas: '', tag: '', cari: '', duplikat: false, masalah: false, optOut: '', emailValid: '', halaman: 1, per: 50 }, P.LS.get('crmF') || {});
    f.halaman = 1; f.cari = '';
    const pilih = new Set();
    let data = null;
    ctx.page.innerHTML = '';
    const v = el('<div><div class="page-h"><div><h1>CRM Kontak</h1><p>Nama · Email · WhatsApp seluruh siswa, guru, dan admin — kualitas data, status WA, dan riwayat dihubungi</p></div>' +
      '<div class="row wrap"><button class="btn btn-white" data-sync>' + ic('sync') + '<span>Sinkron</span></button><button class="btn btn-white" data-cek>' + ic('verified') + '<span>Cek WA</span></button>' +
      '<button class="btn btn-white" data-imp>' + ic('upload_file') + '<span>Impor</span></button><button class="btn btn-white" data-exp>' + ic('download') + '<span>Ekspor</span></button></div></div>' +
      '<div class="stat-tiles mb-16" data-kpi>' + '<div class="tile skel" style="height:72px"></div>'.repeat(6) + '</div>' +
      '<div class="card pad-0"><div class="row wrap" style="padding:14px 16px;gap:8px"><div class="seg" data-seg></div>' +
        '<select class="select" data-f="statusWA" style="width:150px"><option value="">Status WA</option><option value="Terdaftar">Terdaftar WA</option><option value="Tidak Terdaftar">Bukan WA</option><option value="belum">Belum dicek</option></select>' +
        '<select class="select" data-f="kelas" style="width:140px"><option value="">Kelas</option></select><select class="select" data-f="tag" style="width:140px"><option value="">Tag</option></select>' +
        '<label class="input-ico grow" style="min-width:200px">' + ic('search') + '<input class="input" data-q placeholder="Cari nama, email, nomor, NIS…" style="background:var(--canvas)"></label></div>' +
        '<div class="row wrap hidden" data-bulk style="padding:10px 16px;background:#FFF9E6;gap:8px"><b class="small" data-n></b>' +
          '<button class="btn btn-soft btn-sm" data-b="tag">' + ic('sell') + '<span>Tag</span></button><button class="btn btn-soft btn-sm" data-b="untag">' + ic('label_off') + '<span>Lepas tag</span></button>' +
          '<button class="btn btn-soft btn-sm" data-b="cek">' + ic('verified') + '<span>Cek WA</span></button><button class="btn btn-soft btn-sm" data-b="blast">' + ic('campaign') + '<span>Blast</span></button>' +
          '<button class="btn btn-soft btn-sm" data-b="merge">' + ic('merge') + '<span>Gabung</span></button><button class="btn btn-soft btn-sm" data-b="optout">' + ic('notifications_off') + '<span>Opt-out</span></button><button class="btn btn-soft btn-sm" data-b="optin">' + ic('notifications_active') + '<span>Opt-in</span></button>' +
          '<button class="btn btn-ghost btn-sm" data-b="hapusManual">' + ic('delete') + '<span>Hapus (manual)</span></button><button class="btn btn-ghost btn-sm" data-b="clear">Batal pilih</button></div>' +
        '<div data-tbl><div class="skel" style="height:320px;margin:0 16px 16px"></div></div></div></div>');
    ctx.page.appendChild(v);
    $('[data-q]', v).addEventListener('input', P.debounce(function (e) { f.cari = e.target.value.trim(); f.halaman = 1; load(); }, 300));
    Admin.onSearch = function (s) { f.cari = s; $('[data-q]', v).value = s; f.halaman = 1; load(); };
    P.on(v, 'change', 'select[data-f]', function (e, b) { f[b.dataset.f] = b.value; f.halaman = 1; simpanF(); load(); });
    P.on(v, 'click', '[data-sg]', function (e, b) { f.segmen = b.dataset.sg; f.halaman = 1; simpanF(); load(); });
    P.on(v, 'click', '[data-kf]', function (e, b) { const k = b.dataset.kf; ['duplikat', 'masalah'].forEach(function (x) { if (x !== k) f[x] = false; }); f.optOut = ''; f.emailValid = ''; if (k === 'statusWA') f.statusWA = f.statusWA === 'belum' ? '' : 'belum'; else if (k === 'optOut') f.optOut = 'YA'; else if (k === 'emailValid') f.emailValid = 'YA'; else if (k === 'reset') { f.statusWA = ''; } else f[k] = !f[k]; f.halaman = 1; simpanF(); load(); });
    function simpanF() { P.LS.set('crmF', { segmen: f.segmen, statusWA: f.statusWA, kelas: f.kelas, tag: f.tag }); }

    function stats(force) {
      return P.SWR.load('crm.stats', {}, 60000, function (s) {
        if (!s || !ctx.alive()) return;
        const aktif = function (k) { return (k === 'duplikat' && f.duplikat) || (k === 'masalah' && f.masalah) || (k === 'statusWA' && f.statusWA === 'belum') || (k === 'optOut' && f.optOut === 'YA') || (k === 'emailValid' && f.emailValid === 'YA'); };
        $('[data-kpi]', v).innerHTML = [['Total kontak', s.total, '', 'reset'], ['WA valid', s.waValid, 'var(--forest)', ''], ['Terdaftar WA', s.waTerdaftar, 'var(--ok)', ''], ['Belum cek WA', s.belumCekWA, 'var(--gold-deep)', 'statusWA'],
          ['Email valid', s.emailValid, 'var(--info)', 'emailValid'], ['Duplikat', s.duplikat, s.duplikat ? 'var(--warn)' : '', 'duplikat'], ['Tak bisa dihubungi', s.tidakBisa, s.tidakBisa ? 'var(--err)' : '', 'masalah'], ['Opt-out', s.optOut, '', 'optOut'], ['Dihubungi 30 hr', s.dihubungi30, '', '']]
          .map(function (t) { return '<div class="tile' + (t[3] ? ' kpi-click' : '') + '"' + (t[3] ? ' data-kf="' + t[3] + '"' : '') + ' style="' + (aktif(t[3]) ? 'box-shadow:0 0 0 2px var(--forest)' : '') + '"><span class="tiny muted">' + t[0] + '</span><b style="color:' + (t[2] || 'var(--ink)') + '">' + t[1] + '</b></div>'; }).join('');
      }, { force: force });
    }
    function render() {
      if (!data) return;
      const fc = data.facet;
      $('[data-seg]', v).innerHTML = [['', 'Semua']].concat(Object.keys(fc.segmen).sort().map(function (s) { return [s, s]; })).map(function (s) { return '<button class="' + (f.segmen === s[0] ? 'on' : '') + '" data-sg="' + esc(s[0]) + '">' + esc(s[1]) + (s[0] ? ' (' + fc.segmen[s[0]] + ')' : '') + '</button>'; }).join('');
      const opsi = function (sel, obj, ph) { const s = $('select[data-f=' + sel + ']', v); s.innerHTML = '<option value="">' + ph + '</option>' + Object.keys(obj).sort().map(function (k) { return '<option' + (f[sel] === k ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join(''); };
      opsi('kelas', fc.kelas, 'Kelas'); opsi('tag', fc.tag, 'Tag');
      $('select[data-f=statusWA]', v).value = f.statusWA;
      const box = $('[data-tbl]', v);
      bulkBar();
      if (!data.rows.length) { box.innerHTML = K.kosong('contacts', data.total === 0 && !f.cari && !f.segmen ? 'Belum ada kontak. Klik <b>Sinkron</b> untuk menarik data dari Pengguna.' : 'Tidak ada kontak yang cocok.'); return; }
      const semua = data.rows.every(function (k) { return pilih.has(k.id); });
      box.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:36px"><input type="checkbox" data-all' + (semua ? ' checked' : '') + ' aria-label="Pilih semua"></th><th>Kontak</th><th>WhatsApp</th><th>Email</th><th>Info</th><th>Tag</th><th class="num">Pesan</th><th></th></tr></thead><tbody>' +
        data.rows.map(function (k) {
          return '<tr class="' + (pilih.has(k.id) ? 'sel' : '') + '"' + (k.optOut ? ' style="opacity:.65"' : '') + '><td><input type="checkbox" data-sel="' + esc(k.id) + '"' + (pilih.has(k.id) ? ' checked' : '') + '></td>' +
            '<td><div class="row"><span class="av sm ' + P.avColor(k.nama) + '">' + esc(P.inisial(k.nama)) + '</span><div><b>' + esc(k.nama) + '</b>' + (k.duplikat ? ' <span class="badge b-warn">duplikat</span>' : '') + (k.optOut ? ' <span class="badge b-mute">opt-out</span>' : '') + '<div class="tiny muted">' + esc(k.segmen) + (k.sumber === 'manual' ? ' • manual' : '') + '</div></div></div></td>' +
            '<td>' + (k.wa ? '<span class="mono small' + (k.waValid ? '' : '" style="color:var(--err)') + '">' + esc(k.wa) + '</span> ' + (k.waValid ? waBadge(k.statusWA) : '<span class="wa-badge tidak">tidak valid</span>') : '<span class="muted small">-</span>') + '</td>' +
            '<td class="small">' + (k.email ? esc(k.email) + (k.emailValid === 'TIDAK' ? ' <span class="wa-badge tidak">invalid</span>' : '') : '<span class="muted">-</span>') + '</td>' +
            '<td class="tiny">' + (k.kelas ? esc(k.kelas) : '') + (k.nis ? '<div class="mono muted">' + esc(k.nis) + '</div>' : '') + '</td>' +
            '<td>' + k.tag.split(',').map(function (t) { return t.trim(); }).filter(String).map(function (t) { return '<span class="badge b-forest" style="margin:1px">' + esc(t) + '</span>'; }).join('') + '</td>' +
            '<td class="num small">' + k.jumlahPesan + (k.terakhir ? '<div class="tiny muted">' + P.fmtRelatif(k.terakhir) + '</div>' : '') + '</td><td><button class="btn btn-soft btn-sm" data-det="' + esc(k.id) + '">Detail</button></td></tr>';
        }).join('') + '</tbody></table></div>';
      const n = Math.max(1, Math.ceil(data.total / f.per));
      const pg = el('<div class="pager small muted" style="padding:12px 16px"><span>' + data.total + ' kontak' + (data.syncTerakhir ? ' • sinkron ' + P.fmtRelatif(data.syncTerakhir) : '') + '</span><div class="row"><button class="btn btn-soft btn-sm btn-icon" data-p="-1"' + (f.halaman <= 1 ? ' disabled' : '') + '>' + ic('chevron_left') + '</button><span>Hal. ' + f.halaman + '/' + n + '</span><button class="btn btn-soft btn-sm btn-icon" data-p="1"' + (f.halaman >= n ? ' disabled' : '') + '>' + ic('chevron_right') + '</button></div></div>');
      P.on(pg, 'click', '[data-p]', function (e, b) { f.halaman += Number(b.dataset.p); load(); });
      box.appendChild(pg);
      $('[data-all]', box).onchange = function () { const on = this.checked; data.rows.forEach(function (k) { if (on) pilih.add(k.id); else pilih.delete(k.id); }); render(); };
    }
    function bulkBar() { $('[data-bulk]', v).classList.toggle('hidden', !pilih.size); $('[data-n]', v).textContent = pilih.size + ' kontak dipilih'; }
    P.on(v, 'change', '[data-sel]', function (e, b) { if (b.checked) pilih.add(b.dataset.sel); else pilih.delete(b.dataset.sel); b.closest('tr').classList.toggle('sel', b.checked); bulkBar(); });
    P.on(v, 'click', '[data-det]', function (e, b) { detail(b.dataset.det); });
    P.on(v, 'click', '[data-b]', async function (e, b) {
      const a = b.dataset.b, ids = Array.from(pilih);
      if (a === 'clear') { pilih.clear(); render(); return; }
      if (a === 'blast') { K.blastIds = ids; P.Router.go('notifikasi'); return; }
      if (a === 'cek') return cekWA(b, ids);
      if (a === 'merge') return gabung(ids);
      let nilai = '';
      if (a === 'tag' || a === 'untag') { nilai = await mintaTeks(a === 'tag' ? 'Tambah tag' : 'Lepas tag', 'Nama tag', a === 'untag' ? Object.keys((data && data.facet.tag) || {}) : null); if (!nilai) return; }
      if (a === 'hapusManual' && !await P.confirmDlg('Hapus kontak <b>manual</b> yang dipilih? Kontak dari data aplikasi tidak terhapus.', { ok: 'Hapus', danger: true })) return;
      const r = await P.busy(b, function () { return P.ask('crm.bulk', { ids: ids, aksi: a, nilai: nilai }, { invalidate: ['crm.list', 'crm.stats'] }); });
      if (r) { pilih.clear(); load(); stats(true); }
    });
    function mintaTeks(judul, label, saran) {
      return new Promise(function (res) {
        let val = '';
        P.modal({ title: judul, size: 'sm', body: '<label class="field"><span>' + label + '</span><input class="input" data-v list="dl-tag" maxlength="40"></label><datalist id="dl-tag">' + (saran || Object.keys((data && data.facet.tag) || {})).map(function (t) { return '<option value="' + esc(t) + '">'; }).join('') + '</datalist>',
          onClose: function () { res(val); }, actions: [{ label: 'Batal' }, { label: 'Terapkan', cls: 'btn-forest', onClick: function (close, body) { val = $('[data-v]', body).value.trim(); if (!val) return false; close(); } }] });
      });
    }
    async function cekWA(btn, ids) {
      let nomor;
      if (ids && ids.length) nomor = data.rows.filter(function (k) { return ids.indexOf(k.id) > -1 && k.waValid; }).map(function (k) { return k.wa; });
      else { const r = await P.api('crm.list', { statusWA: 'belum', per: 50 }); nomor = r.success ? r.data.rows.filter(function (k) { return k.waValid; }).map(function (k) { return k.wa; }) : []; }
      if (!nomor.length) return P.toast('Tidak ada nomor valid yang perlu dicek.', 'warn');
      const r = await P.busy(btn, function () { return P.ask('wa.validate', { nomor: nomor.slice(0, 50) }, { invalidate: ['crm.list', 'crm.stats', 'users.list'], ok: false }); });
      if (r) { P.toast(r.dicek + ' nomor dicek: ' + r.terdaftar + ' terdaftar WA.'); load(); stats(true); }
    }
    function gabung(ids) {
      if (ids.length < 2) return P.toast('Pilih minimal 2 kontak untuk digabung.', 'warn');
      const ks = data.rows.filter(function (k) { return ids.indexOf(k.id) > -1; });
      P.modal({ title: 'Gabung Kontak Duplikat', body: '<p class="small muted">Pilih kontak <b>utama</b>. Kontak lain ditandai "merged" (tidak dihapus) dan tag/catatan/jumlah pesannya dipindah ke kontak utama.</p><div class="col mt-12" style="gap:6px">' +
        ks.map(function (k, i) { return '<label class="inset check" style="padding:10px 12px"><input type="radio" name="utama" value="' + esc(k.id) + '"' + (i === 0 ? ' checked' : '') + '><span><b>' + esc(k.nama) + '</b> <span class="tiny muted">' + esc(k.segmen) + ' • ' + esc(k.wa || '-') + ' • ' + esc(k.email || '-') + '</span></span></label>'; }).join('') + '</div>',
        actions: [{ label: 'Batal' }, { label: 'Gabungkan', icon: 'merge', cls: 'btn-forest', onClick: async function (close, body) { const u = $('input[name=utama]:checked', body).value; const r = await P.ask('crm.merge', { utama: u, gabung: ids }, { invalidate: ['crm.list', 'crm.stats'] }); if (!r) return false; close(); pilih.clear(); load(); stats(true); } }] });
    }
    async function detail(id) {
      const d = P.drawer('Kontak', '<div class="skel" style="height:380px"></div>');
      const r = await P.api('crm.detail', { id: id });
      if (!r.success) { d.body.innerHTML = K.kosong('error', esc(r.message)); return; }
      const k = r.data.kontak;
      d.el.querySelector('h2').textContent = k.nama;
      d.body.innerHTML = '<div class="row wrap" style="gap:6px"><span class="badge b-mute">' + esc(k.segmen) + '</span>' + (k.wa ? waBadge(k.statusWA) : '') + (k.duplikat ? '<span class="badge b-warn">duplikat</span>' : '') + (k.kelas ? '<span class="badge b-mute">' + esc(k.kelas) + '</span>' : '') + '</div>' +
        '<form class="col gap-12 mt-16" data-f><label class="field"><span>Nama</span><input class="input" name="nama" value="' + esc(k.nama) + '"></label><div class="grid-2"><label class="field"><span>WhatsApp</span><input class="input mono" name="wa" value="' + esc(k.wa) + '" inputmode="tel"></label><label class="field"><span>Email</span><input class="input" name="email" type="email" value="' + esc(k.email) + '"></label></div>' +
          '<label class="field"><span>Tag (pisah koma)</span><input class="input" name="tag" value="' + esc(k.tag) + '"></label><label class="field"><span>Catatan</span><textarea class="textarea" name="catatan" style="min-height:64px">' + esc(k.catatan) + '</textarea></label>' +
          '<label class="switch"><input type="checkbox" name="optOut"' + (k.optOut ? ' checked' : '') + '><i></i>Opt-out (tidak menerima blast)</label>' +
          (k.sumber !== 'manual' ? '<p class="tiny muted">Perubahan nama/WA/email juga diterapkan ke data Pengguna (satu sumber kebenaran).</p>' : '') +
          '<div class="row" style="justify-content:flex-end">' + (k.wa ? '<a class="btn btn-soft btn-sm" target="_blank" rel="noopener" href="https://wa.me/' + esc(String(k.wa).replace(/^0/, '62')) + '">' + ic('chat') + '<span>Buka WA</span></a>' : '') + '<button class="btn btn-gold btn-sm" type="submit">' + ic('save') + '<span>Simpan</span></button></div></form>' +
        '<h3 class="mt-24">Catat Interaksi</h3><div class="row mt-12"><select class="select" data-kn style="width:140px"><option>Telepon</option><option>WA Manual</option><option>Kunjungan</option><option>Catatan</option></select><input class="input grow" data-rk placeholder="Ringkasan interaksi"><button class="btn btn-forest btn-sm" data-add>' + ic('add') + '</button></div>' +
        '<h3 class="mt-24">Riwayat (' + r.data.timeline.length + ')</h3><div class="col mt-12" style="gap:6px">' + (r.data.timeline.length ? r.data.timeline.map(function (t) { return '<div class="inset small" style="padding:10px 12px"><div class="row between"><b>' + esc(t.kanal) + (t.status ? ' • ' + esc(t.status) : '') + '</b><span class="tiny muted">' + (t.waktu ? P.fmtTgl(t.waktu) : '-') + '</span></div><div class="mt-8">' + esc(t.ringkasan) + '</div><div class="tiny muted">' + esc(t.oleh) + '</div></div>'; }).join('') : '<div class="inset small muted">Belum ada riwayat.</div>') + '</div>';
      const fm = $('[data-f]', d.body);
      fm.addEventListener('submit', async function (e) {
        e.preventDefault();
        const r2 = await P.busy($('button[type=submit]', fm), function () { return P.ask('crm.save', { kontak: { id: k.id, nama: fm.nama.value, wa: fm.wa.value, email: fm.email.value, tag: fm.tag.value, catatan: fm.catatan.value, optOut: fm.optOut.checked } }, { invalidate: ['crm.list', 'crm.stats', 'users.list'] }); });
        if (r2) { d.close(); load(); stats(true); }
      });
      $('[data-add]', d.body).onclick = async function () {
        const rk = $('[data-rk]', d.body).value.trim(); if (!rk) return P.toast('Isi ringkasan.', 'warn');
        if (await P.busy(this, function () { return P.ask('crm.interaksi', { kontakId: k.id, kanal: $('[data-kn]', d.body).value, ringkasan: rk }); })) { d.close(); detail(id); }
      };
    }
    $('[data-sync]', v).onclick = function () { const b = this; P.busy(b, async function () { if (await P.ask('crm.sync', {}, { invalidate: ['crm.list', 'crm.stats'] })) { load(); stats(true); } }); };
    $('[data-cek]', v).onclick = function () { cekWA(this, null); };
    $('[data-exp]', v).onclick = function () {
      const b = this;
      P.busy(b, async function () {
        const q = Object.assign({}, f); delete q.halaman; delete q.per;
        const r = await P.api('crm.export', q); if (!r.success) return P.toast(r.message, 'err');
        await K.exportXlsx('CRM_Kontak', { Kontak: [['Nama', 'Segmen', 'WhatsApp', 'Status WA', 'Email', 'Email Valid', 'Kelas', 'NIS', 'Tag', 'Opt-out', 'Jumlah Pesan', 'Terakhir Dihubungi', 'Catatan']].concat(r.data.map(function (k) { return [k.nama, k.segmen, k.wa, k.statusWA, k.email, k.emailValid, k.kelas, k.nis, k.tag, k.optOut ? 'YA' : 'TIDAK', k.jumlahPesan, k.terakhir ? P.fmtTgl(k.terakhir) : '', k.catatan]; })) });
      });
    };
    $('[data-imp]', v).onclick = function () {
      let rows = null;
      const body = el('<div class="col gap-12"><p class="small muted">Untuk kontak di luar data aplikasi (mis. wali siswa). Kolom: <span class="mono">Nama, WA, Email, Segmen, Tag</span>. Kontak dengan nomor/email sama diperbarui.</p><label class="inset col" style="align-items:center;cursor:pointer;border:2px dashed var(--outline-2);padding:22px">' + ic('upload_file') + '<b class="mt-8" data-fn>Pilih .xlsx / .csv</b><input type="file" accept=".xlsx,.xls,.csv" hidden data-file></label><div data-rep></div></div>');
      const m = P.modal({ title: 'Impor Kontak', body: body, actions: [{ label: 'Batal' }, { label: 'Impor', cls: 'btn-gold', icon: 'publish', onClick: async function (close) { if (!rows) return false; const r = await P.ask('crm.import', { rows: rows }, { invalidate: ['crm.list', 'crm.stats'] }); if (!r) return false; close(); load(); stats(true); if (r.gagal.length) P.toast(r.gagal.length + ' baris gagal (nama kosong / tanpa WA & email valid).', 'warn'); } }] });
      const go = $$('.modal-f .btn', m.el).pop(); go.disabled = true;
      $('[data-file]', body).onchange = async function () { const fl = this.files[0]; if (!fl) return; $('[data-fn]', body).textContent = fl.name; try { rows = await K.bacaFile(fl); $('[data-rep]', body).innerHTML = '<div class="inset small">' + rows.length + ' baris terbaca. Klik <b>Impor</b>.</div>'; go.disabled = !rows.length; } catch (e) { $('[data-rep]', body).innerHTML = '<div class="inset small" style="color:var(--err)">' + esc(e.message) + '</div>'; } };
    };
    function load() {
      const q = {}; Object.keys(f).forEach(function (k) { if (f[k] !== '' && f[k] !== false) q[k] = f[k]; });
      return P.SWR.load('crm.list', q, 30000, function (d) { if (d && ctx.alive()) { data = d; render(); stats(false); } });
    }
    load(); stats(false);
  };
})();
