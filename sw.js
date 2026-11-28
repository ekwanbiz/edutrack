// Service worker EduTrack: simpan fail app supaya boleh dibuka tanpa internet.
const CACHE = 'edutrack-v24'; // sama dengan VERSI dalam app.js dan version.json
const FILES = [
  './',
  './index.html',
  './styles.css?v=24',
  './app.js?v=24',
  './config.js',
  './vendor/supabase.js',
  './vendor/qrcode.js',
  './vendor/qr-scanner.umd.min.js',
  './vendor/qr-scanner-worker.min.js',
  './manifest.webmanifest',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/logo.svg'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Data Supabase sentiasa terus ke rangkaian.
  if (url.origin !== self.location.origin) return;
  // Fail app: cuba rangkaian dahulu (dapat versi terbaru), guna simpanan jika luar talian.
  // cache: 'no-cache' = sentiasa tanya pelayan sama ada fail berubah (jimat: jawapan "tiada perubahan" sangat kecil).
  e.respondWith(
    fetch(req.url, { cache: 'no-cache', credentials: 'same-origin' })
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((r) => r || caches.match('./index.html')))
  );
});
