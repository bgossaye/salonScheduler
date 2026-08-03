const mongoose = require('mongoose');

const adminNotificationSchema = new mongoose.Schema({
  type: { type: String, required: true, index: true },
  severity: { type: String, enum: ['info', 'warning', 'danger', 'success'], default: 'info', index: true },
  title: { type: String, required: true, trim: true },
  message: { type: String, default: '', trim: true },
  actorAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  actorName: { type: String, default: '', trim: true },
  actorEmail: { type: String, default: '', trim: true, lowercase: true },
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
  fromWorkerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },
  toWorkerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },
  status: { type: String, enum: ['unread', 'read', 'dismissed'], default: 'unread', index: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
  readAt: { type: Date, default: null },
  dismissedAt: { type: Date, default: null },
}, { timestamps: true });

adminNotificationSchema.index({ status: 1, createdAt: -1 });
adminNotificationSchema.index({ type: 1, clientId: 1, toWorkerId: 1, status: 1 });

module.exports = mongoose.models.AdminNotification || mongoose.model('AdminNotification', adminNotificationSchema);
