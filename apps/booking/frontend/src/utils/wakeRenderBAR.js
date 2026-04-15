// src/utils/wakeRender.js
const KEY = 'wake:inflightAt';
const TTL_MS = 15_000; // don't duplicate work across tabs within 15s

function getApiBases() {
  const cands = [];
  // Prefer explicit config if present
  if (window.API_BASE) cands.push(window.API_BASE);
  if (process?.env?.REACT_APP_API_BASE) cands.push(process.env.REACT_APP_API_BASE);
  // Same-origin fallbacks
  cands.push('');
  return [...new Set(cands)].filter(Boolean);
}

async function tryOnce(url, { method = 'HEAD', timeoutMs = 2500, body } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const opts = { method, signal: ctrl.signal, headers: {} };
    if (body) {
      opts.method = 'POST';
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    }
    const res = await fetch(url, opts);
    return res.ok || res.status === 204;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export async function wakeRender({ db = false, tag = '' } = {}) {
  // Tab-wide de-dupe
  const now = Date.now();
  const last = Number(localStorage.getItem(KEY) || 0);
  if (now - last < TTL_MS) return;
  localStorage.setItem(KEY, String(now));

  const bases = getApiBases();
  const paths = ['/healthz', '/ping', '/api/ping'];
  const payload = { k: (window.KEEPALIVE_KEY || undefined), db: db ? '1' : undefined };

  // 3 short attempts with exponential backoff + jitter
  const attempts = [0, 500, 1500];
  for (const delay of attempts) {
    await new Promise(r => setTimeout(r, delay + Math.random() * 250));
    for (const base of bases) {
      for (const p of paths) {
        const url = base + p + (payload.k || db ? '' : ''); // we’ll prefer POST when body is present
        const ok = await tryOnce(url, { method: payload.k || db ? 'POST' : 'HEAD', body: (payload.k || db) ? payload : undefined });
        if (ok) { localStorage.removeItem(KEY); return; }
      }
    }
  }
  // Leave the lock to expire naturally; we failed quietly.
}
