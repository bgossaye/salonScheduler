// Minimal, browser-safe helpers used by both apps
// --- Wake the Render service (boolean result) ---
const WAKE_LOCK_KEY = "__wakeRender_lock__";
const LOCK_MS = 120000; // 2 minutes

// --- API base (single source of truth) ---
export function getApiBase() {
  const w = typeof window !== "undefined" ? window : {};
  const fromWindow = (w.__ENV && w.__ENV.API_BASE) || w.API_BASE;
  const fromNode =
    typeof process !== "undefined" && process.env
      ? process.env.REACT_APP_API_BASE
      : undefined;

const fromNodeUrl =
   typeof process !== "undefined" && process.env
     ? process.env.REACT_APP_API_URL
     : undefined;

 const baseRaw = (fromWindow || fromNode || fromNodeUrl || "").trim();
 const base = baseRaw.replace(/\/api\/?$/, ""); // normalize if URL had /api

  return base.replace(/\/+$/, "");
}


function hasFreshLock() {
  try {
    const v = localStorage.getItem(WAKE_LOCK_KEY);
    return v && Date.now() - Number(v) < LOCK_MS;
  } catch { return false; }
}

function setLock() {
  try { localStorage.setItem(WAKE_LOCK_KEY, String(Date.now())); } catch {}
}
function clearLock() {
  try { localStorage.removeItem(WAKE_LOCK_KEY); } catch {}
}

function candidateBases() {
  const base = getApiBase();
  // Try configured base first; then same-origin (dev proxy like CRA/Vite)
  return base ? [base, ""] : [""];
}

async function tryOnce(url, { method = "GET", timeoutMs = 2500, body } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const opts = { method, signal: ctrl.signal, headers: {}, mode: "no-cors", cache: "no-store" };
    if (body) {
      opts.method = "POST";
      opts.headers["Content-Type"] = "application/json";
      opts.body = JSON.stringify(body);
    }
    // With mode:no-cors the response is opaque; any network response counts as "likely up".
    await fetch(url, opts);
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Wake your backend. Returns true if any probe likely reached the server.
 * Usage: const ok = await wakeRender({ db: false, tag: 'home' })
 */
export async function wakeRender({ db = false, tag = "" } = {}) {
  // De-dupe bursts
  if (hasFreshLock()) return false;
  setLock();

  const bases = candidateBases();
  const paths = ["/healthz", "/api/healthz", "/ping", "/api/ping"];
  const payload = { tag, db: db ? "1" : undefined };

  const delays = [0, 500, 1500]; // staggered tries
  for (const delay of delays) {
    await new Promise(r => setTimeout(r, delay + Math.random() * 250));
    for (const base of bases) {
      for (const p of paths) {
        const url = `${base}${p}`;
        const ok = await tryOnce(url, { method: payload.db ? "POST" : "GET", body: payload.db ? payload : undefined });
        if (ok) { clearLock(); return true; }
      }
    }
  }
  // Let the lock expire naturally; avoid thundering herd.
  return false;
}
