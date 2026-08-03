const mongoose = require('mongoose');

const scheduledReminderSchema = new mongoose.Schema({
  channel: { type: String, enum: ['sms', 'email'], default: 'sms' },
  templateType: { type: String, default: 'announcement', trim: true, lowercase: true },
  smsTemplate: { type: String, default: '' },
  emailTemplate: { type: String, default: '' },
  scheduledAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ['scheduled', 'sent', 'canceled', 'failed'], default: 'scheduled', index: true },
  enabled: { type: Boolean, default: true },
  createdByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  createdByName: { type: String, default: '' },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.models.ScheduledReminder || mongoose.model('ScheduledReminder', scheduledReminderSchema, 'scheduled_reminders');
