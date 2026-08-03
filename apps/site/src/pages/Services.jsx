import { useState, useEffect, useMemo } from 'react';
import { discountedPriceCents, getDealForService, usePublicDeals } from '../utils/publicDeals';

const SERVICES_PATH = window.ENV?.SERVICES_PATH || '/api/services';
const SERVICES_URL = /^https?:\/\//i.test(SERVICES_PATH)
  ? SERVICES_PATH
  : `${window.ENV?.API_BASE || 'https://rakie-backend.onrender.com'}${SERVICES_PATH}`;

// --- force-local switch (env, URL, or localStorage) ---
const FORCE_LOCAL_SERVICES = (() => {
  try {
    const env = window.ENV?.FORCE_LOCAL_SERVICES;
    if (env != null && String(env).toLowerCase() !== 'false') {
      return Boolean(JSON.parse(String(env).toLowerCase() || 'true'));
    }
  } catch {
    '';
  }
  try {
    const qs = new URLSearchParams(location.search);
    if (qs.has('localServices')) {
      return ['1', 'true', 'yes'].includes(qs.get('localServices')?.toLowerCase());
    }
  } catch {
    '';
  }
  try {
    const ls = localStorage.getItem('forceLocalServices');
    if (ls != null) return ['1', 'true', 'yes'].includes(ls.toLowerCase());
  } catch {
    '';
  }
  return false;
})();

/** ---------- utils ---------- */
function formatPrice(priceCents, fallbackDollars) {
  const cents =
    typeof priceCents === 'number'
      ? priceCents
      : Math.round((fallbackDollars || 0) * 100);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency: 'USD',
    }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

const slugify = (s = '') =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// sort items within a category: order -> name
function itemComparator(a, b) {
  const ao = a?.order ?? 0;
  const bo = b?.order ?? 0;
  if (ao !== bo) return ao - bo;
  const an = a?.name || '';
  const bn = b?.name || '';
  return an.localeCompare(bn, undefined, { sensitivity: 'base' });
}

// ----- client-side cache helpers -----
const CACHE_KEY = 'servicesCache:v1';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

function loadCached() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const { ts, data } = JSON.parse(raw);
    if (!Array.isArray(data)) return null;
    if (Date.now() - ts > CACHE_TTL_MS) return null; // stale
    return data;
  } catch {
    return null;
  }
}

function saveCached(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
  } catch {
    '';
  }
}

async function fetchWithTimeout(url, opts = {}, timeoutMs = 8000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...opts, signal: controller.signal });
    return res;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchJSONWithRetry(url, opts = {}) {
  try {
    const r = await fetchWithTimeout(url, opts, 9000);
    const ct = r.headers.get('content-type') || '';
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    if (!ct.includes('application/json')) throw new Error('Non-JSON');
    return await r.json();
  } catch (e) {
    // quick backoff + one retry
    await new Promise((r) => setTimeout(r, 600));
    const r2 = await fetchWithTimeout(url, opts, 12000);
    const ct2 = r2.headers.get('content-type') || '';
    if (!r2.ok) throw new Error(`HTTP ${r2.status}`);
    if (!ct2.includes('application/json')) throw new Error('Non-JSON');
    return await r2.json();
  }
}

