// index.jsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './index.css';
import '@rakie/tokens/css';

const RECOVERY_KEY = 'rakie-stale-build-recovery';

async function recoverFromStaleBuild(reason) {
  try {
    const last = Number(sessionStorage.getItem(RECOVERY_KEY) || 0);
    const now = Date.now();
    // Prevent a reload loop if the problem is unrelated to caching.
    if (last && now - last < 60_000) return false;
    sessionStorage.setItem(RECOVERY_KEY, String(now));

    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.filter((key) => key.startsWith('rakie-')).map((key) => caches.delete(key)));
    }

    console.warn('[Rakie] Recovering from stale cached build:', reason);
    const url = new URL(window.location.href);
    url.searchParams.set('_rakie_refresh', String(now));
    window.location.replace(url.toString());
    return true;
  } catch (error) {
    console.error('[Rakie] Cache recovery failed', error);
    return false;
  }
}

// Catch old-deployment JS/CSS that no longer exists before React can render.
window.addEventListener(
  'error',
  (event) => {
    const target = event.target;
    if (
      target &&
      (target.tagName === 'SCRIPT' || target.tagName === 'LINK') &&
      (target.href || target.src)
    ) {
      recoverFromStaleBuild('asset-load-error');
    }
  },
  true
);

window.addEventListener('unhandledrejection', (event) => {
  const text = String(event.reason?.message || event.reason || '');
  if (/ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module|Importing a module script failed/i.test(text)) {
    recoverFromStaleBuild('chunk-load-error');
  }
});

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

// SW: prod only; clean in dev. updateViaCache:none keeps sw.js itself from
// getting trapped in the HTTP cache.
if ('serviceWorker' in navigator) {
  if (process.env.NODE_ENV === 'production') {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('/sw.js', {
          scope: '/',
          updateViaCache: 'none',
        });
        await registration.update();
      } catch (error) {
        console.error('[Rakie] Service worker registration failed', error);
      }
    });
  } else {
    navigator.serviceWorker.getRegistrations?.().then((r) => r.forEach((sw) => sw.unregister()));
    caches?.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }
}
