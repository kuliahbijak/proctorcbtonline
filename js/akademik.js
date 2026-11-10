/*
 * ProctorCBT — akademik.js (dimuat saat menu dibuka)
 * Bank Soal (+ mapel, impor/ekspor Excel dengan validasi per baris), Hasil & Nilai (+ kartu PDF ber-QR,
 * berita acara), Koreksi Essay, Log Pelanggaran, Laporan & Statistik.
 */
(function () {
  'use strict';
  const P = window.PCBT, App = window.App, K = window.AdminKit, Admin = window.Admin;
  const esc = P.esc, ic = P.ic, el = P.el, $ = P.$, $$ = P.$$;
  const Pg = window.Page_akademik = {};
  const PER_HAL = 50;

  function appUrl() { const b = P.SWR.peek('boot', {}); return (b && b.settings && b.settings.APP_URL) || location.origin + location.pathname.replace(/index\.html$/, ''); }
  function pager(total, hal, onGo) {
    const n = Math.max(1, Math.ceil(total / PER_HAL));
    const w = el('<div class="pager small muted"><span>' + (total ? ((hal - 1) * PER_HAL + 1) + '–' + Math.min(total, hal * PER_HAL) + ' dari ' + P.fmtNum(total, 0) : '0 data') + '</span>' +
      '<div class="row"><button class="btn btn-soft btn-sm btn-icon" data-p="-1"' + (hal <= 1 ? ' disabled' : '') + ' aria-label="Sebelumnya">' + ic('chevron_left') + '</button><span>Hal. ' + hal + '/' + n + '</span>' +
      '<button class="btn btn-soft btn-sm btn-icon" data-p="1"' + (hal >= n ? ' disabled' : '') + ' aria-label="Berikutnya">' + ic('chevron_right') + '</button></div></div>');
    P.on(w, 'click', '[data-p]', function (e, b) { onGo(Math.min(n, Math.max(1, hal + Number(b.dataset.p)))); });
    return w;
  }
  function cocokTeks(o, q, keys) { if (!q) return true; q = q.toLowerCase(); return keys.some(function (k) { return String(o[k] == null ? '' : o[k]).toLowerCase().indexOf(q) > -1; }); }
  function strip(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }

  // ============================================================ BANK SOAL
  Pg['bank-soal'] = function (ctx) {
    let soal = null, mapel = [], fMapel = P.LS.get('bsMapel') || '', fTipe = '', q = '', hal = 1;
    const pilih = new Set();
    ctx.page.innerHTML = '';
    const v = el('<div><div class="page-h"><div><h1>Bank Soal</h1><p>Kelola soal pilihan ganda & essay per mata pelajaran — impor massal dari Excel dengan validasi per baris</p></div>' +
      '<div class="row wrap"><button class="btn btn-white" data-mapel>' + ic('library_books') + '<span>Mata Pelajaran</span></button><button class="btn btn-white" data-tpl>' + ic('description') + '<span>Template</span></button>' +
      '<button class="btn btn-white" data-exp>' + ic('download') + '<span>Ekspor</span></button><button class="btn btn-white" data-imp>' + ic('upload_file') + '<span>Impor Excel</span></button>' +
      '<button class="btn btn-gold" data-add>' + ic('add_circle') + '<span>Tambah Soal</span></button></div></div>' +
      '<div class="row wrap mb-16" data-chips style="gap:6px"></div>' +
      '<div class="card pad-0"><div class="row wrap between" style="padding:14px 16px;gap:10px"><div class="row wrap"><div class="seg" data-tipe><button class="on" data-t="">Semua</button><button data-t="PG">Pilihan Ganda</button><button data-t="Essay">Essay</button></div>' +
        '<button class="btn btn-danger btn-sm hidden" data-bulk>' + ic('delete') + '<span>Hapus terpilih</span></button></div>' +
        '<label class="input-ico" style="min-width:240px;flex:1;max-width:420px">' + ic('search') + '<input class="input" data-q placeholder="Cari teks soal, kunci, ID…" style="background:var(--canvas)"></label></div>' +
        '<div data-tbl><div class="skel" style="height:320px;margin:0 16px 16px"></div></div></div></div>');
    ctx.page.appendChild(v);
    $('[data-add]', v).onclick = function () { Pg.formSoal(null, fMapel); };
    $('[data-imp]', v).onclick = function () { Pg.formImport(fMapel); };
    $('[data-mapel]', v).onclick = kelolaMapel;
    $('[data-tpl]', v).onclick = function () { const b = this; P.busy(b, unduhTemplate); };
    $('[data-exp]', v).onclick = function () { const b = this; P.busy(b, ekspor); };
    $('[data-q]', v).addEventListener('input', P.debounce(function (e) { q = e.target.value.trim(); hal = 1; render(); }, 150));
    Admin.onSearch = function (s) { q = s; $('[data-q]', v).value = s; hal = 1; render(); };
    P.on(v, 'click', '[data-t]', function (e, b) { fTipe = b.dataset.t; hal = 1; $$('[data-t]', v).forEach(function (x) { x.classList.toggle('on', x === b); }); render(); });
    P.on(v, 'click', '[data-m]', function (e, b) { fMapel = b.dataset.m; P.LS.set('bsMapel', fMapel); hal = 1; pilih.clear(); renderChips(); render(); });
    $('[data-bulk]', v).onclick = async function () {
      if (!await P.confirmDlg('Hapus <b>' + pilih.size + ' soal</b> terpilih? Tindakan ini tidak bisa dibatalkan.', { ok: 'Hapus', danger: true })) return;
      const r = await P.busy(this, function () { return P.ask('soal.delete', { ids: Array.from(pilih) }, { invalidate: ['soal.list', 'mapel.list', 'boot'] }); });
      if (r) { soal = soal.filter(function (s) { return !pilih.has(s.id); }); pilih.clear(); renderChips(); render(); K.updateCounts({ soal: soal.length }); }
    };

    function renderChips() {
      const cnt = {}; (soal || []).forEach(function (s) { cnt[s.mapel] = (cnt[s.mapel] || 0) + 1; });
      if (fMapel && !mapel.some(function (m) { return m.id === fMapel; })) fMapel = '';
      $('[data-chips]', v).innerHTML = '<button class="chip' + (!fMapel ? ' on' : '') + '" data-m="">Semua Mapel<span class="n">' + (soal ? soal.length : '…') + '</span></button>' +
        mapel.map(function (m) { return '<button class="chip' + (fMapel === m.id ? ' on' : '') + '" data-m="' + esc(m.id) + '">' + esc(m.nama) + '<span class="n">' + (cnt[m.id] || 0) + '</span></button>'; }).join('') +
        (mapel.length ? '' : '<span class="small muted">Belum ada mata pelajaran — klik <b>Mata Pelajaran</b> untuk menambah.</span>');
    }
    function terfilter() {
      return (soal || []).filter(function (s) { return (!fMapel || s.mapel === fMapel) && (!fTipe || s.tipe === fTipe) && cocokTeks(s, q, ['q', 'kunci', 'id', 'a', 'b', 'c', 'd']); });
    }
    function render() {
      if (!soal) return;
      const rows = terfilter(), mp = {}; mapel.forEach(function (m) { mp[m.id] = m.nama; });
      const box = $('[data-tbl]', v);
      $('[data-bulk]', v).classList.toggle('hidden', !pilih.size);
      $('[data-bulk] span:last-child', v).textContent = 'Hapus ' + pilih.size + ' terpilih';
      if (!rows.length) {
        box.innerHTML = K.kosong('quiz', soal.length ? 'Tidak ada soal yang cocok dengan filter.' : 'Bank soal masih kosong. Tambah satu per satu atau impor dari Excel.',
          soal.length ? '' : '<div class="row mt-16" style="justify-content:center"><button class="btn btn-gold" data-add2>' + ic('add_circle') + '<span>Tambah Soal</span></button><button class="btn btn-white" data-imp2>' + ic('upload_file') + '<span>Impor Excel</span></button></div>');
        const a2 = $('[data-add2]', box); if (a2) { a2.onclick = function () { Pg.formSoal(null, fMapel); }; $('[data-imp2]', box).onclick = function () { Pg.formImport(fMapel); }; }
        return;
      }
      const maxHal = Math.ceil(rows.length / PER_HAL); if (hal > maxHal) hal = maxHal;
      const page = rows.slice((hal - 1) * PER_HAL, hal * PER_HAL), semua = page.every(function (s) { return pilih.has(s.id); });
      box.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th style="width:36px"><input type="checkbox" data-all' + (semua ? ' checked' : '') + ' aria-label="Pilih semua"></th><th style="width:44px">No</th><th>Pertanyaan</th><th>Tipe</th><th>Kunci</th><th class="num">Bobot</th>' + (fMapel ? '' : '<th>Mapel</th>') + '<th></th></tr></thead><tbody>' +
        page.map(function (s, i) {
          return '<tr class="' + (pilih.has(s.id) ? 'sel' : '') + '"><td><input type="checkbox" data-sel="' + esc(s.id) + '"' + (pilih.has(s.id) ? ' checked' : '') + ' aria-label="Pilih soal"></td><td class="muted">' + ((hal - 1) * PER_HAL + i + 1) + '</td>' +
            '<td style="max-width:520px"><div class="trunc" style="max-width:520px" title="' + esc(strip(s.q).slice(0, 300)) + '">' + (s.img ? ic('image') + ' ' : '') + esc(strip(s.q).slice(0, 160)) + '</div>' +
              (s.tipe === 'PG' ? '<div class="tiny muted trunc" style="max-width:520px">A. ' + esc(strip(s.a).slice(0, 40)) + ' • B. ' + esc(strip(s.b).slice(0, 40)) + ' • C. ' + esc(strip(s.c).slice(0, 40)) + ' • D. ' + esc(strip(s.d).slice(0, 40)) + '</div>' : '') + '</td>' +
            '<td><span class="badge ' + (s.tipe === 'PG' ? 'b-forest' : 'b-gold') + '">' + (s.tipe === 'PG' ? 'PG' : 'Essay') + '</span></td>' +
            '<td>' + (s.tipe === 'PG' ? '<b class="mono">' + esc(s.kunci) + '</b>' : '<span class="tiny muted">' + (s.kunci ? 'Rubrik ✓' : 'Tanpa rubrik') + '</span>') + '</td><td class="num">' + P.fmtNum(s.bobot) + '</td>' +
            (fMapel ? '' : '<td class="small">' + esc(mp[s.mapel] || '-') + '</td>') +
            '<td class="nowrap"><button class="btn btn-ghost btn-icon btn-sm" data-ed="' + esc(s.id) + '" title="Edit">' + ic('edit') + '</button><button class="btn btn-ghost btn-icon btn-sm" data-dup="' + esc(s.id) + '" title="Duplikat">' + ic('content_copy') + '</button><button class="btn btn-ghost btn-icon btn-sm" data-del="' + esc(s.id) + '" title="Hapus">' + ic('delete') + '</button></td></tr>';
        }).join('') + '</tbody></table></div>';
      const pg = pager(rows.length, hal, function (h) { hal = h; render(); }); pg.style.padding = '12px 16px'; box.appendChild(pg);
      $('[data-all]', box).onchange = function () { const on = this.checked; page.forEach(function (s) { if (on) pilih.add(s.id); else pilih.delete(s.id); }); render(); };
    }
    P.on(v, 'change', '[data-sel]', function (e, b) { if (b.checked) pilih.add(b.dataset.sel); else pilih.delete(b.dataset.sel); b.closest('tr').classList.toggle('sel', b.checked); $('[data-bulk]', v).classList.toggle('hidden', !pilih.size); $('[data-bulk] span:last-child', v).textContent = 'Hapus ' + pilih.size + ' terpilih'; });
    P.on(v, 'click', '[data-ed]', function (e, b) { Pg.formSoal(soal.filter(function (s) { return s.id === b.dataset.ed; })[0]); });
    P.on(v, 'click', '[data-dup]', function (e, b) { const s = Object.assign({}, soal.filter(function (x) { return x.id === b.dataset.dup; })[0]); delete s.id; Pg.formSoal(s); });
    P.on(v, 'click', '[data-del]', async function (e, b) {
      if (!await P.confirmDlg('Hapus soal ini dari bank soal?', { ok: 'Hapus', danger: true })) return;
      const r = await P.ask('soal.delete', { ids: [b.dataset.del] }, { invalidate: ['soal.list', 'mapel.list', 'boot'] });
      if (r) { soal = soal.filter(function (s) { return s.id !== b.dataset.del; }); pilih.delete(b.dataset.del); renderChips(); render(); }
    });

    function load(force) {
      return Promise.all([
        P.SWR.load('mapel.list', {}, 60000, function (d) { if (d && ctx.alive()) { mapel = d; renderChips(); render(); } }, { force: force }),
        P.SWR.load('soal.list', {}, 30000, function (d) { if (d && ctx.alive()) { soal = d; renderChips(); render(); } }, { force: force })
      ]);
    }
    load(false);
    Pg._reloadSoal = function () { if (ctx.alive()) load(true); };

    async function kelolaMapel() {
      const isAdm = K.isAdmin();
      let guru = [];
      if (isAdm) { const r = await P.apiQ('users.list', {}); guru = r.success ? r.data.filter(function (u) { return u.role !== 'Siswa' && u.aktif; }) : []; }
      const m = P.modal({ title: 'Mata Pelajaran', size: 'lg', body: '<div data-list></div><form class="inset mt-16 col gap-12" data-f><b class="small" data-ft>Tambah mata pelajaran</b><input type="hidden" name="id">' +
        '<div class="grid-3"><label class="field"><span>Nama</span><input class="input" name="nama" maxlength="120" placeholder="Matematika Diskrit" required></label><label class="field"><span>Kode</span><input class="input" name="kode" maxlength="30" placeholder="MTK-01" style="text-transform:uppercase"></label>' +
        (isAdm ? '<label class="field"><span>Guru pengampu</span><select class="select" name="guru">' + guru.map(function (g) { return '<option value="' + esc(g.id) + '"' + (g.id === K.me().id ? ' selected' : '') + '>' + esc(g.nama) + ' (' + g.role + ')</option>'; }).join('') + '</select></label>' : '<div></div>') + '</div>' +
        '<div class="row" style="justify-content:flex-end"><button type="button" class="btn btn-soft btn-sm hidden" data-cancel>Batal edit</button><button class="btn btn-forest btn-sm" type="submit">' + ic('save') + '<span>Simpan</span></button></div></form>' });
      const f = $('[data-f]', m.body);
      function list() {
        $('[data-list]', m.body).innerHTML = mapel.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nama</th><th>Kode</th>' + (isAdm ? '<th>Pengampu</th>' : '') + '<th class="num">Soal</th><th></th></tr></thead><tbody>' +
          mapel.map(function (x) { return '<tr><td><b>' + esc(x.nama) + '</b></td><td class="mono small">' + esc(x.kode || '-') + '</td>' + (isAdm ? '<td class="small">' + esc(x.namaGuru) + '</td>' : '') + '<td class="num">' + x.soal + '</td>' +
            '<td class="nowrap"><button class="btn btn-ghost btn-icon btn-sm" data-me="' + esc(x.id) + '">' + ic('edit') + '</button><button class="btn btn-ghost btn-icon btn-sm" data-md="' + esc(x.id) + '">' + ic('delete') + '</button></td></tr>'; }).join('') + '</tbody></table></div>'
          : K.kosong('library_books', 'Belum ada mata pelajaran.');
      }
      list();
      function resetF() { f.reset(); f.id.value = ''; $('[data-ft]', f).textContent = 'Tambah mata pelajaran'; $('[data-cancel]', f).classList.add('hidden'); }
      $('[data-cancel]', f).onclick = resetF;
      P.on(m.body, 'click', '[data-me]', function (e, b) { const x = mapel.filter(function (y) { return y.id === b.dataset.me; })[0]; f.id.value = x.id; f.nama.value = x.nama; f.kode.value = x.kode; if (f.guru) f.guru.value = x.guru; $('[data-ft]', f).textContent = 'Edit: ' + x.nama; $('[data-cancel]', f).classList.remove('hidden'); f.nama.focus(); });
      P.on(m.body, 'click', '[data-md]', async function (e, b) {
        const x = mapel.filter(function (y) { return y.id === b.dataset.md; })[0];
        if (!await P.confirmDlg('Hapus mapel <b>' + esc(x.nama) + '</b>?', { ok: 'Hapus', danger: true })) return;
        if (await P.ask('mapel.delete', { id: x.id }, { invalidate: ['mapel.list', 'boot'] })) { mapel = mapel.filter(function (y) { return y.id !== x.id; }); list(); renderChips(); }
      });
      f.addEventListener('submit', async function (e) {
        e.preventDefault();
        const btn = $('button[type=submit]', f);
        const r = await P.busy(btn, function () { return P.ask('mapel.save', { id: f.id.value, nama: f.nama.value.trim(), kode: f.kode.value.trim(), guru: f.guru ? f.guru.value : '' }, { invalidate: ['mapel.list', 'boot'] }); });
        if (!r) return;
        const rr = await P.api('mapel.list', {}); if (rr.success) { mapel = rr.data; list(); renderChips(); render(); }
        resetF();
      });
    }
    async function unduhTemplate() {
      await K.exportXlsx('Template_Bank_Soal_ProctorCBT', {
        Soal: [['Tipe_Soal', 'Pertanyaan', 'Opsi_A', 'Opsi_B', 'Opsi_C', 'Opsi_D', 'Kunci_Jawaban', 'Bobot_Nilai', 'Gambar_URL', 'ID_Soal'],
          ['PG', 'Hasil dari 2 + 3 × 4 adalah …', '20', '14', '24', '11', 'B', 1, '', ''],
          ['Essay', 'Jelaskan perbedaan graf berarah dan graf tak berarah beserta contohnya!', '', '', '', '', 'Rubrik: definisi (4), contoh (4), kejelasan (2)', 10, '', '']],
        Petunjuk: [['Kolom', 'Keterangan'], ['Tipe_Soal', 'PG atau Essay'], ['Pertanyaan', 'Wajib diisi'], ['Opsi_A–Opsi_D', 'Wajib untuk PG; kosongkan untuk Essay'],
          ['Kunci_Jawaban', 'PG: huruf A/B/C/D. Essay: rubrik/kunci penilaian (opsional, hanya terlihat guru)'], ['Bobot_Nilai', 'Angka > 0 (poin maksimal soal)'],
          ['Gambar_URL', 'Opsional: link gambar https://'], ['ID_Soal', 'Kosongkan untuk soal baru. Isi (dari file ekspor) untuk memperbarui soal yang sudah ada'],
          ['Mode impor', '"Tambah": soal baru ditambahkan, ID_Soal yang cocok diperbarui. "Timpa": SEMUA soal mapel tujuan diganti isi file']]
      });
    }
    async function ekspor() {
      const rows = terfilter(); if (!rows.length) return P.toast('Tidak ada soal untuk diekspor.', 'warn');
      const mp = {}; mapel.forEach(function (m) { mp[m.id] = m.nama; });
      await K.exportXlsx('Bank_Soal_' + (fMapel ? mp[fMapel] : 'Semua') + '_' + P.fmtTgl(Date.now(), false), {
        Soal: [['Tipe_Soal', 'Pertanyaan', 'Opsi_A', 'Opsi_B', 'Opsi_C', 'Opsi_D', 'Kunci_Jawaban', 'Bobot_Nilai', 'Gambar_URL', 'ID_Soal', 'Mapel']]
          .concat(rows.map(function (s) { return [s.tipe, s.q, s.a, s.b, s.c, s.d, s.kunci, s.bobot, s.img, s.id, mp[s.mapel] || '']; }))
      });
      P.toast(rows.length + ' soal diekspor.');
    }
  };

  /** Form tambah/edit soal (juga dipanggil dari tombol "Buat Baru"). */
  Pg.formSoal = async function (s, mapelDefault) {
    const r = await P.apiQ('mapel.list', {}); const mapel = r.success ? r.data : [];
    if (!mapel.length) return P.modal({ title: 'Belum ada mata pelajaran', size: 'sm', body: '<p>Tambahkan mata pelajaran terlebih dahulu dari menu Bank Soal → <b>Mata Pelajaran</b>.</p>', actions: [{ label: 'Tutup' }, { label: 'Ke Bank Soal', cls: 'btn-forest', onClick: function (c) { c(); P.Router.go('bank-soal'); } }] });
    const x = s || { tipe: 'PG', bobot: 1, mapel: mapelDefault || (P.LS.get('bsMapel') || mapel[0].id) };
    let tipe = x.tipe || 'PG';
    const body = el('<form class="col gap-16" novalidate>' +
      '<div class="grid-2"><label class="field"><span>Mata pelajaran</span><select class="select" name="mapel">' + mapel.map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === x.mapel ? ' selected' : '') + '>' + esc(m.nama) + '</option>'; }).join('') + '</select></label>' +
        '<div class="field"><span>Tipe soal</span><div class="seg" data-tp><button type="button" data-v="PG">Pilihan Ganda</button><button type="button" data-v="Essay">Essay</button></div></div></div>' +
      '<label class="field"><span>Pertanyaan</span><textarea class="textarea" name="q" style="min-height:120px" maxlength="20000" placeholder="Tulis pertanyaan…">' + esc(x.q || '') + '</textarea></label>' +
      '<div class="field"><span>Gambar (opsional)</span><div class="row wrap"><input class="input grow" name="img" value="' + esc(x.img || '') + '" placeholder="https://… atau unggah →" style="min-width:200px"><label class="btn btn-soft">' + ic('add_photo_alternate') + '<span>Unggah</span><input type="file" accept="image/png,image/jpeg,image/gif,image/webp" data-file hidden></label></div><img data-prev class="qimg' + (x.img ? '' : ' hidden') + '" src="' + esc(x.img || '') + '" alt=""></div>' +
      '<div data-pg class="col gap-12"><span class="label">Opsi jawaban — pilih kunci</span>' + ['A', 'B', 'C', 'D'].map(function (k) {
        return '<div class="row"><label class="check" title="Jadikan kunci" style="flex:none"><input type="radio" name="kunci" value="' + k + '"' + (String(x.kunci).toUpperCase() === k ? ' checked' : '') + '><b class="mono">' + k + '</b></label><input class="input grow" name="o' + k + '" value="' + esc(x[k.toLowerCase()] || '') + '" placeholder="Opsi ' + k + '"></div>';
      }).join('') + '</div>' +
      '<label class="field hidden" data-es><span>Rubrik / kunci penilaian essay (hanya terlihat guru)</span><textarea class="textarea" name="rubrik" placeholder="Contoh: definisi benar (4), contoh relevan (4), bahasa runtut (2)">' + esc(tipe === 'Essay' ? x.kunci || '' : '') + '</textarea></label>' +
      '<label class="field" style="max-width:200px"><span>Bobot (poin maksimal)</span><input class="input" type="number" name="bobot" min="0.5" step="0.5" value="' + (x.bobot || 1) + '"></label></form>');
    function setTipe(t) { tipe = t; $$('[data-v]', body).forEach(function (b) { b.classList.toggle('on', b.dataset.v === t); }); $('[data-pg]', body).classList.toggle('hidden', t !== 'PG'); $('[data-es]', body).classList.toggle('hidden', t !== 'Essay'); }
    setTipe(tipe);
    P.on(body, 'click', '[data-v]', function (e, b) { setTipe(b.dataset.v); });
    body.img.addEventListener('input', function () { const p = $('[data-prev]', body); p.src = body.img.value; p.classList.toggle('hidden', !body.img.value); });
    P.on(body, 'change', '[data-file]', async function (e, inp) {
      const f = inp.files[0]; if (!f) return;
      inp.value = '';
      if (f.size > 4 * 1024 * 1024) return P.toast('Ukuran gambar maksimal 4 MB.', 'warn');
      const lbl = inp.parentElement, span = $('span:not(.ms)', lbl); lbl.style.pointerEvents = 'none'; span.textContent = 'Mengunggah…';
      try {
        const data = await new Promise(function (res, rej) { const fr = new FileReader(); fr.onload = function () { res(String(fr.result).split(',')[1]); }; fr.onerror = rej; fr.readAsDataURL(f); });
        const up = await P.ask('soal.upload', { mapel: body.mapel.value, mime: f.type, nama: f.name, data: data });
        if (up) { body.img.value = up.url; body.img.dispatchEvent(new Event('input')); }
      } finally { lbl.style.pointerEvents = ''; span.textContent = 'Unggah'; }
    });
    P.modal({ title: s && s.id ? 'Edit Soal' : 'Tambah Soal', size: 'lg', body: body,
      actions: [{ label: 'Batal' }].concat(s && s.id ? [] : [{ label: 'Simpan & Tambah Lagi', icon: 'library_add', cls: 'btn-soft', onClick: function (close) { return simpan(close, true); } }])
        .concat([{ label: 'Simpan Soal', icon: 'save', cls: 'btn-gold', onClick: function (close) { return simpan(close, false); } }]) });
    async function simpan(close, lagi) {
      const f = body, k = $('input[name=kunci]:checked', f);
      const data = { id: s && s.id, mapel: f.mapel.value, tipe: tipe, q: f.q.value.trim(), img: f.img.value.trim(), bobot: Number(f.bobot.value),
        a: f.oA.value.trim(), b: f.oB.value.trim(), c: f.oC.value.trim(), d: f.oD.value.trim(), kunci: tipe === 'PG' ? (k ? k.value : '') : f.rubrik.value.trim() };
      if (!data.q) { P.toast('Pertanyaan wajib diisi.', 'warn'); f.q.focus(); return false; }
      if (tipe === 'PG' && !data.kunci) { P.toast('Pilih kunci jawaban (A/B/C/D).', 'warn'); return false; }
      const r = await P.ask('soal.save', { soal: data }, { invalidate: ['soal.list', 'mapel.list', 'boot'] });
      if (!r) return false;
      P.LS.set('bsMapel', data.mapel);
      if (Pg._reloadSoal) Pg._reloadSoal();
      if (lagi) { f.q.value = ''; f.img.value = ''; ['oA', 'oB', 'oC', 'oD'].forEach(function (n) { f[n].value = ''; }); if (k) k.checked = false; f.rubrik.value = ''; $('[data-prev]', f).classList.add('hidden'); f.q.focus(); return false; }
      close();
    }
  };

  /** Impor soal dari Excel/CSV: baca di browser → uji kering (validasi per baris) → konfirmasi → tulis. */
  Pg.formImport = async function (mapelDefault) {
    const r = await P.apiQ('mapel.list', {}); const mapel = r.success ? r.data : [];
    if (!mapel.length) return P.toast('Tambahkan mata pelajaran terlebih dahulu.', 'warn');
    let rows = null, laporan = null;
    const body = el('<div class="col gap-16"><div class="grid-2"><label class="field"><span>Mata pelajaran tujuan</span><select class="select" data-mp>' + mapel.map(function (m) { return '<option value="' + esc(m.id) + '"' + (m.id === (mapelDefault || P.LS.get('bsMapel')) ? ' selected' : '') + '>' + esc(m.nama) + ' (' + m.soal + ' soal)</option>'; }).join('') + '</select></label>' +
      '<div class="field"><span>Mode impor</span><div class="seg" data-mode><button type="button" class="on" data-md="tambah">Tambah / perbarui</button><button type="button" data-md="timpa">Timpa semua</button></div><span class="hint" data-mh>Soal baru ditambahkan; baris ber-ID_Soal yang sudah ada diperbarui.</span></div></div>' +
      '<label class="inset col" style="align-items:center;text-align:center;cursor:pointer;border:2px dashed var(--outline-2);padding:26px" data-drop>' + ic('upload_file') + '<b class="mt-8" data-fn>Pilih file .xlsx / .csv</b><span class="tiny muted">Kolom: Tipe_Soal, Pertanyaan, Opsi_A–D, Kunci_Jawaban, Bobot_Nilai, Gambar_URL, ID_Soal</span><input type="file" accept=".xlsx,.xls,.csv" hidden data-file></label>' +
      '<div data-rep></div></div>');
    let mode = 'tambah';
    P.on(body, 'click', '[data-md]', function (e, b) { mode = b.dataset.md; $$('[data-md]', body).forEach(function (x) { x.classList.toggle('on', x === b); }); $('[data-mh]', body).innerHTML = mode === 'timpa' ? '<b style="color:var(--err)">Semua soal lama di mapel ini dihapus</b> lalu diganti isi file.' : 'Soal baru ditambahkan; baris ber-ID_Soal yang sudah ada diperbarui.'; if (rows) uji(); });
    $('[data-mp]', body).onchange = function () { if (rows) uji(); };
    const m = P.modal({ title: 'Impor Soal dari Excel', size: 'lg', body: body, actions: [{ label: 'Tutup' }, { label: 'Impor Sekarang', icon: 'publish', cls: 'btn-gold', onClick: jalankan }] });
    const btnGo = $$('.modal-f .btn', m.el).pop(); btnGo.disabled = true;
    $('[data-file]', body).onchange = async function () {
      const f = this.files[0]; if (!f) return;
      $('[data-fn]', body).textContent = f.name;
      $('[data-rep]', body).innerHTML = '<div class="skel" style="height:80px"></div>';
      try { rows = (await K.bacaFile(f)).filter(function (x) { return Object.keys(x).some(function (k) { return k !== '_baris' && String(x[k]).trim(); }); }); }
      catch (e) { $('[data-rep]', body).innerHTML = '<div class="inset small" style="color:var(--err)">Gagal membaca file: ' + esc(e.message) + '</div>'; return; }
      uji();
    };
    async function uji() {
      btnGo.disabled = true;
      if (!rows.length) { $('[data-rep]', body).innerHTML = '<div class="inset small">File tidak berisi baris data.</div>'; return; }
      $('[data-rep]', body).innerHTML = '<div class="inset small row"><span class="spin"></span> Memvalidasi ' + rows.length + ' baris…</div>';
      const res = await P.api('soal.import', { mapel: $('[data-mp]', body).value, mode: mode, rows: rows, dryRun: true });
      if (!res.success) { $('[data-rep]', body).innerHTML = '<div class="inset small" style="color:var(--err)">' + esc(res.message) + '</div>'; return; }
      laporan = res.data;
      $('[data-rep]', body).innerHTML = '<div class="stat-tiles"><div class="tile"><span class="tiny muted">Baris dibaca</span><b>' + rows.length + '</b></div><div class="tile"><span class="tiny muted">Soal baru</span><b style="color:var(--ok)">' + laporan.baru + '</b></div>' +
        '<div class="tile"><span class="tiny muted">Diperbarui</span><b style="color:var(--info)">' + laporan.diperbarui + '</b></div><div class="tile"><span class="tiny muted">Gagal validasi</span><b style="color:' + (laporan.gagal.length ? 'var(--err)' : 'var(--ok)') + '">' + laporan.gagal.length + '</b></div></div>' +
        (laporan.gagal.length ? '<div class="card pad-0 mt-12" style="box-shadow:none;border:1px solid var(--line)"><div class="tbl-wrap" style="max-height:220px"><table class="tbl"><thead><tr><th>Baris</th><th>Alasan</th></tr></thead><tbody>' +
          laporan.gagal.slice(0, 200).map(function (g) { return '<tr><td class="mono">' + g.baris + '</td><td>' + esc(g.alasan) + '</td></tr>'; }).join('') + '</tbody></table></div></div><p class="tiny muted mt-8">Baris gagal dilewati. Perbaiki di file lalu impor ulang bila perlu.</p>' : '<p class="small mt-12" style="color:var(--ok)">' + ic('check_circle') + ' Semua baris valid.</p>') +
        (mode === 'timpa' ? '<p class="small mt-8" style="color:var(--err)">' + ic('warning') + ' Mode timpa: seluruh soal lama di mapel ini akan dihapus.</p>' : '');
      btnGo.disabled = !laporan.berhasil;
      $('span', btnGo).textContent = 'Impor ' + laporan.berhasil + ' Soal';
    }
    async function jalankan(close) {
      if (!laporan || !laporan.berhasil) return false;
      if (mode === 'timpa' && !await P.confirmDlg('Yakin menimpa <b>semua</b> soal di mapel ini?', { ok: 'Timpa', danger: true })) return false;
      const res = await P.ask('soal.import', { mapel: $('[data-mp]', body).value, mode: mode, rows: rows }, { invalidate: ['soal.list', 'mapel.list', 'boot'] });
      if (!res) return false;
      P.LS.set('bsMapel', $('[data-mp]', body).value);
      close();
      if (P.Router.cur && P.Router.cur.name === 'bank-soal' && Pg._reloadSoal) Pg._reloadSoal(); else P.Router.go('bank-soal');
    }
  };

  // ============================================================ HASIL & NILAI
  Pg.hasil = async function (ctx) {
    const lr = await P.apiQ('ujian.list'); if (!ctx.alive()) return;
    const ujian = lr.success ? lr.data : [];
    let id = ctx.args[0] || P.LS.get('hsUjian') || '', data = null, fSt = '', fKls = '', q = '', hal = 1, urut = 'nama';
    if (!ujian.some(function (u) { return u.id === id; })) id = (ujian.filter(function (u) { return u.status !== 'Draft'; })[0] || ujian[0] || {}).id || '';
    ctx.page.innerHTML = '';
    if (!id) { ctx.page.innerHTML = '<div class="page-h"><div><h1>Hasil & Nilai</h1><p>Rekap nilai per ujian</p></div></div><div class="card">' + K.kosong('analytics', 'Belum ada ujian.') + '</div>'; return; }
    P.LS.set('hsUjian', id);
    const v = el('<div><div class="page-h"><div><h1>Hasil & Nilai</h1><p>Nilai otomatis PG, koreksi essay, kartu hasil ber-QR, dan berita acara</p></div>' +
      '<div class="row wrap"><button class="btn btn-white" data-xl>' + ic('table_view') + '<span>Excel</span></button><button class="btn btn-white" data-pdf>' + ic('picture_as_pdf') + '<span>PDF</span></button><a class="btn btn-gold" data-kor href="#/koreksi/' + encodeURIComponent(id) + '">' + ic('rate_review') + '<span>Koreksi Essay</span></a></div></div>' +
      '<div class="card row wrap mb-16" style="padding:12px;gap:10px">' + K.selectUjian(ujian, id) + '<select class="select" data-st style="max-width:200px"><option value="">Semua status</option>' + ['Selesai', 'Menunggu Koreksi Essay', 'Diskualifikasi', 'Mengerjakan', 'Login', 'Tidak Mengerjakan'].map(function (s) { return '<option>' + s + '</option>'; }).join('') + '</select>' +
        '<select class="select" data-kls style="max-width:160px"><option value="">Semua kelas</option></select><label class="input-ico grow" style="min-width:180px">' + ic('search') + '<input class="input" data-q placeholder="Cari nama / NIS…" style="background:var(--canvas)"></label></div>' +
      '<div class="stat-tiles mb-16" data-tiles></div><div class="card pad-0"><div data-tbl><div class="skel" style="height:300px;margin:16px"></div></div></div></div>');
    ctx.page.appendChild(v);
    $('[data-ujian]', v).onchange = function () { P.Router.go('hasil/' + encodeURIComponent(this.value)); };
    $('[data-st]', v).onchange = function () { fSt = this.value; hal = 1; render(); };
    $('[data-kls]', v).onchange = function () { fKls = this.value; hal = 1; render(); };
    $('[data-q]', v).addEventListener('input', P.debounce(function (e) { q = e.target.value.trim(); hal = 1; render(); }, 150));
    Admin.onSearch = function (s) { q = s; $('[data-q]', v).value = s; hal = 1; render(); };
    $('[data-xl]', v).onclick = function () { const b = this; P.busy(b, eksporXl); };
    $('[data-pdf]', v).onclick = function () { const b = this; P.busy(b, eksporPdf); };
    const uj = ujian.filter(function (u) { return u.id === id; })[0];

    function rows() {
      return (data || []).filter(function (r) { return (!fSt || r.status === fSt) && (!fKls || r.kelas === fKls) && cocokTeks(r, q, ['nama', 'nis']); })
        .sort(function (a, b) { if (urut === 'nilai') return (b.nilai == null ? -1 : b.nilai) - (a.nilai == null ? -1 : a.nilai); if (urut === 'viol') return b.viol - a.viol; return String(a.kelas + a.nama).localeCompare(b.kelas + b.nama); });
    }
    function render() {
      if (!data) return;
      const nilai = data.filter(function (r) { return r.status === 'Selesai' && r.nilai !== null; }).map(function (r) { return r.nilai; });
      const rata = nilai.length ? nilai.reduce(function (a, b) { return a + b; }, 0) / nilai.length : null, menunggu = data.filter(function (r) { return r.status === 'Menunggu Koreksi Essay'; }).length;
      $('[data-tiles]', v).innerHTML = [['Peserta', data.length, ''], ['Rata-rata', rata === null ? '—' : P.fmtNum(rata, 1), 'var(--forest)'], ['Tertinggi', nilai.length ? P.fmtNum(Math.max.apply(null, nilai)) : '—', 'var(--ok)'],
        ['Terendah', nilai.length ? P.fmtNum(Math.min.apply(null, nilai)) : '—', 'var(--warn)'], ['Menunggu koreksi', menunggu, menunggu ? 'var(--gold-deep)' : ''], ['Diskualifikasi', data.filter(function (r) { return r.status === 'Diskualifikasi'; }).length, 'var(--err)']]
        .map(function (t) { return '<div class="tile"><span class="tiny muted">' + t[0] + '</span><b style="color:' + (t[2] || 'var(--ink)') + '">' + t[1] + '</b></div>'; }).join('');
      $('[data-kor]', v).classList.toggle('btn-gold', menunggu > 0); $('[data-kor]', v).classList.toggle('btn-white', !menunggu);
      const kls = Array.from(new Set(data.map(function (r) { return r.kelas; }).filter(String))).sort(), sk = $('[data-kls]', v);
      if (sk.options.length !== kls.length + 1) sk.innerHTML = '<option value="">Semua kelas</option>' + kls.map(function (k) { return '<option' + (k === fKls ? ' selected' : '') + '>' + esc(k) + '</option>'; }).join('');
      const list = rows(), box = $('[data-tbl]', v);
      if (!list.length) { box.innerHTML = K.kosong('person_search', data.length ? 'Tidak ada data pada filter ini.' : 'Belum ada peserta untuk ujian ini.'); return; }
      const maxHal = Math.ceil(list.length / PER_HAL); if (hal > maxHal) hal = maxHal;
      const sortTh = function (k, t, cls) { return '<th class="' + (cls || '') + '" style="cursor:pointer" data-sort="' + k + '">' + t + (urut === k ? ' ▾' : '') + '</th>'; };
      box.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr>' + sortTh('nama', 'Peserta') + '<th>Kelas</th><th>Status</th><th class="num">PG</th><th class="num">Essay</th>' + sortTh('nilai', 'Nilai Akhir', 'num') + sortTh('viol', 'Pelanggaran', 'num') + '<th>Selesai</th><th></th></tr></thead><tbody>' +
        list.slice((hal - 1) * PER_HAL, hal * PER_HAL).map(function (r) {
          return '<tr><td><div class="row"><span class="av sm ' + P.avColor(r.nama) + '">' + esc(P.inisial(r.nama)) + '</span><div><b>' + esc(r.nama) + '</b><div class="tiny muted mono">' + esc(r.nis) + '</div></div></div></td><td>' + esc(r.kelas) + '</td><td>' + P.statusBadge(r.status) + '</td>' +
            '<td class="num">' + (r.pg ? r.pg.benar + '/' + (r.pg.benar + r.pg.salah + r.pg.kosong) : '-') + '</td><td class="num">' + (r.nilaiEssay === null ? (r.status === 'Menunggu Koreksi Essay' ? '<span class="badge b-warn">Belum</span>' : '-') : P.fmtNum(r.nilaiEssay)) + '</td>' +
            '<td class="num"><b style="font:700 15px var(--f-head);color:' + (r.nilai === null ? 'var(--outline)' : r.nilai >= 75 ? 'var(--ok)' : r.nilai >= 60 ? 'var(--warn)' : 'var(--err)') + '">' + (r.nilai === null ? '—' : P.fmtNum(r.nilai)) + '</b></td>' +
            '<td class="num">' + (r.viol ? '<span class="badge ' + (r.status === 'Diskualifikasi' ? 'b-bad' : 'b-warn') + '">' + r.viol + '</span>' : '<span class="muted">0</span>') + '</td><td class="small nowrap">' + (r.submit ? P.fmtTgl(r.submit) : '-') + '</td>' +
            '<td class="nowrap"><button class="btn btn-soft btn-sm" data-det="' + esc(r.h) + '">Detail</button></td></tr>';
        }).join('') + '</tbody></table></div>';
      const pg = pager(list.length, hal, function (h) { hal = h; render(); }); pg.style.padding = '12px 16px'; box.appendChild(pg);
    }
    P.on(v, 'click', '[data-sort]', function (e, b) { urut = b.dataset.sort; render(); });
    P.on(v, 'click', '[data-det]', function (e, b) { detailHasil(b.dataset.det, function () { load(true); }); });
    async function eksporXl() {
      const list = rows(); if (!list.length) return P.toast('Tidak ada data.', 'warn');
      await K.exportXlsx('Rekap_Nilai_' + uj.nama, { Rekap: [['No', 'Nama', 'NIS/NISN', 'Kelas', 'Status', 'PG Benar', 'Jumlah PG', 'Nilai PG (poin)', 'Nilai Essay (poin)', 'Nilai Akhir', 'Pelanggaran', 'Mulai', 'Selesai', 'Keterangan']]
        .concat(list.map(function (r, i) { return [i + 1, r.nama, r.nis, r.kelas, r.status, r.pg ? r.pg.benar : '', r.pg ? r.pg.benar + r.pg.salah + r.pg.kosong : '', r.nilaiPg, r.nilaiEssay, r.nilai, r.viol, r.mulai ? P.fmtTgl(r.mulai) : '', r.submit ? P.fmtTgl(r.submit) : '', r.alasan]; })) });
    }
    async function eksporPdf() {
      const list = rows(); if (!list.length) return P.toast('Tidak ada data.', 'warn');
      await App.loadModule('pdf');
      await window.PDFKit.tabel('Rekap Nilai — ' + uj.nama, [{ h: 'No', k: '_no' }, { h: 'Nama', k: 'nama' }, { h: 'NIS', k: 'nis' }, { h: 'Kelas', k: 'kelas' }, { h: 'Status', k: 'status' }, { h: 'Nilai', k: function (r) { return r.nilai === null ? '-' : P.fmtNum(r.nilai); } }, { h: 'Pelanggaran', k: 'viol' }],
        list.map(function (r, i) { return Object.assign({ _no: i + 1 }, r); }), { institusi: App.institusi(), sub: uj.namaMapel + ' • ' + P.fmtTgl(uj.mulai, false) + ' • ' + list.length + ' peserta' });
    }
    function load(force) { return P.SWR.load('hasil.list', { id: id }, 20000, function (d) { if (d && ctx.alive()) { data = d; render(); } }, { force: force }); }
    load(false);
    const t = setInterval(function () { if (!ctx.alive()) return clearInterval(t); if (P.Activity.due('hasil', 45000, 180000)) load(true); }, 5000);
  };

  async function detailHasil(h, onChange) {
    const d = P.drawer('Detail Hasil', '<div class="skel" style="height:420px"></div>');
    const r = await P.api('hasil.detail', { h: h });
    if (!r.success) { d.body.innerHTML = K.kosong('error', esc(r.message)); return; }
    const x = r.data, hs = x.hasil, pg = x.soal.filter(function (s) { return s.tipe === 'PG'; });
    const ringkas = { benar: pg.filter(function (s) { return s.benar === true; }).length, salah: pg.filter(function (s) { return s.benar === false; }).length, kosong: x.soal.filter(function (s) { return !s.jawab; }).length };
    d.el.querySelector('h2').textContent = hs.nama;
    d.body.innerHTML = '<div class="small muted">NIS ' + esc(hs.nis) + ' • ' + esc(hs.kelas) + ' • ' + esc(hs.namaUjian) + '</div>' +
      '<div class="row wrap mt-12" style="gap:8px">' + P.statusBadge(hs.status) + (hs.viol ? '<span class="badge b-warn">' + hs.viol + ' pelanggaran</span>' : '<span class="badge b-ok">Tanpa pelanggaran</span>') + (hs.tam ? '<span class="badge b-info">+' + hs.tam + ' mnt</span>' : '') + '</div>' +
      '<div class="inset-dark mt-16 row between" style="background:var(--forest);color:#fff"><div><div class="label">Nilai Akhir</div><b style="font:700 40px/1.1 var(--f-head);color:var(--gold-soft)">' + (hs.nilai === null ? '—' : P.fmtNum(hs.nilai)) + '</b></div>' +
        '<div style="text-align:right" class="small">PG benar <b>' + ringkas.benar + '</b> • salah <b>' + ringkas.salah + '</b><br>Kosong <b>' + ringkas.kosong + '</b> dari ' + x.soal.length + '<br>Selesai ' + (hs.submit ? P.fmtTgl(hs.submit) : '-') + '</div></div>' +
      (hs.alasan ? '<div class="inset small mt-12">' + ic('info') + ' ' + esc(hs.alasan) + '</div>' : '') +
      '<div class="row wrap mt-16"><button class="btn btn-forest btn-sm" data-kartu' + (['Selesai', 'Diskualifikasi', 'Menunggu Koreksi Essay'].indexOf(hs.status) === -1 ? ' disabled' : '') + '>' + ic('qr_code_2') + '<span>Kartu Hasil (PDF)</span></button>' +
        (hs.status === 'Diskualifikasi' || hs.viol ? '<button class="btn btn-soft btn-sm" data-ba>' + ic('gavel') + '<span>Berita Acara</span></button>' : '') +
        (hs.status === 'Menunggu Koreksi Essay' || x.soal.some(function (s) { return s.tipe === 'Essay'; }) ? '<a class="btn btn-soft btn-sm" href="#/koreksi/' + encodeURIComponent(hs.ujian) + '?h=' + encodeURIComponent(h) + '">' + ic('rate_review') + '<span>Koreksi Essay</span></a>' : '') + '</div>' +
      (x.catatan ? '<div class="inset mt-16 small"><b>Catatan guru:</b> ' + esc(x.catatan) + '</div>' : '') +
      '<h3 class="mt-24">Jawaban (' + x.soal.length + ' soal)</h3><div class="col mt-12" style="gap:8px">' + x.soal.map(function (s) {
        const warna = s.tipe === 'Essay' ? 'var(--gold-deep)' : s.benar === true ? 'var(--ok)' : s.benar === false ? 'var(--err)' : 'var(--outline)';
        return '<div class="inset" style="padding:12px 14px;border-left:4px solid ' + warna + '"><div class="row between"><b class="small">No. ' + s.no + ' • ' + (s.tipe === 'PG' ? 'PG' : 'Essay') + (s.ragu ? ' • <span style="color:var(--warn)">ragu</span>' : '') + '</b><span class="tiny" style="font-weight:700;color:' + warna + '">' + (s.skor === null ? 'belum dinilai' : P.fmtNum(s.skor) + '/' + P.fmtNum(s.bobot)) + '</span></div>' +
          '<div class="small mt-8" style="white-space:pre-wrap">' + esc(String(s.q).slice(0, 600)) + '</div>' +
          (s.tipe === 'PG' ? '<div class="tiny mt-8">Jawaban: <b class="mono">' + esc(s.jawab || '—') + '</b>' + (s.jawab && s.opsi[s.jawab] ? ' (' + esc(String(s.opsi[s.jawab]).slice(0, 80)) + ')' : '') + ' • Kunci: <b class="mono">' + esc(s.kunci) + '</b></div>'
            : '<div class="small mt-8" style="background:#fff;border-radius:10px;padding:8px 10px;white-space:pre-wrap">' + (s.jawab ? esc(s.jawab) : '<i class="muted">Tidak dijawab</i>') + '</div>' + (s.fb ? '<div class="tiny mt-8 muted">Umpan balik: ' + esc(s.fb) + '</div>' : '')) + '</div>';
      }).join('') + '</div>' +
      '<h3 class="mt-24">Log Pelanggaran (' + x.logs.length + ')</h3><div class="col mt-12" style="gap:6px">' + (x.logs.length ? x.logs.map(function (l) { return '<div class="inset row between small" style="padding:9px 12px"><span><b>#' + l.ke + '</b> ' + esc(l.jenis) + '</span><span class="tiny muted">' + P.fmtTgl(l.waktu) + ' • audio ' + esc(l.audio) + '</span></div>'; }).join('') : '<div class="inset small muted">Tidak ada.</div>') + '</div>';
    const kb = $('[data-kartu]', d.body);
    if (kb) kb.onclick = function () {
      P.busy(kb, async function () { await App.loadModule('pdf'); await window.PDFKit.kartuHasil({ siswa: { nama: hs.nama, nis: hs.nis, kelas: hs.kelas }, ujian: { nama: hs.namaUjian, mapel: hs.mapel }, nilai: hs.nilai, status: hs.status, submit: hs.submit, viol: hs.viol, ringkas: ringkas, verifikasi: x.verifikasi, institusi: x.institusi || App.institusi(), appUrl: appUrl() }); });
    };
    const ba = $('[data-ba]', d.body);
    if (ba) ba.onclick = function () {
      P.busy(ba, async function () { await App.loadModule('pdf'); await window.PDFKit.beritaAcara({ siswa: { nama: hs.nama, nis: hs.nis, kelas: hs.kelas }, ujian: { nama: hs.namaUjian, mapel: hs.mapel, ruang: '' }, mulai: hs.mulai, submit: hs.submit, status: hs.status, alasan: hs.alasan, terjawab: x.soal.length - ringkas.kosong, total: x.soal.length, logs: x.logs, institusi: x.institusi || App.institusi() }); });
    };
    P.on(d.body, 'click', 'a[href^="#/koreksi"]', function () { d.close(); });
    void onChange;
  }
  Pg.detailHasil = detailHasil;

  // ============================================================ KOREKSI ESSAY
  Pg.koreksi = async function (ctx) {
    const raw = ctx.args[0] || '', id = raw.split('?')[0], fokusH = (raw.split('?h=')[1] || '').split('&')[0];
    if (!id) return P.Router.go('hasil');
    let data = null, cur = null, filter = 'belum', q = '';
    ctx.page.innerHTML = '';
    const v = el('<div><div class="page-h"><div><div class="row small"><a href="#/hasil/' + encodeURIComponent(id) + '" class="muted" style="text-decoration:none">' + ic('arrow_back') + ' Hasil & Nilai</a></div><h1 data-ttl>Koreksi Essay</h1><p>Beri skor & umpan balik per jawaban. Nilai akhir terbit otomatis saat semua essay peserta terisi.</p></div><div class="row" data-prog></div></div>' +
      '<div class="layout-3" style="grid-template-columns:minmax(260px,330px) minmax(0,1fr)"><aside class="card pad-0" style="align-self:start;position:sticky;top:calc(var(--hdr-h) + 12px)"><div style="padding:14px 14px 8px" class="col gap-12"><div class="seg" data-f><button data-v="belum" class="on">Belum</button><button data-v="sudah">Sudah</button><button data-v="semua">Semua</button></div>' +
        '<label class="input-ico">' + ic('search') + '<input class="input" data-q placeholder="Cari peserta…" style="background:var(--canvas)"></label></div><div data-list style="max-height:calc(100vh - 260px);overflow:auto;padding:0 8px 10px"></div></aside>' +
      '<section data-main><div class="card skel" style="height:420px"></div></section></div></div>');
    ctx.page.appendChild(v);
    P.on(v, 'click', '[data-f] [data-v]', function (e, b) { filter = b.dataset.v; $$('[data-f] [data-v]', v).forEach(function (x) { x.classList.toggle('on', x === b); }); renderList(); });
    $('[data-q]', v).addEventListener('input', P.debounce(function (e) { q = e.target.value.trim(); renderList(); }, 120));
    Admin.onSearch = function (s) { q = s; $('[data-q]', v).value = s; renderList(); };
    function lengkap(p) { return p.items.every(function (i) { return i.skor !== null && i.skor !== undefined && i.skor !== ''; }); }
    function renderList() {
      const list = data.peserta.filter(function (p) { return (filter === 'semua' || (filter === 'sudah') === lengkap(p)) && cocokTeks(p, q, ['nama', 'nis', 'kelas']); });
      const done = data.peserta.filter(lengkap).length;
      $('[data-prog]', v).innerHTML = '<div class="col" style="min-width:220px"><div class="row between small"><b>Progres koreksi</b><span>' + done + '/' + data.peserta.length + '</span></div><div class="bar mt-8"><i style="width:' + (data.peserta.length ? done / data.peserta.length * 100 : 0) + '%"></i></div></div>';
      $('[data-list]', v).innerHTML = list.length ? list.map(function (p) {
        const n = p.items.filter(function (i) { return i.skor !== null; }).length;
        return '<button class="li-item' + (cur && cur.h === p.h ? ' on' : '') + '" data-h="' + esc(p.h) + '"><span class="av sm ' + P.avColor(p.nama) + '">' + esc(P.inisial(p.nama)) + '</span><span class="col gap-0" style="min-width:0;text-align:left;flex:1"><b class="small trunc">' + esc(p.nama) + '</b><span class="tiny muted">' + esc(p.kelas) + ' • ' + n + '/' + p.items.length + ' dinilai</span></span>' + (lengkap(p) ? '<span style="color:var(--ok)">' + ic('check_circle') + '</span>' : '') + '</button>';
      }).join('') : '<div class="small muted" style="padding:16px">' + (filter === 'belum' ? 'Semua jawaban sudah dikoreksi 🎉' : 'Tidak ada peserta.') + '</div>';
    }
    P.on(v, 'click', '[data-h]', function (e, b) { buka(b.dataset.h); });
    function buka(h) {
      cur = data.peserta.filter(function (p) { return p.h === h; })[0]; if (!cur) return;
      renderList();
      const soal = {}; data.soal.forEach(function (s) { soal[s.id] = s; });
      const main = $('[data-main]', v);
      main.innerHTML = '<div class="card"><div class="row between wrap"><div class="row"><span class="av ' + P.avColor(cur.nama) + '">' + esc(P.inisial(cur.nama)) + '</span><div><h2>' + esc(cur.nama) + '</h2><div class="small muted">NIS ' + esc(cur.nis) + ' • ' + esc(cur.kelas) + (cur.viol ? ' • <span style="color:var(--warn)">' + cur.viol + ' pelanggaran</span>' : '') + '</div></div></div>' +
        '<div style="text-align:right"><div class="tiny muted">Poin PG</div><b style="font:700 20px var(--f-head)">' + P.fmtNum(cur.nilaiPg) + '<span class="small muted"> / ' + P.fmtNum(cur.pgMaks) + '</span></b></div></div></div>' +
        cur.items.map(function (it, i) {
          const s = soal[it.id] || {};
          return '<div class="card mt-16"><div class="row between"><span class="badge b-gold">Essay ' + (i + 1) + '</span><span class="tiny muted">Maks ' + P.fmtNum(s.maks) + ' poin</span></div>' +
            '<div class="mt-12" style="white-space:pre-wrap;font-weight:600">' + esc(s.q) + '</div>' + (s.rubrik ? '<div class="inset tiny mt-12"><b>Rubrik:</b> ' + esc(s.rubrik) + '</div>' : '') +
            '<div class="mt-12" style="background:var(--canvas);border-radius:14px;padding:14px;white-space:pre-wrap;line-height:1.6;min-height:60px">' + (it.jawab ? esc(it.jawab) : '<i class="muted">Tidak dijawab</i>') + '</div>' +
            '<div class="row wrap mt-12" style="align-items:flex-end"><label class="field" style="width:140px"><span>Skor (0–' + P.fmtNum(s.maks) + ')</span><input class="input" type="number" min="0" max="' + s.maks + '" step="0.5" data-skor="' + esc(it.id) + '" value="' + (it.skor === null ? '' : it.skor) + '"></label>' +
              '<div class="row" style="gap:4px;padding-bottom:4px">' + [0, 0.5, 1].map(function (f) { return '<button class="btn btn-soft btn-sm" data-cepat="' + esc(it.id) + '" data-n="' + Math.round(s.maks * f * 2) / 2 + '">' + (f === 0 ? '0' : f === 1 ? 'Maks' : '½') + '</button>'; }).join('') + '</div>' +
              '<label class="field grow" style="min-width:220px"><span>Umpan balik (opsional)</span><input class="input" data-fb="' + esc(it.id) + '" value="' + esc(it.fb || '') + '" maxlength="500"></label></div></div>';
        }).join('') +
        '<div class="card mt-16"><label class="field"><span>Catatan guru untuk peserta (opsional)</span><textarea class="textarea" data-cat style="min-height:70px" maxlength="1000">' + esc(cur.catatan || '') + '</textarea></label>' +
        '<div class="row between wrap mt-16"><span class="small muted" data-tot></span><div class="row"><button class="btn btn-soft" data-sv="0">' + ic('save') + '<span>Simpan</span></button><button class="btn btn-gold" data-sv="1">' + ic('done_all') + '<span>Simpan & Berikutnya</span></button></div></div></div>';
      function total() {
        let poin = 0, isi = 0;
        $$('[data-skor]', main).forEach(function (i) { if (i.value !== '') { poin += Number(i.value) || 0; isi++; } });
        const nilai = cur.maks ? (cur.nilaiPg + poin) / cur.maks * 100 : 0;
        $('[data-tot]', main).innerHTML = isi === cur.items.length ? 'Perkiraan nilai akhir: <b style="color:var(--forest)">' + P.fmtNum(nilai) + '</b>' : (cur.items.length - isi) + ' essay belum diberi skor';
      }
      total();
      main.oninput = total;
      P.on(main, 'click', '[data-cepat]', function (e, b) { $('[data-skor="' + b.dataset.cepat + '"]', main).value = b.dataset.n; total(); });
      P.on(main, 'click', '[data-sv]', async function (e, b) {
        const skor = {}, fb = {};
        let salah = '';
        $$('[data-skor]', main).forEach(function (i) { const s = soal[i.dataset.skor] || {}; if (i.value !== '' && (Number(i.value) < 0 || Number(i.value) > s.maks)) salah = 'Skor harus 0–' + s.maks + '.'; skor[i.dataset.skor] = i.value === '' ? '' : Number(i.value); });
        if (salah) return P.toast(salah, 'warn');
        $$('[data-fb]', main).forEach(function (i) { fb[i.dataset.fb] = i.value.trim(); });
        const r = await P.busy(b, function () { return P.ask('koreksi.save', { h: cur.h, skor: skor, fb: fb, catatan: $('[data-cat]', main).value }, { invalidate: ['hasil.list', 'dash.summary', 'lap.stats', 'lap.rekap'] }); });
        if (!r) return;
        cur.items.forEach(function (it) { it.skor = skor[it.id] === '' ? null : skor[it.id]; it.fb = fb[it.id]; });
        cur.catatan = $('[data-cat]', main).value; cur.nilai = r.nilai;
        renderList();
        if (b.dataset.sv === '1') {
          const sisa = data.peserta.filter(function (p) { return !lengkap(p) && p.h !== cur.h; });
          if (sisa.length) buka(sisa[0].h); else { P.toast('Semua jawaban essay sudah dikoreksi.'); main.scrollIntoView({ block: 'start' }); }
        }
      });
      main.scrollIntoView({ block: 'start', behavior: 'smooth' });
    }
    const r = await P.api('koreksi.list', { id: id });
    if (!ctx.alive()) return;
    if (!r.success) { $('[data-main]', v).innerHTML = '<div class="card">' + K.kosong('error', esc(r.message)) + '</div>'; return; }
    data = r.data;
    $('[data-ttl]', v).textContent = 'Koreksi Essay — ' + data.ujian.nama;
    if (!data.peserta.length) { renderList(); $('[data-main]', v).innerHTML = '<div class="card">' + K.kosong('rate_review', 'Tidak ada jawaban essay yang perlu dikoreksi pada ujian ini.') + '</div>'; return; }
    const awal = fokusH && data.peserta.some(function (p) { return p.h === fokusH; }) ? fokusH : (data.peserta.filter(function (p) { return !lengkap(p); })[0] || data.peserta[0]).h;
    if (fokusH) { filter = 'semua'; $$('[data-f] [data-v]', v).forEach(function (x) { x.classList.toggle('on', x.dataset.v === 'semua'); }); }
    renderList(); buka(awal);
  };

  // ============================================================ LOG PELANGGARAN
  Pg.log = async function (ctx) {
    const lr = await P.apiQ('ujian.list'); if (!ctx.alive()) return;
    const ujian = lr.success ? lr.data : [];
    let id = P.LS.get('logUjian') || '', data = null, fJ = '', q = '', hal = 1;
    if (id && !ujian.some(function (u) { return u.id === id; })) id = '';
    ctx.page.innerHTML = '';
    const v = el('<div><div class="page-h"><div><h1>Log Pelanggaran</h1><p>Rekam jejak pindah tab, keluar layar penuh, dan kehilangan fokus — lengkap dengan status peringatan audio</p></div>' +
      '<div class="row"><button class="btn btn-white" data-xl>' + ic('table_view') + '<span>Excel</span></button><button class="btn btn-white" data-pdf>' + ic('picture_as_pdf') + '<span>PDF</span></button></div></div>' +
      '<div class="metrics" data-kpi></div><div class="card row wrap mb-16" style="padding:12px;gap:10px">' + K.selectUjian(ujian, id, { semua: true }) +
        '<label class="input-ico grow" style="min-width:200px">' + ic('search') + '<input class="input" data-q placeholder="Cari nama, NIS, kelas…" style="background:var(--canvas)"></label></div>' +
      '<div class="card pad-0" data-tbl><div class="skel" style="height:300px;margin:16px"></div></div></div>');
    ctx.page.appendChild(v);
    $('[data-ujian]', v).onchange = function () { id = this.value; P.LS.set('logUjian', id); hal = 1; data = null; load(false); };
    $('[data-q]', v).addEventListener('input', P.debounce(function (e) { q = e.target.value.trim(); hal = 1; render(); }, 150));
    Admin.onSearch = function (s) { q = s; $('[data-q]', v).value = s; hal = 1; render(); };
    P.on(v, 'click', '[data-j]', function (e, b) { fJ = fJ === b.dataset.j ? '' : b.dataset.j; hal = 1; render(); });
    $('[data-xl]', v).onclick = function () { const b = this; P.busy(b, async function () { const l = rows(); if (!l.length) return P.toast('Tidak ada data.', 'warn'); await K.exportXlsx('Log_Pelanggaran', { Log: [['Waktu', 'Nama', 'NIS', 'Kelas', 'Ujian', 'Jenis', 'Ke-', 'Peringatan Audio', 'Keterangan']].concat(l.map(function (x) { return [P.fmtTgl(x.waktu), x.nama, x.nis, x.kelas, x.namaUjian, x.jenis, x.ke, x.audio, x.ket]; })) }); }); };
    $('[data-pdf]', v).onclick = function () { const b = this; P.busy(b, async function () { const l = rows(); if (!l.length) return P.toast('Tidak ada data.', 'warn'); await App.loadModule('pdf'); await window.PDFKit.tabel('Log Pelanggaran Ujian', [{ h: 'Waktu', k: function (x) { return P.fmtTgl(x.waktu); } }, { h: 'Nama', k: 'nama' }, { h: 'NIS', k: 'nis' }, { h: 'Kelas', k: 'kelas' }, { h: 'Ujian', k: 'namaUjian' }, { h: 'Jenis', k: 'jenis' }, { h: 'Ke-', k: 'ke' }, { h: 'Audio', k: 'audio' }], l, { institusi: App.institusi(), sub: l.length + ' kejadian' + (fJ ? ' • ' + fJ : '') }); }); };
    function rows() { return (data || []).filter(function (x) { return (!fJ || x.jenis === fJ) && cocokTeks(x, q, ['nama', 'nis', 'kelas', 'namaUjian']); }); }
    function render() {
      if (!data) return;
      const by = { 'Pindah Tab': 0, 'Keluar Fullscreen': 0, 'Blur Focus': 0 }; data.forEach(function (x) { by[x.jenis] = (by[x.jenis] || 0) + 1; });
      const siswa = new Set(data.map(function (x) { return x.ujian + x.sis; })).size;
      $('[data-kpi]', v).innerHTML = '<div class="card metric"><div><div class="label">Total Kejadian</div><div class="v">' + data.length + '</div><div class="s muted">' + siswa + ' peserta terlibat</div></div><div class="ico b-warn">' + ic('gpp_maybe') + '</div></div>' +
        [['Pindah Tab', 'tab', 'b-bad'], ['Keluar Fullscreen', 'fullscreen_exit', 'b-gold'], ['Blur Focus', 'visibility_off', 'b-info']].map(function (j) {
          return '<div class="card metric kpi-click" data-j="' + j[0] + '" style="' + (fJ === j[0] ? 'box-shadow:0 0 0 2px var(--forest)' : '') + '"><div><div class="label">' + j[0] + '</div><div class="v">' + (by[j[0]] || 0) + '</div><div class="s muted">' + (fJ === j[0] ? 'Filter aktif — klik untuk lepas' : 'Klik untuk filter') + '</div></div><div class="ico ' + j[2] + '">' + ic(j[1]) + '</div></div>'; }).join('');
      const l = rows(), box = $('[data-tbl]', v);
      if (!l.length) { box.innerHTML = K.kosong('verified_user', data.length ? 'Tidak ada log yang cocok.' : 'Belum ada pelanggaran tercatat. Integritas ujian terjaga.'); return; }
      const maxHal = Math.ceil(l.length / PER_HAL); if (hal > maxHal) hal = maxHal;
      box.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Waktu (WIB)</th><th>Peserta</th><th>Kelas</th><th>Ujian</th><th>Jenis</th><th class="num">Ke-</th><th>Audio</th></tr></thead><tbody>' +
        l.slice((hal - 1) * PER_HAL, hal * PER_HAL).map(function (x) {
          return '<tr><td class="nowrap small">' + P.fmtTgl(x.waktu) + '</td><td><b>' + esc(x.nama) + '</b><div class="tiny muted mono">' + esc(x.nis) + '</div></td><td>' + esc(x.kelas) + '</td><td class="small">' + esc(x.namaUjian) + '</td>' +
            '<td><span class="badge ' + (x.jenis === 'Pindah Tab' ? 'b-bad' : x.jenis === 'Keluar Fullscreen' ? 'b-gold' : 'b-info') + '">' + esc(x.jenis) + '</span></td><td class="num"><b>' + x.ke + '</b></td>' +
            '<td>' + (x.audio === 'Ya' ? '<span class="badge b-ok">' + ic('volume_up') + 'Diputar</span>' : '<span class="badge b-mute">' + ic('volume_off') + esc(x.audio || 'Tidak') + '</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div>';
      const pg = pager(l.length, hal, function (h) { hal = h; render(); }); pg.style.padding = '12px 16px'; box.appendChild(pg);
    }
    function load(force) { return P.SWR.load('log.list', id ? { id: id } : {}, 20000, function (d) { if (d && ctx.alive()) { data = d; render(); } }, { force: force }); }
    load(false);
    const t = setInterval(function () { if (!ctx.alive()) return clearInterval(t); if (P.Activity.due('log', 30000, 180000)) load(true); }, 5000);
  };

  // ============================================================ LAPORAN & STATISTIK
  Pg.laporan = async function (ctx) {
    const lr = await P.apiQ('ujian.list'); if (!ctx.alive()) return;
    const ujian = lr.success ? lr.data : [];
    let id = P.LS.get('lapUjian') || '', stats = null, rekap = null, fKls = '', fSt = '', dari = '', sampai = '', hal = 1;
    if (id && !ujian.some(function (u) { return u.id === id; })) id = '';
    ctx.page.innerHTML = '';
    const v = el('<div><div class="page-h"><div><h1>Laporan & Statistik</h1><p>Distribusi nilai, tren rata-rata antar ujian, dan statistik pelanggaran</p></div>' +
      '<div class="row">' + K.selectUjian(ujian, id, { semua: true, w: 360 }) + '</div></div>' +
      '<div class="stat-tiles mb-16" data-tiles>' + '<div class="tile skel" style="height:72px"></div>'.repeat(6) + '</div>' +
      '<div class="grid-2 mb-16" style="align-items:start"><div class="card"><div class="card-h"><h3>Distribusi Nilai</h3><span class="tiny muted" data-hn></span></div><div data-hist><div class="skel" style="height:200px"></div></div></div>' +
        '<div class="card"><div class="card-h"><h3>Statistik Pelanggaran</h3><span class="tiny muted">per jenis</span></div><div data-jenis><div class="skel" style="height:200px"></div></div></div></div>' +
      '<div class="card mb-16"><div class="card-h"><h3>Tren Rata-rata Nilai per Ujian</h3><span class="tiny muted">urut tanggal ujian</span></div><div data-tren><div class="skel" style="height:220px"></div></div><div data-trentbl class="mt-16"></div></div>' +
      '<div class="card pad-0"><div class="row wrap between" style="padding:14px 16px;gap:10px"><h3>Rekap Hasil</h3><div class="row wrap" style="gap:8px">' +
        '<select class="select" data-kls style="width:140px"><option value="">Semua kelas</option></select><select class="select" data-st style="width:190px"><option value="">Semua status final</option><option>Selesai</option><option>Menunggu Koreksi Essay</option><option>Diskualifikasi</option><option>Tidak Mengerjakan</option></select>' +
        '<input class="input" type="date" data-dari style="width:150px" title="Dari tanggal"><input class="input" type="date" data-sampai style="width:150px" title="Sampai tanggal">' +
        '<button class="btn btn-white btn-sm" data-xl>' + ic('table_view') + '<span>Excel</span></button><button class="btn btn-white btn-sm" data-pdf>' + ic('picture_as_pdf') + '<span>PDF</span></button></div></div><div data-tbl><div class="skel" style="height:200px;margin:0 16px 16px"></div></div></div></div>');
    ctx.page.appendChild(v);
    $('[data-ujian]', v).onchange = function () { id = this.value; P.LS.set('lapUjian', id); hal = 1; muat(false); };
    $('[data-kls]', v).onchange = function () { fKls = this.value; hal = 1; muatRekap(); };
    $('[data-st]', v).onchange = function () { fSt = this.value; hal = 1; muatRekap(); };
    $('[data-dari]', v).onchange = function () { dari = this.value; hal = 1; muatRekap(); };
    $('[data-sampai]', v).onchange = function () { sampai = this.value; hal = 1; muatRekap(); };
    $('[data-xl]', v).onclick = function () { const b = this; P.busy(b, async function () { if (!rekap || !rekap.length) return P.toast('Tidak ada data.', 'warn'); await K.exportXlsx('Laporan_Rekap_Nilai', { Rekap: [['No', 'Nama', 'NIS', 'Kelas', 'Ujian', 'Mapel', 'Status', 'Nilai PG', 'Nilai Essay', 'Nilai Akhir', 'Pelanggaran', 'Selesai']].concat(rekap.map(function (r, i) { return [i + 1, r.nama, r.nis, r.kelas, r.namaUjian, r.mapel, r.status, r.nilaiPg, r.nilaiEssay, r.nilai, r.viol, r.submit ? P.fmtTgl(r.submit) : '']; })),
      Statistik: [['Ujian', 'Tanggal', 'Peserta', 'Dinilai', 'Rata-rata', 'Diskualifikasi', 'Total Pelanggaran']].concat((stats ? stats.tren : []).map(function (t) { return [t.nama, P.fmtTgl(t.mulai, false), t.peserta, t.dinilai, t.rata, t.dq, t.viol]; })) }); }); };
    $('[data-pdf]', v).onclick = function () { const b = this; P.busy(b, async function () { if (!rekap || !rekap.length) return P.toast('Tidak ada data.', 'warn'); await App.loadModule('pdf'); await window.PDFKit.tabel('Laporan Rekap Nilai', [{ h: 'No', k: '_no' }, { h: 'Nama', k: 'nama' }, { h: 'NIS', k: 'nis' }, { h: 'Kelas', k: 'kelas' }, { h: 'Ujian', k: 'namaUjian' }, { h: 'Status', k: 'status' }, { h: 'Nilai', k: function (r) { return r.nilai === null ? '-' : P.fmtNum(r.nilai); } }, { h: 'Pelanggaran', k: 'viol' }], rekap.map(function (r, i) { return Object.assign({ _no: i + 1 }, r); }), { institusi: App.institusi(), sub: (stats && stats.ringkas.rata !== null ? 'Rata-rata ' + P.fmtNum(stats.ringkas.rata) + ' • ' : '') + rekap.length + ' baris' + (fKls ? ' • Kelas ' + fKls : '') }); }); };

    function renderStats() {
      if (!stats) return;
      const r = stats.ringkas;
      $('[data-tiles]', v).innerHTML = [['Peserta', r.peserta], ['Dinilai', r.dinilai], ['Rata-rata', r.rata === null ? '—' : P.fmtNum(r.rata, 1)], ['Median', r.median === null ? '—' : P.fmtNum(r.median)], ['Tertinggi / Terendah', r.tertinggi === null ? '—' : P.fmtNum(r.tertinggi) + ' / ' + P.fmtNum(r.terendah)], ['Diskualifikasi', r.dq], ['Menunggu koreksi', r.menunggu], ['Total pelanggaran', r.totalPelanggaran]]
        .map(function (t) { return '<div class="tile"><span class="tiny muted">' + t[0] + '</span><b>' + t[1] + '</b></div>'; }).join('');
      $('[data-hn]', v).textContent = r.dinilai + ' nilai';
      $('[data-hist]', v).innerHTML = r.dinilai ? K.bars(stats.hist.map(function (n, i) { return { l: i === 9 ? '90–100' : (i * 10) + '–' + (i * 10 + 9), v: n, c: i < 6 ? '#95d4b3' : '#1B4332' }; }), { sorot: true, label: 'Distribusi nilai' }) : K.kosong('bar_chart', 'Belum ada nilai.');
      const jn = ['Pindah Tab', 'Keluar Fullscreen', 'Blur Focus'].concat(Object.keys(stats.jenis).filter(function (k) { return ['Pindah Tab', 'Keluar Fullscreen', 'Blur Focus'].indexOf(k) === -1; }));
      $('[data-jenis]', v).innerHTML = r.totalPelanggaran ? K.bars(jn.map(function (k) { return { l: k, v: stats.jenis[k] || 0, c: k === 'Pindah Tab' ? '#ba1a1a' : k === 'Keluar Fullscreen' ? '#D4A017' : '#2563eb' }; }), { label: 'Pelanggaran per jenis' }) : K.kosong('verified_user', 'Tidak ada pelanggaran.');
      const tren = stats.tren.filter(function (t) { return t.rata !== null; });
      $('[data-tren]', v).innerHTML = K.line(tren.map(function (t) { return { l: t.nama, v: t.rata }; }), { label: 'Tren rata-rata' });
      $('[data-trentbl]', v).innerHTML = stats.tren.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Ujian</th><th>Tanggal</th><th class="num">Peserta</th><th class="num">Rata-rata</th><th class="num">DQ</th><th class="num">Pelanggaran</th></tr></thead><tbody>' +
        stats.tren.slice().reverse().map(function (t) { return '<tr><td><a href="#/hasil/' + encodeURIComponent(t.id) + '">' + esc(t.nama) + '</a></td><td class="small">' + P.fmtTgl(t.mulai, false) + '</td><td class="num">' + t.peserta + '</td><td class="num"><b>' + (t.rata === null ? '—' : P.fmtNum(t.rata, 1)) + '</b></td><td class="num">' + t.dq + '</td><td class="num">' + t.viol + '</td></tr>'; }).join('') + '</tbody></table></div>' : '';
    }
    function renderRekap() {
      const box = $('[data-tbl]', v);
      if (!rekap) return;
      const kls = $('[data-kls]', v);
      if (kls.options.length === 1) { const all = Array.from(new Set(rekap.map(function (r) { return r.kelas; }).filter(String))).sort(); kls.innerHTML += all.map(function (k) { return '<option>' + esc(k) + '</option>'; }).join(''); }
      if (!rekap.length) { box.innerHTML = K.kosong('table_rows', 'Tidak ada data pada filter ini.'); return; }
      const maxHal = Math.ceil(rekap.length / PER_HAL); if (hal > maxHal) hal = maxHal;
      box.innerHTML = '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Peserta</th><th>Kelas</th><th>Ujian</th><th>Status</th><th class="num">Nilai</th><th class="num">Pelanggaran</th><th>Selesai</th></tr></thead><tbody>' +
        rekap.slice((hal - 1) * PER_HAL, hal * PER_HAL).map(function (r) { return '<tr><td><b>' + esc(r.nama) + '</b><div class="tiny muted mono">' + esc(r.nis) + '</div></td><td>' + esc(r.kelas) + '</td><td class="small">' + esc(r.namaUjian) + '<div class="tiny muted">' + esc(r.mapel) + '</div></td><td>' + P.statusBadge(r.status) + '</td><td class="num"><b>' + (r.nilai === null ? '—' : P.fmtNum(r.nilai)) + '</b></td><td class="num">' + r.viol + '</td><td class="small nowrap">' + (r.submit ? P.fmtTgl(r.submit) : '-') + '</td></tr>'; }).join('') + '</tbody></table></div>';
      const pg = pager(rekap.length, hal, function (h) { hal = h; renderRekap(); }); pg.style.padding = '12px 16px'; box.appendChild(pg);
    }
    function muatRekap() {
      const f = { id: id, kelas: fKls, status: fSt, dari: dari ? P.fromLocalInput(dari + 'T00:00') : '', sampai: sampai ? P.fromLocalInput(sampai + 'T23:59') + 59999 : '' };
      Object.keys(f).forEach(function (k) { if (!f[k]) delete f[k]; });
      return P.SWR.load('lap.rekap', f, 30000, function (d) { if (d && ctx.alive()) { rekap = d; renderRekap(); } });
    }
    function muat(force) {
      return Promise.all([P.SWR.load('lap.stats', id ? { id: id } : {}, 60000, function (d) { if (d && ctx.alive()) { stats = d; renderStats(); } }, { force: force }), muatRekap()]);
    }
    muat(false);
  };
})();