// Load static copy from /public/data/services.json as a safe fallback
async function fetchLocalServicesFallback() {
  const r = await fetch('/data/services.json', { cache: 'no-store' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  if (!(r.headers.get('content-type') || '').includes('application/json')) {
    throw new Error('Non-JSON from static services.json');
  }
  const json = await r.json();
  const list = Array.isArray(json) ? json : json?.services;
  if (!Array.isArray(list)) throw new Error('Bad payload');
  return list;
}

/** ---------- component ---------- */
export default function Services() {
  const [services, setServices] = useState(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const [usingCache, setUsingCache] = useState(false);
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [loading, setLoading] = useState(false);
  const { deals } = usePublicDeals();

  // load cached immediately, then refresh in background
  useEffect(() => {
    // 1) show cached instantly (if fresh)
    const cached = loadCached();
    if (cached) {
      setServices(cached);
      setUsingCache(true);
    }

    // 2) fetch fresh in the background
    const url = SERVICES_URL;
    let cancelled = false;
    setLoading(true);

    const getFromNetwork = () =>
      fetchJSONWithRetry(url, { credentials: 'omit', cache: 'no-store' });

    const getFromLocal = () => fetchLocalServicesFallback();

    const loader = FORCE_LOCAL_SERVICES ? getFromLocal() : getFromNetwork();

    loader
      .then((data) => {
        if (cancelled) return;
        const list = Array.isArray(data) ? data : data?.services;
        if (!Array.isArray(list)) throw new Error('Bad payload');
        setServices(list);
        saveCached(list);
        setUsingCache(false);
        setError('');
      })
      .catch(async (err) => {
        if (cancelled) return;
        console.warn('services fetch failed, trying fallback:', err);
        try {
          const list = await fetchLocalServicesFallback();
          setServices(list);
          saveCached(list);
          setUsingCache(false);
          setError('');
        } catch (e) {
          // If we already had cache, stay quiet; otherwise show a minimal error
          if (!cached) {
            setError('Unable to load services. Check your connection and try again.');
          }
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  // track online/offline & auto-refresh when back online
  useEffect(() => {
    function onOnline() {
      setIsOnline(true);
      // try to refresh if we were showing cache or had an error
      if (usingCache || error) {
        const url = SERVICES_URL;
        fetchJSONWithRetry(url, { credentials: 'omit', cache: 'no-store' })
          .then((data) => {
            const list = Array.isArray(data) ? data : data?.services;
            if (Array.isArray(list)) {
              setServices(list);
              saveCached(list);
              setUsingCache(false);
              setError('');
            }
          })
          .catch(async () => {
            try {
              const list = await fetchLocalServicesFallback();
              setServices(list);
              saveCached(list);
              setUsingCache(false);
              setError('');
            } catch {
              '';
            }
          });
      }
    }
    function onOffline() {
      setIsOnline(false);
    }
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, [usingCache, error]);

  const grouped = useMemo(() => {
    const S = services || [];
    const q = query.trim().toLowerCase();
    const f = q
      ? S.filter(
          (s) =>
            s.name?.toLowerCase().includes(q) ||
            s.category?.toLowerCase().includes(q)
        )
      : S;

    const byCat = new Map();
    for (const s of f) {
      const cat = s.category || 'Other';
      if (!byCat.has(cat)) byCat.set(cat, []);
      byCat.get(cat).push(s);
    }

    // Sort: alphabetically, but push "Add-ons" (and variants) to the bottom
    return Array.from(byCat.entries()).sort(([a], [b]) => {
      const addOnRx = /add[\s\u2010-\u2015-]*ons?/i; // handles Add-ons / Add ons / Addons
      const aIs = addOnRx.test(a);
      const bIs = addOnRx.test(b);
      if (aIs && !bIs) return 1;
      if (!aIs && bIs) return -1;
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    });
  }, [services, query]);

  const retry = () => {
    setError('');
    setLoading(true);
    const url = SERVICES_URL;
    const fn = FORCE_LOCAL_SERVICES
      ? fetchLocalServicesFallback
      : () => fetchJSONWithRetry(url, { credentials: 'omit', cache: 'no-store' });
    fn()
      .then((data) => {
        const list = Array.isArray(data) ? data : data?.services;
        if (!Array.isArray(list)) throw new Error('Bad payload');
        setServices(list);
        saveCached(list);
        setUsingCache(false);
      })
      .catch(async () => {
        try {
          const list = await fetchLocalServicesFallback();
          setServices(list);
          saveCached(list);
          setUsingCache(false);
          setError('');
        } catch {
          setError('Unable to load services. Please try again.');
        }
      })
      .finally(() => setLoading(false));
  };

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="text-center">
        <h1
          className="text-4xl md:text-5xl tracking-wide text-gray-900"
          style={{ fontFamily: '"Playfair Display", serif' }}
        >
          Rakie&apos;s Menu
        </h1>
        <p className="mt-1 text-xs uppercase tracking-[0.25em] text-gray-500">
          Service Menu
        </p>
        <div className="mt-4 mx-auto h-[2px] w-40 bg-gradient-to-r from-transparent via-gray-400 to-transparent" />
        <p className="mt-2 text-xs text-gray-500">
          * Prices may vary based on hair length, density, or texture.
        </p>

        {deals.length > 0 && (
        <div className="mx-auto mt-6 max-w-3xl rounded-2xl border border-amber-200 bg-gradient-to-r from-amber-50 via-yellow-50 to-white p-5 text-left shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#800000]">
                Featured special
              </p>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                {deals[0]?.title || 'Current special'}
              </h2>
              <p className="mt-2 text-sm text-slate-700">
                Eligible services below show their current promotional price automatically.
              </p>
            </div>
            <a
              href="/booking"
              className="inline-flex items-center justify-center rounded-xl bg-[#800000] px-5 py-3 text-sm font-semibold text-white shadow-sm hover:opacity-95"
            >
              Book This Deal
            </a>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {(deals[0]?.services?.length ? deals[0].services : [deals[0]?.dayText, deals[0]?.discountLabel].filter(Boolean)).map((item) => (
              <span key={item} className="rounded-full border border-amber-300 bg-white px-3 py-1.5 text-sm text-slate-800 shadow-sm">{item}</span>
            ))}
          </div>
          <p className="mt-4 text-xs text-slate-600">
            {deals[0]?.details?.join('. ') || 'Limited time offer. See booking details for eligibility.'}
          </p>
        </div>

        )}

        {/* Search */}
        <div className="mx-auto mt-6 w-full max-w-sm">
          <div className="relative">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search service or category…"
              className="w-full rounded-xl border border-gray-300 bg-white px-4 py-2 pr-10 shadow-sm focus:outline-none focus:ring-2 focus:ring-gray-900/20"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 opacity-60">
              🔎
            </span>
          </div>
        </div>
      </header>

      {/* Status banner */}
      {(usingCache || !isOnline) && (
        <div className="mt-6 rounded-lg border border-blue-200 bg-blue-50 p-3 text-center text-sm text-blue-800">
          {(!isOnline && 'You are offline. ') || ''}
          Showing saved menu. Some updates may not appear until you reconnect.
        </div>
      )}

      {error && (
        <div className="mt-6 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          <span className="block w-full text-center">{error}</span>
          <button
            onClick={retry}
            className="whitespace-nowrap rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:brightness-110"
            disabled={loading}
            title="Retry"
          >
            {loading ? 'Retrying…' : 'Retry'}
          </button>
        </div>
      )}

      {!services && !error && (
        <div className="mt-10 grid gap-4 sm:grid-cols-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="rounded-2xl border bg-white p-5 shadow-sm">
              <div className="h-5 w-40 animate-pulse rounded bg-gray-200" />
              <div className="mt-3 h-4 w-24 animate-pulse rounded bg-gray-200" />
              <div className="mt-6 h-9 w-28 animate-pulse rounded bg-gray-200" />
            </div>
          ))}
        </div>
      )}

      {grouped.length > 0 && (
        <div className="mt-10 space-y-8">
          {grouped.map(([category, items]) => (
            <section key={category}>
              <div className="relative py-5">
                <div className="absolute inset-0 flex items-center" aria-hidden>
                  <div className="w-full border-t border-gray-300/70" />
                </div>
                <div className="relative inline-flex items-center gap-3 bg-white px-3">
                  <span
                    className="text-2xl tracking-wide uppercase text-gray-900"
                    style={{ fontFamily: '"Playfair Display", serif' }}
                  >
                    {category}
                  </span>
                  <span className="text-[10px] uppercase tracking-widest text-gray-500">
                    Rakie Menu
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {[...items].sort(itemComparator).map((s) => {
                  const id = s._id || s.slug || slugify(s.name);
                  const price = formatPrice(s.priceCents, s.price);
                  const andUp =
                    (s.label && /and\s*up/i.test(String(s.label))) || s.and_up;
                  const specialDeal = getDealForService(s, deals);
                  const discountedPrice = specialDeal
                    ? formatPrice(discountedPriceCents(s, specialDeal))
                    : null;

                  return (
                    <article
                      key={id}
                      className={`group relative rounded-xl border bg-white/90 p-4 shadow-sm transition hover:-translate-y-[1px] hover:shadow-md ${
                        specialDeal
                          ? 'border-amber-300 ring-1 ring-amber-200/70'
                          : 'border-gray-200'
                      }`}
                    >
                      {/* hover → show schedule */}
                      <span className="absolute right-2 top-2">
                        <a
                          href={`/booking?service=${encodeURIComponent(id)}`}
                          className="inline-flex items-center rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-semibold text-white opacity-0 shadow-sm transition-opacity hover:brightness-110 group-hover:opacity-100"
                        >
                          Schedule
                        </a>
                      </span>

                      {specialDeal && (
                        <div className="mb-3 flex flex-wrap items-center gap-2 pr-24">
                          <span className="rounded-full bg-amber-100 px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-800">
                            {specialDeal.shortLabel}
                          </span>
                          <span className="text-xs text-slate-600">
                            Promotional price shown below
                          </span>
                        </div>
                      )}

                      {/* name … dotted leader … price */}
                      <div className="flex items-baseline gap-2">
                        <span className="text-gray-900">{s.name}</span>
                        <div className="mx-2 grow translate-y-[6px] border-b border-dotted border-gray-400/70" />
                        <span
                          className={`font-semibold ${
                            specialDeal ? 'text-gray-400 line-through' : 'text-gray-900'
                          }`}
                        >
                          {price}
                          {andUp ? (
                            <span className="ml-1 text-xs text-gray-500">and up</span>
                          ) : null}
                        </span>
                      </div>

                      {specialDeal && (
                        <div className="mt-2 flex items-baseline justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2 text-sm">
                          <span className="font-medium text-amber-800">
                            Special price
                          </span>
                          <span className="text-base font-semibold text-amber-900">
                            {discountedPrice}
                          </span>
                        </div>
                      )}

                      {(s.duration || 0) > 0 && (
                        <div className="mt-2 text-xs text-gray-500">{s.duration} min</div>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      {services && grouped.length === 0 && (
        <div className="mt-12 rounded-xl border bg-white p-10 text-center text-gray-600">
          No services match your search.
        </div>
      )}
    </main>
  );
}
