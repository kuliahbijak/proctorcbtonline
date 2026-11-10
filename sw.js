/*
 * ProctorCBT — Service Worker (PWA)
 * - Aset statis (HTML/CSS/JS/gambar/ikon/font/pustaka CDN) → cache, tampil instan & tahan sinyal lemah.
 * - Panggilan API Apps Script (script.google.com / googleusercontent) TIDAK PERNAH di-cache.
 * - config.js & halaman HTML: jaringan dulu (agar URL API & versi baru cepat terpakai), cache sebagai cadangan.
 * Naikkan VERSI setiap rilis (samakan dengan ?v= di index.html & APP_VERSION di core.js).
 */
const VERSI = '1.0.0';
const CACHE = 'pcbt-' + VERSI;
const INTI = [
  './', './index.html', './verify.html', './manifest.json', './css/style.css?v=' + VERSI,
  './js/config.js', './js/core.js?v=' + VERSI, './js/app.js?v=' + VERSI, './js/exam.js?v=' + VERSI, './js/admin.js?v=' + VERSI,
  './assets/login-bg-sm.jpg', './icons/icon-192.png', './icons/icon-512.png', './icons/favicon.svg'
];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) {
    // satu berkas gagal tidak boleh menggagalkan pemasangan
    return Promise.all(INTI.map(function (u) { return c.add(new Request(u, { cache: 'reload' })).catch(function () {}); }));
  }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k.indexOf('pcbt-') === 0 && k !== CACHE; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

function bolehCache(url) {
  if (url.origin === self.location.origin) return true;
  return /^(fonts\.googleapis\.com|fonts\.gstatic\.com|cdnjs\.cloudflare\.com)$/.test(url.hostname);
}

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;                                   // POST API → langsung ke jaringan
  const url = new URL(req.url);
  if (/(^|\.)script\.google(usercontent)?\.com$/.test(url.hostname)) return;   // API GAS: jangan disentuh
  if (!bolehCache(url)) return;

  const jaringanDulu = req.mode === 'navigate' || /\/js\/config\.js$/.test(url.pathname) || /\.html$/.test(url.pathname);
  if (jaringanDulu) {
    e.respondWith(fetch(req).then(function (res) {
      if (res && res.ok) { const salin = res.clone(); caches.open(CACHE).then(function (c) { c.put(req, salin); }); }
      return res;
    }).catch(function () {
      return caches.match(req, { ignoreSearch: req.mode === 'navigate' }).then(function (r) { return r || caches.match('./index.html'); });
    }));
    return;
  }
  // stale-while-revalidate untuk aset statis & font/pustaka CDN
  e.respondWith(caches.open(CACHE).then(function (c) {
    return c.match(req).then(function (hit) {
      const ambil = fetch(req).then(function (res) {
        if (res && (res.ok || res.type === 'opaque')) c.put(req, res.clone());
        return res;
      }).catch(function () { return hit; });
      return hit || ambil;
    });
  }));
});
