// Lightweight, dependency-free rate limiter for the admin login endpoint.
// Mirrors the in-memory bucket pattern already used for client OTP requests
// (see controllers/client/clientcontroller.js) so it doesn't require adding
// a new package (e.g. express-rate-limit) to the project.
//
// This protects against brute-force login attempts from a single IP.
// It is intentionally separate from the per-account lockout in
// authadmincontroller.js: this middleware limits *request volume* per IP,
// the account lockout limits *failed attempts* per account. Together they
// cover both a single attacker hammering one account and an attacker
// spraying many accounts from one IP.
//
// Note: this is in-memory, so it resets on process restart and does not
// share state across multiple instances. If/when this service runs behind
// a load balancer with more than one instance, move this to Redis (or a
// Mongo-backed counter, consistent with the rest of the app) to keep the
// limit consistent across processes.

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const MAX_ATTEMPTS_PER_WINDOW = 10; // per IP, across all admin accounts

const buckets = new Map();

function pruneExpired(now) {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

function clientIp(req) {
  // Respect a trusted proxy's X-Forwarded-For if present (Render/most PaaS
  // set this); fall back to the raw socket address.
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  return forwarded || req.ip || req.connection?.remoteAddress || 'unknown';
}

function loginRateLimiter(req, res, next) {
  const now = Date.now();
  // Opportunistic cleanup so the map doesn't grow unbounded; cheap relative
  // to request volume on a login endpoint.
  if (buckets.size > 5000) pruneExpired(now);

  const key = clientIp(req);
  let bucket = buckets.get(key);

  if (!bucket || bucket.resetAt <= now) {
    bucket = { count: 0, resetAt: now + WINDOW_MS };
    buckets.set(key, bucket);
  }

  bucket.count += 1;

  if (bucket.count > MAX_ATTEMPTS_PER_WINDOW) {
    const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
    res.set('Retry-After', String(retryAfterSeconds));
    return res.status(429).json({
      error: 'Too many login attempts. Please wait a few minutes and try again.',
      code: 'LOGIN_RATE_LIMITED',
      retryAfterSeconds,
    });
  }

  return next();
}

module.exports = loginRateLimiter;
