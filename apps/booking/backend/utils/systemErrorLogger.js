const crypto = require('crypto');
const mongoose = require('mongoose');
const SystemErrorLog = require('../models/systemerrorlog');
const { getRuntimeNumber } = require('./runtimeSettings');

const MAX_DETAIL_LENGTH = 3500;
const MAX_STACK_LENGTH = 3500;
const MAX_MESSAGE_LENGTH = 700;
const FALLBACK_ACTIVE_UNRESOLVED_ERRORS = Number(process.env.SYSTEM_ERROR_ACTIVE_LIMIT || 150);
const FALLBACK_RESOLVED_HISTORY_ERRORS = Number(process.env.SYSTEM_ERROR_RESOLVED_LIMIT || 40);
const FALLBACK_RESOLVED_RETENTION_DAYS = Number(process.env.SYSTEM_ERROR_RESOLVED_RETENTION_DAYS || 14);
const FALLBACK_PRUNE_INTERVAL_MS = Number(process.env.SYSTEM_ERROR_PRUNE_INTERVAL_MS || 10 * 60 * 1000);

let originalConsoleError = null;
let installed = false;
let pruneInFlight = false;
let lastPruneAt = 0;

function safePositiveNumber(value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(Math.floor(parsed), min), max);
}

async function getSystemErrorRetentionSettings() {
  const [activeLimitRaw, resolvedLimitRaw, retentionDaysRaw, pruneIntervalRaw] = await Promise.all([
    getRuntimeNumber('systemErrors.activeLimit', FALLBACK_ACTIVE_UNRESOLVED_ERRORS),
    getRuntimeNumber('systemErrors.resolvedLimit', FALLBACK_RESOLVED_HISTORY_ERRORS),
    getRuntimeNumber('systemErrors.resolvedRetentionDays', FALLBACK_RESOLVED_RETENTION_DAYS),
    getRuntimeNumber('systemErrors.pruneIntervalMs', FALLBACK_PRUNE_INTERVAL_MS),
  ]);

  return {
    activeLimit: safePositiveNumber(activeLimitRaw, FALLBACK_ACTIVE_UNRESOLVED_ERRORS, { min: 25, max: 1000 }),
    resolvedLimit: safePositiveNumber(resolvedLimitRaw, FALLBACK_RESOLVED_HISTORY_ERRORS, { min: 0, max: 1000 }),
    resolvedRetentionDays: safePositiveNumber(retentionDaysRaw, FALLBACK_RESOLVED_RETENTION_DAYS, { min: 1, max: 365 }),
    pruneIntervalMs: safePositiveNumber(pruneIntervalRaw, FALLBACK_PRUNE_INTERVAL_MS, { min: 60000, max: 24 * 60 * 60 * 1000 }),
  };
}

