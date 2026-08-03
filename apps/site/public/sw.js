const CACHE = 'rakie-site-v2';
const CORE = ['/', '/index.html', '/manifest.json', '/favicon.ico', '/icons/icon-192.png', '/icons/icon-512.png', '/icons/maskable-512.png', '/icons/apple-touch-icon.png'];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE)));
  self.skipWaiting();
});
self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});
self.addEventListener('fetch', (e) => {
  const req = e.request;

  // SPA nav: fallback to index on offline
  if (req.mode === 'navigate') {
    e.respondWith(fetch(req).catch(() => caches.match('/index.html')));
    return;
  }

  // cache-first for CRA static assets in BOTH apps
  if (req.url.includes('/static/') || req.url.includes('/booking/static/')) {
    e.respondWith(
      caches.match(req).then(
        cached => cached ||
          fetch(req).then(res => {
            const copy = res.clone();
            caches.open(CACHE).then(c => c.put(req, copy));
            return res;
          })
      )
    );
  }
});
