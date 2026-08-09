const jwt = require('jsonwebtoken');

function authenticateClient(req, res, next) {
  const raw = String(req.headers.authorization || '');
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: 'Please sign in again to continue.', code: 'CLIENT_AUTH_REQUIRED' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (String(decoded?.tokenType || '') !== 'client' || !decoded?.id) {
      return res.status(401).json({ error: 'Please sign in again to continue.', code: 'CLIENT_AUTH_INVALID' });
    }
    req.client = { id: String(decoded.id), phone: String(decoded.phone || '') };
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Your sign-in has expired. Please sign in again.', code: 'CLIENT_AUTH_EXPIRED' });
  }
}

function optionalClientAuth(req, res, next) {
  const raw = String(req.headers.authorization || '');
  const token = raw.startsWith('Bearer ') ? raw.slice(7).trim() : '';
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (String(decoded?.tokenType || '') === 'client' && decoded?.id) {
      req.client = { id: String(decoded.id), phone: String(decoded.phone || '') };
    }
  } catch (_) {
    // Public lookup remains available without authentication; an invalid token
    // simply does not grant access to the full profile.
  }
  return next();
}

function requireClientSelfParam(paramName = 'id') {
  return (req, res, next) => {
    if (!req.client?.id || String(req.params?.[paramName] || '') !== String(req.client.id)) {
      return res.status(403).json({ error: 'You do not have permission to manage this family account.', code: 'CLIENT_ACCOUNT_MISMATCH' });
    }
    return next();
  };
}

authenticateClient.requireClientSelfParam = requireClientSelfParam;
authenticateClient.optionalClientAuth = optionalClientAuth;
module.exports = authenticateClient;
