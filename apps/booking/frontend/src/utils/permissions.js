export function getAdminUser() {
  try {
    const raw = localStorage.getItem('adminUser');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function getPermissions() {
  return getAdminUser()?.permissions || {};
}

export function hasPermission(permissionKey) {
  const admin = getAdminUser();
  const permissions = admin?.permissions;
  if (admin?.roleKey === 'owner') return true;
  // Match backend behavior: non-owner sessions without a permission payload fail closed.
  if (!permissions || Object.keys(permissions).length === 0) return false;
  return permissions[permissionKey] === true;
}

export function hasAnyPermission(permissionKeys = []) {
  return (Array.isArray(permissionKeys) ? permissionKeys : [permissionKeys]).some((key) => hasPermission(key));
}

export function getStaffLandingPath() {
  if (hasPermission('appointmentsViewAll')) return '/admin/appointments';
  if (hasPermission('appointmentsViewOwn')) return '/admin/my-work';
  if (hasPermission('workersView')) return '/admin/workers';
  if (hasPermission('servicesView')) return '/admin/services';
  return '/admin/dashboard';
}