function truncate(value, maxLength) {
  const text = String(value || '');
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

function safeStringify(value) {
  if (value === undefined) return '';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return String(value);
  if (value instanceof Error) {
    return JSON.stringify({ name: value.name, message: value.message, stack: value.stack });
  }

  const seen = new WeakSet();
  try {
    return JSON.stringify(value, (key, item) => {
      if (typeof item === 'function') return `[Function ${item.name || 'anonymous'}]`;
      if (typeof item === 'bigint') return String(item);
      if (item && typeof item === 'object') {
        if (seen.has(item)) return '[Circular]';
        seen.add(item);
      }
      return item;
    });
  } catch (_) {
    try { return String(value); } catch (__) { return '[Unserializable value]'; }
  }
}

function extractError(args = []) {
  const error = args.find((item) => item instanceof Error);
  const rawText = args.map(safeStringify).filter(Boolean).join(' ');
  return {
    name: error?.name || '',
    message: truncate(error?.message || rawText || 'System error', MAX_MESSAGE_LENGTH),
    stack: truncate(error?.stack || '', MAX_STACK_LENGTH),
    details: truncate(rawText, MAX_DETAIL_LENGTH),
  };
}

function normalizeRoute(route = '') {
  return String(route || '')
    .split('?')[0]
    .replace(/[a-f0-9]{24}/gi, ':id')
    .replace(/\b\d{5,}\b/g, ':num')
    .slice(0, 240);
}

function fingerprintFor({ source, message, stack, route, method }) {
  const stackHead = String(stack || '').split('\n').slice(0, 4).join('\n');
  const base = `${source || ''}|${method || ''}|${normalizeRoute(route)}|${message || ''}|${stackHead}`;
  return crypto.createHash('sha1').update(base).digest('hex');
}


async function compactUnresolvedDuplicateErrors() {
  const groups = await SystemErrorLog.aggregate([
    { $match: { level: 'error', resolved: false, fingerprint: { $nin: ['', null] } } },
    { $sort: { lastOccurredAt: -1, occurredAt: -1, createdAt: -1 } },
    {
      $group: {
        _id: '$fingerprint',
        ids: { $push: '$_id' },
        totalOccurrences: { $sum: { $ifNull: ['$occurrenceCount', 1] } },
        firstOccurredAt: { $min: { $ifNull: ['$firstOccurredAt', '$occurredAt'] } },
        lastOccurredAt: { $max: { $ifNull: ['$lastOccurredAt', '$occurredAt'] } },
        count: { $sum: 1 },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $limit: 100 },
  ]);

  for (const group of groups) {
    const [keepId, ...deleteIds] = group.ids || [];
    if (!keepId || deleteIds.length === 0) continue;
    await SystemErrorLog.updateOne(
      { _id: keepId },
      {
        $set: {
          occurrenceCount: Math.max(Number(group.totalOccurrences || 1), 1),
          firstOccurredAt: group.firstOccurredAt || new Date(),
          lastOccurredAt: group.lastOccurredAt || new Date(),
        },
      },
    );
    await SystemErrorLog.deleteMany({ _id: { $in: deleteIds } });
  }
}

async function pruneSystemErrorHistory({ force = false } = {}) {
  try {
    if (mongoose.connection.readyState !== 1 || pruneInFlight) return;
    const now = Date.now();
    const retention = await getSystemErrorRetentionSettings();
    if (!force && now - lastPruneAt < retention.pruneIntervalMs) return;

    pruneInFlight = true;
    lastPruneAt = now;

    await SystemErrorLog.updateMany(
      { level: 'error', $or: [
        { lastOccurredAt: { $exists: false } },
        { firstOccurredAt: { $exists: false } },
        { occurrenceCount: { $exists: false } },
      ] },
      [
        {
          $set: {
            lastOccurredAt: { $ifNull: ['$lastOccurredAt', { $ifNull: ['$occurredAt', '$createdAt'] }] },
            firstOccurredAt: { $ifNull: ['$firstOccurredAt', { $ifNull: ['$occurredAt', '$createdAt'] }] },
            occurrenceCount: { $ifNull: ['$occurrenceCount', 1] },
          },
        },
      ],
    );

    await compactUnresolvedDuplicateErrors();

    const resolvedCutoff = new Date(now - retention.resolvedRetentionDays * 24 * 60 * 60 * 1000);
    await SystemErrorLog.deleteMany({
      level: 'error',
      resolved: true,
      resolvedAt: { $ne: null, $lt: resolvedCutoff },
    });

    const resolvedOverflow = await SystemErrorLog.find({ level: 'error', resolved: true })
      .sort({ resolvedAt: -1, lastOccurredAt: -1, occurredAt: -1 })
      .skip(Math.max(retention.resolvedLimit, 0))
      .select('_id')
      .lean();
    if (resolvedOverflow.length) {
      await SystemErrorLog.deleteMany({ _id: { $in: resolvedOverflow.map((item) => item._id) } });
    }

    const unresolvedOverflow = await SystemErrorLog.find({ level: 'error', resolved: false })
      .sort({ lastOccurredAt: -1, occurrenceCount: -1 })
      .skip(Math.max(retention.activeLimit, 25))
      .select('_id')
      .lean();
    if (unresolvedOverflow.length) {
      await SystemErrorLog.deleteMany({ _id: { $in: unresolvedOverflow.map((item) => item._id) } });
    }
  } catch (_) {
    // Never log from the logger itself; avoiding recursion is more important than surfacing logger failures.
  } finally {
    pruneInFlight = false;
  }
}

async function recordSystemError({ source = 'console.error', args = [], req = null } = {}) {
  try {
    if (mongoose.connection.readyState !== 1) return;

    const extracted = extractError(args);
    const now = new Date();
    const route = normalizeRoute(req?.originalUrl || req?.url || '');
    const method = req?.method || '';
    const doc = {
      level: 'error',
      source,
      ...extracted,
      route,
      method,
      adminEmail: req?.admin?.email || '',
      adminId: req?.admin?.id ? String(req.admin.id) : '',
    };
    doc.fingerprint = fingerprintFor(doc);

    await SystemErrorLog.findOneAndUpdate(
      { level: 'error', resolved: false, fingerprint: doc.fingerprint },
      {
        $setOnInsert: {
          level: 'error',
          source: doc.source,
          name: doc.name,
          firstOccurredAt: now,
          occurredAt: now,
          createdAt: now,
        },
        $set: {
          message: doc.message,
          stack: doc.stack,
          details: doc.details,
          route: doc.route,
          method: doc.method,
          adminEmail: doc.adminEmail,
          adminId: doc.adminId,
          fingerprint: doc.fingerprint,
          lastOccurredAt: now,
          updatedAt: now,
        },
        $inc: { occurrenceCount: 1 },
      },
      { upsert: true, new: true, setDefaultsOnInsert: false },
    );

    pruneSystemErrorHistory();
  } catch (_) {
    // Never log from the logger itself; avoiding recursion is more important than surfacing logger failures.
  }
}

function installSystemErrorCapture() {
  if (installed) return;
  installed = true;
  originalConsoleError = console.error.bind(console);

  console.error = (...args) => {
    originalConsoleError(...args);
    recordSystemError({ source: 'console.error', args });
  };

  process.on('unhandledRejection', (reason) => {
    const args = reason instanceof Error ? [reason] : ['Unhandled promise rejection', reason];
    recordSystemError({ source: 'process.unhandledRejection', args });
  });

  process.on('uncaughtExceptionMonitor', (error, origin) => {
    recordSystemError({ source: 'process.uncaughtExceptionMonitor', args: [origin || 'uncaughtException', error] });
  });
}

module.exports = {
  getSystemErrorRetentionSettings,
  installSystemErrorCapture,
  pruneSystemErrorHistory,
  recordSystemError,
};
