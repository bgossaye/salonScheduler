const SystemErrorLog = require('../../models/systemerrorlog');
const {
  getSystemErrorRetentionSettings,
  pruneSystemErrorHistory,
} = require('../../utils/systemErrorLogger');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 150;

function canViewSystemErrors(req) {
  const roleKey = String(req.admin?.roleKey || req.admin?.role || '').toLowerCase();
  const permissions = req.admin?.permissions || {};
  return roleKey === 'owner' || roleKey === 'admin' || permissions.systemErrorsView === true;
}

function truthy(value) {
  return ['1', 'true', 'yes', 'all'].includes(String(value || '').toLowerCase());
}

function publicErrorLog(log) {
  const firstOccurredAt = log.firstOccurredAt || log.occurredAt || log.createdAt;
  const lastOccurredAt = log.lastOccurredAt || log.occurredAt || log.updatedAt || log.createdAt;
  return {
    _id: String(log._id),
    level: 'error',
    source: log.source || '',
    message: log.message || '',
    name: log.name || '',
    stack: log.stack || '',
    details: log.details || '',
    route: log.route || '',
    method: log.method || '',
    adminEmail: log.adminEmail || '',
    fingerprint: log.fingerprint || '',
    occurrenceCount: Number(log.occurrenceCount || 1),
    firstOccurredAt,
    lastOccurredAt,
    resolved: !!log.resolved,
    resolvedAt: log.resolvedAt || null,
    resolvedBy: log.resolvedBy || '',
    occurredAt: lastOccurredAt,
  };
}

function buildListFilter(req) {
  const includeResolved = truthy(req.query.includeResolved) || String(req.query.resolved || '').toLowerCase() === 'all';
  const filter = { level: 'error' };
  if (!includeResolved) filter.resolved = false;
  return { filter, includeResolved };
}

exports.listErrors = async (req, res) => {
  if (!canViewSystemErrors(req)) {
    return res.status(403).json({ error: 'System error logs are only available to Owner/Admin users.' });
  }

  try {
    await pruneSystemErrorHistory({ force: true });

    const limit = Math.min(Math.max(Number(req.query.limit) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    const { filter, includeResolved } = buildListFilter(req);
    const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const retention = await getSystemErrorRetentionSettings();

    const [logs, unresolvedCount, activeLast24hCount, historicalLast24hCount, resolvedHistoryCount] = await Promise.all([
      SystemErrorLog.find(filter)
        .sort({ resolved: 1, lastOccurredAt: -1, occurredAt: -1, createdAt: -1 })
        .limit(limit)
        .lean(),
      SystemErrorLog.countDocuments({ level: 'error', resolved: false }),
      SystemErrorLog.countDocuments({ level: 'error', resolved: false, lastOccurredAt: { $gte: last24h } }),
      SystemErrorLog.countDocuments({ level: 'error', lastOccurredAt: { $gte: last24h } }),
      SystemErrorLog.countDocuments({ level: 'error', resolved: true }),
    ]);

    const totalOccurrences = logs.reduce((sum, log) => sum + Number(log.occurrenceCount || 1), 0);

    res.json({
      logs: logs.map(publicErrorLog),
      count: logs.length,
      totalOccurrences,
      includeResolved,
      unresolvedCount,
      activeLast24hCount,
      last24hCount: activeLast24hCount,
      historicalLast24hCount,
      resolvedHistoryCount,
      retention: {
        dedupe: 'one unresolved row per fingerprint',
        activeLimit: retention.activeLimit,
        resolvedLimit: retention.resolvedLimit,
        resolvedRetentionDays: retention.resolvedRetentionDays,
        pruneIntervalMs: retention.pruneIntervalMs,
        defaultListLimit: DEFAULT_LIMIT,
        maxListLimit: MAX_LIMIT,
      },
    });
  } catch (err) {
    console.error('❌ Failed to fetch system error logs:', err);
    res.status(500).json({ error: 'Failed to fetch system error logs.' });
  }
};

exports.markResolved = async (req, res) => {
  if (!canViewSystemErrors(req)) {
    return res.status(403).json({ error: 'System error logs are only available to Owner/Admin users.' });
  }

  try {
    const { id } = req.params;
    const resolvedBy = req.admin?.email || req.admin?.id || 'admin';
    const now = new Date();
    const updated = await SystemErrorLog.findByIdAndUpdate(
      id,
      { $set: { resolved: true, resolvedAt: now, resolvedBy } },
      { new: true },
    ).lean();
    await pruneSystemErrorHistory({ force: true });
    if (!updated) return res.status(404).json({ error: 'System error log not found.' });
    res.json({ success: true, log: publicErrorLog(updated) });
  } catch (err) {
    console.error('❌ Failed to mark system error resolved:', err);
    res.status(500).json({ error: 'Failed to update system error log.' });
  }
};

exports.markAllResolved = async (req, res) => {
  if (!canViewSystemErrors(req)) {
    return res.status(403).json({ error: 'System error logs are only available to Owner/Admin users.' });
  }

  try {
    const resolvedBy = req.admin?.email || req.admin?.id || 'admin';
    const now = new Date();
    const result = await SystemErrorLog.updateMany(
      { level: 'error', resolved: false },
      { $set: { resolved: true, resolvedAt: now, resolvedBy } },
    );
    await pruneSystemErrorHistory({ force: true });
    res.json({
      success: true,
      resolvedCount: result.modifiedCount || 0,
    });
  } catch (err) {
    console.error('❌ Failed to mark all system errors resolved:', err);
    res.status(500).json({ error: 'Failed to resolve system error logs.' });
  }
};
