/*
 * Rakie Salon site service worker.
 *
 * IMPORTANT OWNERSHIP BOUNDARY:
 *   /booking and everything below it belong to the separate booking app.
 *   This worker is root-scoped for the marketing-site PWA, but it must never
 *   intercept or cache booking navigations, JS, CSS, runtime config, or assets.
 */
const CACHE = 'rakie-site-shell-v5';
const SHELL = [
  '/manifest.json',
  '/favicon.ico',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(SHELL)).catch(() => undefined)
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((key) => key.startsWith('rakie-site-shell-') && key !== CACHE)
          .map((key) => caches.delete(key))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // The booking application is independently deployed under /booking.
  // Returning without event.respondWith() lets the browser/network handle it
  // normally, completely outside this site's CacheStorage strategy.
  if (url.pathname === '/booking' || url.pathname.startsWith('/booking/')) {
    return;
  }

  // Never serve cached HTML for site navigation. A stale HTML shell can point
  // at JS/CSS bundles that were removed by a later deployment.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request, { cache: 'no-store' }).catch(() =>
        new Response(
          '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="font-family:sans-serif;padding:2rem"><h2>Rakie Salon</h2><p>You appear to be offline. Please reconnect and reload this page.</p></body></html>',
          { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } }
        )
      )
    );
    return;
  }

  // Never cache deployment-sensitive root-site files.
  if (
    url.pathname === '/sw.js' ||
    url.pathname === '/manifest.json' ||
    url.pathname === '/env.js' ||
    url.pathname === '/index.html'
  ) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  // Only the ROOT SITE's content-hashed build assets are cached here.
  // ^/static prevents /booking/static/... from ever matching this rule.
  if (/^\/static\/(js|css|media)\//.test(url.pathname)) {
    event.respondWith(
      caches.match(request).then((cached) => {
        if (cached) return cached;
        return fetch(request).then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        });
      })
    );
  }
});
