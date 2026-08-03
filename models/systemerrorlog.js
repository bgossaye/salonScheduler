const mongoose = require('mongoose');

const systemErrorLogSchema = new mongoose.Schema({
  level: { type: String, default: 'error', enum: ['error'], index: true },
  source: { type: String, default: 'console.error', index: true },
  message: { type: String, default: '', index: true },
  name: { type: String, default: '' },
  stack: { type: String, default: '' },
  details: { type: String, default: '' },
  route: { type: String, default: '', index: true },
  method: { type: String, default: '' },
  adminEmail: { type: String, default: '' },
  adminId: { type: String, default: '' },
  fingerprint: { type: String, default: '', index: true },

  // Retention / dedupe metadata:
  // - One unresolved document is kept per fingerprint.
  // - Repeated occurrences update these counters/timestamps instead of creating new rows.
  occurrenceCount: { type: Number, default: 1, min: 1 },
  firstOccurredAt: { type: Date, default: Date.now, index: true },
  lastOccurredAt: { type: Date, default: Date.now, index: true },

  resolved: { type: Boolean, default: false, index: true },
  resolvedAt: { type: Date, default: null, index: true },
  resolvedBy: { type: String, default: '' },
  occurredAt: { type: Date, default: Date.now, index: true },
}, { timestamps: true });

systemErrorLogSchema.index({ level: 1, resolved: 1, lastOccurredAt: -1 });
systemErrorLogSchema.index({ fingerprint: 1, resolved: 1, lastOccurredAt: -1 });
systemErrorLogSchema.index({ resolved: 1, resolvedAt: -1 });

module.exports = mongoose.models.SystemErrorLog || mongoose.model('SystemErrorLog', systemErrorLogSchema);
