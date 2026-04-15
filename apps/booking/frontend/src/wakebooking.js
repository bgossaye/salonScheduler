export async function wakeRender({ tag = 'booking-app' } = {}) {
  const ts = Date.now();
  const qs = `?ts=${ts}&t=${encodeURIComponent(tag)}`;

  const base = (window.__ENV?.API_BASE || '').replace(/\/$/, '');
  if (!base) return true;

  // Fire-and-forget wake
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(`${base}/api/healthz${qs}`);
    }
  } catch {
    /* ignore */
  }

  // Readable wake
  try {
    const res = await fetch(`${base}/api/healthz${qs}`, { cache: 'no-store' });
    return res.ok;
  } catch {
    return true;
  }
}
