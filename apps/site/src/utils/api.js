// apps/site/src/utils/api.js

const ABS = /^https?:\/\//i;

// ---- Base selection (absolute backend origin) ----
const ENV = (typeof window !== 'undefined' && window.ENV) || {};
const qp  = new URLSearchParams((typeof window !== 'undefined' && window.location.search) || '');

const isLocalSite = typeof window !== 'undefined' &&
  ['localhost', '127.0.0.1'].includes(window.location.hostname);

const LOCAL_BACKEND = 'http://localhost:5000';
const PRODUCTION_BACKEND = 'https://rakie-backend.onrender.com';

const queryOverride = qp.get('apibase') || '';
const savedOverride = typeof window !== 'undefined'
  ? sessionStorage.getItem('API_BASE_OVERRIDE') || ''
  : '';
const configuredBase = ENV.API_BASE || ENV.BACKEND_URL || ENV.API || PRODUCTION_BACKEND;

// Local development must use the local backend. A query-string override remains
// available for intentional testing, e.g. ?apibase=http://192.168.1.20:5000.
const selectedBase = ABS.test(queryOverride)
  ? queryOverride
  : isLocalSite
    ? LOCAL_BACKEND
    : ABS.test(savedOverride)
      ? savedOverride
      : configuredBase;

export const BASE = selectedBase.replace(/\/$/, ''); // absolute

if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  console.info('[Rakie site] API base:', BASE);
}

// Build absolute URL for the Site (cross-origin to backend)
export const toUrl = (path = '/') =>
  ABS.test(path) ? path : `${BASE}${path.startsWith('/') ? path : `/${path}`}`;

// Query-string helper
function qs(params = {}) {
  const u = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v !== undefined && v !== null) u.append(k, String(v));
  });
  return u.toString();
}

// Robust JSON guard
async function toJSONOrThrow(resp) {
  const ct = resp.headers.get('content-type') || '';
  if (!resp.ok) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`HTTP ${resp.status} ${resp.statusText} — ${txt.slice(0,200)}`);
  }
  if (!ct.includes('application/json')) {
    const txt = await resp.text().catch(() => '');
    throw new Error(`Expected JSON, got ${ct}. First bytes: ${txt.slice(0,120)}`);
  }
  return resp.json();
}

// GET with query params; choose creds automatically (omit for cross-origin)
export async function getJSONQ(path, params = {}, init = {}) {
  const base = toUrl(path);
  const url  = (() => {
    const q = qs(params);
    return q ? `${base}${base.includes('?') ? '&' : '?'}${q}` : base;
  })();

  const isCross = (() => {
    try { return new URL(url).origin !== window.location.origin; } catch { return true; }
  })();
  const creds = init.credentials ?? (isCross ? 'omit' : 'include');

  const resp = await fetch(url, {
    ...init,
    credentials: creds,
    headers: { Accept: 'application/json', ...(init.headers || {}) }
  });
  return toJSONOrThrow(resp);
}

// Tiny TTL cache with in-flight de-dupe
export function cached(key, ttlMs, loader) {
  let inFlight = null;
  return async () => {
    const now = Date.now();
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const { ts, data } = JSON.parse(raw);
        if (ts && now - ts < ttlMs) return data;
      }
    } catch {""}
    if (!inFlight) {
      inFlight = (async () => {
        const data = await loader();
        try { localStorage.setItem(key, JSON.stringify({ ts: now, data })); } catch {""}
        return data;
      })();
    }
    try { return await inFlight; } finally { inFlight = null; }
  };
}

// Single, non-duplicated API export
export const API = {
  getJSONQ,
  cached,
  wake(tag = 'site') {
    const ts = Date.now();
    // readable OK for the Site (don’t need cookies)
    return fetch(toUrl(`/healthz?ts=${ts}&t=${encodeURIComponent(tag)}`), {
      cache: 'no-store',
      credentials: 'omit'
    }).catch(() => {
      // silent poke, also cross-origin
      try { navigator.sendBeacon?.(toUrl(`/ping?ts=${ts}&t=${encodeURIComponent(tag)}`)); } catch {""}
    });
  },
};
