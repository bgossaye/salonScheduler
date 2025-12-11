const mongoose = require('mongoose');
const { toCanonical } = require('../utils/canon');

const NotificationTemplateSchema = new mongoose.Schema({
  type: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    lowercase: true,
    set: toCanonical,           // ✅ normalize any incoming value
  },
  enabled: { type: Boolean, default: true },
  status: { type: String, default: 'scheduled' },
  smsTemplate: { type: String, default: '' },
  emailTemplate: { type: String, default: '' },
  placeholders: { type: [String], default: [] }
}, { timestamps: true });

module.exports =
  mongoose.models.NotificationTemplate
  || mongoose.model('NotificationTemplate', NotificationTemplateSchema, 'notification_templates');
