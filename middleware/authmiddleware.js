const jwt = require('jsonwebtoken');

function normalizePermissions(permissions) {
  if (!permissions) return {};
  if (permissions instanceof Map) return Object.fromEntries(permissions);
  if (typeof permissions === 'object') return { ...permissions };
  return {};
}

function authenticate(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.admin = {
      ...decoded,
      id: decoded.id || decoded._id,
      roleKey: decoded.roleKey || decoded.role || 'admin',
      permissions: normalizePermissions(decoded.permissions),
    };
    next();
  } catch (err) {
    res.status(401).json({ error: 'Invalid token' });
  }
}

function hasPermission(req, permissionKey) {
  if (!permissionKey) return true;
  const admin = req.admin || {};
  const roleKey = String(admin.roleKey || admin.role || '').toLowerCase();

  // Owner is always unrestricted. Admin is controlled by its permission map.
  if (roleKey === 'owner') return true;

  const permissions = normalizePermissions(admin.permissions);

  // Fail closed when a non-owner token has no permission payload.
  // This prevents old or malformed staff tokens from bypassing the new permission system.
  if (!permissions || Object.keys(permissions).length === 0) return false;

  return permissions[permissionKey] === true;
}

function requirePermission(permissionKey) {
  return (req, res, next) => {
    if (hasPermission(req, permissionKey)) return next();
    return res.status(403).json({ error: 'Forbidden', code: 'PERMISSION_REQUIRED', permission: permissionKey });
  };
}

function requireAnyPermission(permissionKeys = []) {
  return (req, res, next) => {
    const keys = Array.isArray(permissionKeys) ? permissionKeys : [permissionKeys];
    if (keys.some((key) => hasPermission(req, key))) return next();
    return res.status(403).json({ error: 'Forbidden', code: 'PERMISSION_REQUIRED', permissions: keys });
  };
}

authenticate.hasPermission = hasPermission;
authenticate.requirePermission = requirePermission;
authenticate.requireAnyPermission = requireAnyPermission;

module.exports = authenticate;
