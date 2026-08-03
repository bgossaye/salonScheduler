const AdminNotification = require('../../models/adminnotification');

function isAdminLike(req) {
  const roleKey = String(req.admin?.roleKey || req.admin?.role || '').toLowerCase();
  return ['owner', 'admin', 'manager', 'frontdesk'].includes(roleKey) || req.admin?.permissions?.clientsAssignStylist === true;
}

function tokenWorkerId(req) {
  return req.admin?.workerId ? String(req.admin.workerId) : '';
}

function notificationAccessQuery(req, includeRead = false) {
  const statusFilter = includeRead ? {} : { status: 'unread' };
  if (isAdminLike(req)) return statusFilter;
  const mine = tokenWorkerId(req);
  if (!mine) return null;
  return {
    ...statusFilter,
    $or: [
      { toWorkerId: mine },
      { fromWorkerId: mine },
    ],
  };
}

function publicNotification(item) {
  return {
    _id: String(item._id),
    type: item.type || '',
    severity: item.severity || 'info',
    title: item.title || 'Notification',
    message: item.message || '',
    actorName: item.actorName || '',
    actorEmail: item.actorEmail || '',
    status: item.status || 'unread',
    createdAt: item.createdAt,
    readAt: item.readAt || null,
    clientId: item.clientId ? String(item.clientId) : '',
    fromWorkerId: item.fromWorkerId ? String(item.fromWorkerId) : '',
    toWorkerId: item.toWorkerId ? String(item.toWorkerId) : '',
    metadata: item.metadata || {},
  };
}

exports.listNotifications = async (req, res) => {
  try {
    const includeRead = String(req.query?.includeRead || '').toLowerCase() === 'true';
    const limit = Math.min(Math.max(Number(req.query?.limit || 30), 1), 100);
    const query = notificationAccessQuery(req, includeRead);
    if (!query) return res.status(403).json({ error: 'Forbidden' });
    const unreadQuery = notificationAccessQuery(req, false) || { _id: null };
    const list = await AdminNotification.find(query).sort({ createdAt: -1 }).limit(limit).lean();
    const unread = await AdminNotification.countDocuments(unreadQuery);
    res.json({ notifications: list.map(publicNotification), unread });
  } catch (err) {
    console.error('listNotifications failed:', err?.message || err);
    res.status(500).json({ error: 'Failed to load admin notifications.' });
  }
};

exports.markRead = async (req, res) => {
  try {
    const accessQuery = notificationAccessQuery(req, true);
    if (!accessQuery) return res.status(403).json({ error: 'Forbidden' });
    const updated = await AdminNotification.findOneAndUpdate(
      { _id: req.params.id, ...accessQuery },
      { $set: { status: 'read', readAt: new Date() } },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: 'Notification not found.' });
    res.json({ success: true, notification: publicNotification(updated) });
  } catch (err) {
    console.error('markRead notification failed:', err?.message || err);
    res.status(500).json({ error: 'Failed to update notification.' });
  }
};

exports.markAllRead = async (req, res) => {
  try {
    const accessQuery = notificationAccessQuery(req, false);
    if (!accessQuery) return res.status(403).json({ error: 'Forbidden' });
    const result = await AdminNotification.updateMany(
      accessQuery,
      { $set: { status: 'read', readAt: new Date() } }
    );
    res.json({ success: true, modifiedCount: result.modifiedCount || 0 });
  } catch (err) {
    console.error('markAllRead notification failed:', err?.message || err);
    res.status(500).json({ error: 'Failed to update notifications.' });
  }
};
