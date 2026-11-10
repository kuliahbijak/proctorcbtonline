/*
 * ProctorCBT — pdf.js (dimuat hanya saat dibutuhkan)
 * Kartu hasil ber-QR verifikasi, berita acara insiden, dan tabel rekap/log → PDF (jsPDF).
 * QR digambar sebagai vektor (kotak-kotak) agar tajam saat dicetak.
 */
(function () {
  'use strict';
  const P = window.PCBT;
  const HIJAU = [27, 67, 50], EMAS = [255, 198, 65], ABU = [113, 121, 115], TINTA = [23, 29, 27];

  async function siap(qr) { await P.loadLib('jspdf'); if (qr) await P.loadLib('qrcode'); return new window.jspdf.jsPDF({ unit: 'mm', format: 'a4' }); }
  function kop(doc, judul, inst) {
    const w = doc.internal.pageSize.getWidth();
    doc.setFillColor.apply(doc, HIJAU); doc.rect(0, 0, w, 30, 'F');
    doc.setFillColor.apply(doc, EMAS); doc.roundedRect(14, 8, 14, 14, 3, 3, 'F');
    doc.setTextColor(1, 45, 29); doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.text('PC', 21, 17, { align: 'center' });
    doc.setTextColor(255, 255, 255); doc.setFontSize(14); doc.text(String(inst || 'ProctorCBT'), 33, 14);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(200, 225, 210); doc.text('ProctorCBT Integrity System', 33, 20);
    doc.setTextColor.apply(doc, TINTA); doc.setFont('helvetica', 'bold'); doc.setFontSize(16); doc.text(judul, 14, 44);
    return 52;
  }
  function kaki(doc) {
    const n = doc.getNumberOfPages(), w = doc.internal.pageSize.getWidth(), h = doc.internal.pageSize.getHeight();
    for (let i = 1; i <= n; i++) {
      doc.setPage(i); doc.setFont('helvetica', 'normal'); doc.setFontSize(8); doc.setTextColor.apply(doc, ABU);
      doc.text('Dicetak ' + P.fmtTgl(P.serverNow()) + ' WIB • ProctorCBT', 14, h - 8);
      doc.text('Hal. ' + i + '/' + n, w - 14, h - 8, { align: 'right' });
    }
  }
  function baris(doc, y, k, v) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor.apply(doc, ABU); doc.text(k, 14, y);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5); doc.setTextColor.apply(doc, TINTA);
    doc.text(doc.splitTextToSize(String(v == null ? '-' : v), 120), 62, y);
    return y + 7.5;
  }
  function qr(doc, teks, x, y, size) {
    const q = window.qrcode(0, 'M'); q.addData(teks); q.make();
    const n = q.getModuleCount(), s = size / n;
    doc.setFillColor(255, 255, 255); doc.rect(x - 2, y - 2, size + 4, size + 4, 'F');
    doc.setFillColor.apply(doc, TINTA);
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (q.isDark(r, c)) doc.rect(x + c * s, y + r * s, s + 0.02, s + 0.02, 'F');
  }
  function aman(s) { return String(s || '').replace(/[^\w\- ]+/g, '').replace(/\s+/g, '_').slice(0, 60); }

  const PDFKit = window.PDFKit = {};

  /** Kartu hasil individu + QR verifikasi keaslian. d: {siswa, ujian, nilai, status, submit, viol, ringkas, verifikasi:{id,s}, institusi, appUrl} */
  PDFKit.kartuHasil = async function (d) {
    const doc = await siap(true), w = doc.internal.pageSize.getWidth();
    let y = kop(doc, 'Kartu Hasil Ujian', d.institusi);
    y = baris(doc, y, 'Nama Peserta', d.siswa.nama); y = baris(doc, y, 'NIS / NISN', d.siswa.nis); y = baris(doc, y, 'Kelas', d.siswa.kelas);
    y = baris(doc, y, 'Ujian', d.ujian.nama); y = baris(doc, y, 'Mata Pelajaran', d.ujian.mapel);
    y = baris(doc, y, 'Waktu Selesai', P.fmtTgl(d.submit) + ' WIB'); y = baris(doc, y, 'Status', d.status);
    y = baris(doc, y, 'Pelanggaran Tercatat', String(d.viol || 0));
    y += 4;
    doc.setFillColor(234, 240, 237); doc.roundedRect(14, y, w - 28, 40, 5, 5, 'F');
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor.apply(doc, ABU); doc.text('NILAI AKHIR', 22, y + 11);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(34); doc.setTextColor(1, 45, 29);
    doc.text(d.nilai === null || d.nilai === undefined || d.nilai === '' ? '—' : String(d.nilai), 22, y + 30);
    if (d.ringkas) { doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor.apply(doc, TINTA); doc.text('Benar ' + d.ringkas.benar + ' • Salah ' + d.ringkas.salah + ' • Kosong ' + d.ringkas.kosong, 70, y + 30); }
    const url = (d.appUrl || '').replace(/\/?$/, '/') + 'verify.html?id=' + encodeURIComponent(d.verifikasi.id) + '&s=' + encodeURIComponent(d.verifikasi.s);
    qr(doc, url, w - 52, y + 46, 36);
    y += 50;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor.apply(doc, TINTA); doc.text('Verifikasi Keaslian', 14, y + 4);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor.apply(doc, ABU);
    doc.text(doc.splitTextToSize('Pindai kode QR untuk memastikan kartu ini asli dan nilainya sesuai data server. Kode verifikasi: ' + d.verifikasi.s, w - 80), 14, y + 10);
    doc.text(doc.splitTextToSize(url, w - 80), 14, y + 24);
    kaki(doc);
    doc.save('Kartu_Hasil_' + aman(d.siswa.nama) + '_' + aman(d.ujian.nama) + '.pdf');
  };

  /** Berita acara insiden diskualifikasi. */
  PDFKit.beritaAcara = async function (d) {
    const doc = await siap(false), w = doc.internal.pageSize.getWidth();
    let y = kop(doc, 'Berita Acara Insiden Pelanggaran Ujian', d.institusi);
    y = baris(doc, y, 'Nama Peserta', d.siswa.nama); y = baris(doc, y, 'NIS / Kelas', d.siswa.nis + ' / ' + d.siswa.kelas);
    y = baris(doc, y, 'Ujian', d.ujian.nama + ' (' + d.ujian.mapel + ')'); y = baris(doc, y, 'Ruang', d.ujian.ruang || '-');
    y = baris(doc, y, 'Mulai Mengerjakan', P.fmtTgl(d.mulai) + ' WIB'); y = baris(doc, y, 'Waktu Pemutusan', P.fmtTgl(d.submit) + ' WIB');
    y = baris(doc, y, 'Status', d.status); y = baris(doc, y, 'Alasan', d.alasan || '-');
    y = baris(doc, y, 'Soal Terjawab', d.terjawab + ' dari ' + d.total);
    doc.autoTable({ startY: y + 4, head: [['#', 'Waktu (WIB)', 'Jenis Pelanggaran', 'Peringatan Audio', 'Log ID']],
      body: d.logs.map(function (l) { return [l.ke, P.fmtTgl(l.waktu), l.jenis, l.audio, String(l.id || '').slice(-10)]; }),
      headStyles: { fillColor: HIJAU }, styles: { fontSize: 9 }, theme: 'striped', margin: { left: 14, right: 14 } });
    y = doc.lastAutoTable.finalY + 14;
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor.apply(doc, TINTA);
    doc.text(doc.splitTextToSize('Berita acara ini dibuat otomatis oleh sistem ProctorCBT berdasarkan log pelanggaran yang tercatat di server. Berkas ujian masuk kategori "Tinjauan Etik / Diskualifikasi" sampai diputuskan oleh pengawas/guru pengampu.', w - 28), 14, y);
    y += 26;
    [['Peserta', d.siswa.nama], ['Pengawas Ruang', '(........................................)']].forEach(function (s, i) {
      const x = i === 0 ? 30 : w - 80;
      doc.text(s[0] + ',', x, y); doc.text(s[1], x, y + 26);
    });
    kaki(doc);
    doc.save('Berita_Acara_' + aman(d.siswa.nama) + '.pdf');
  };

  /** Tabel umum (rekap nilai, log pelanggaran). kolom: [{h, k, w}] */
  PDFKit.tabel = async function (judul, kolom, rows, o) {
    o = o || {};
    await P.loadLib('jspdf');
    const doc = new window.jspdf.jsPDF({ unit: 'mm', format: 'a4', orientation: kolom.length > 6 ? 'landscape' : 'portrait' });
    let y = kop(doc, judul, o.institusi);
    if (o.sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(9.5); doc.setTextColor.apply(doc, ABU); doc.text(o.sub, 14, y - 2); y += 4; }
    doc.autoTable({ startY: y, head: [kolom.map(function (c) { return c.h; })],
      body: rows.map(function (r) { return kolom.map(function (c) { const v = typeof c.k === 'function' ? c.k(r) : r[c.k]; return v === null || v === undefined ? '-' : String(v); }); }),
      headStyles: { fillColor: HIJAU, fontSize: 8.5 }, styles: { fontSize: 8.5, cellPadding: 2 }, theme: 'striped', margin: { left: 14, right: 14 } });
    kaki(doc);
    doc.save(aman(judul) + '.pdf');
  };
})();
