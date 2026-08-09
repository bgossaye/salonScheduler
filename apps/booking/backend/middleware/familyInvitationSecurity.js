const buckets = new Map();

function clientIp(req) {
  return String(req.ip || req.socket?.remoteAddress || 'unknown');
}

function createLimiter({ windowMs, max, keyFn, message }) {
  return (req, res, next) => {
    const now = Date.now();
    const key = String((keyFn && keyFn(req)) || clientIp(req));
    const bucketKey = `${req.baseUrl || ''}:${req.route?.path || req.path || ''}:${key}`;
    let bucket = buckets.get(bucketKey);
    if (!bucket || now >= bucket.resetAt) bucket = { count: 0, resetAt: now + windowMs };
    bucket.count += 1;
    buckets.set(bucketKey, bucket);
    if (bucket.count > max) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      return res.status(429).json({
        error: message || 'Too many requests. Please wait a little and try again.',
        code: 'RATE_LIMITED',
        retryAfterSeconds,
      });
    }
    // Opportunistic cleanup to prevent an unbounded in-memory map.
    if (buckets.size > 5000) {
      for (const [k, value] of buckets) if (now >= value.resetAt) buckets.delete(k);
    }
    return next();
  };
}

function noStoreInvitation(req, res, next) {
  res.set('Cache-Control', 'no-store, private, max-age=0');
  res.set('Pragma', 'no-cache');
  res.set('Referrer-Policy', 'no-referrer');
  res.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
  return next();
}

const publicInvitationReadLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 120 : 1200,
  keyFn: clientIp,
  message: 'Too many invitation requests. Please wait and try again.',
});
const publicInvitationActionLimiter = createLimiter({
  windowMs: 15 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 30 : 300,
  keyFn: (req) => `${clientIp(req)}:${String(req.params?.token || '').slice(0, 16)}`,
  message: 'Too many invitation attempts. Please wait and try again.',
});
const familyInviteSendLimiter = createLimiter({
  windowMs: 60 * 60 * 1000,
  max: process.env.NODE_ENV === 'production' ? 20 : 200,
  keyFn: (req) => req.client?.id || clientIp(req),
  message: 'Too many family invitations were sent recently. Please wait before sending another.',
});

module.exports = {
  noStoreInvitation,
  publicInvitationReadLimiter,
  publicInvitationActionLimiter,
  familyInviteSendLimiter,
};
