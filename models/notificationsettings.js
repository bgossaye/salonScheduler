const mongoose = require('mongoose');

const NotificationSettingsSchema = new mongoose.Schema({
  masterNotificationsEnabled: { type: Boolean, default: true },

  confirmation: {
    enabled: { type: Boolean, default: true },
    smsTemplate: String,
    emailTemplate: String,
  },
  reminder: {
    enabled: { type: Boolean, default: true },
    smsTemplate: String,
    emailTemplate: String,
  },
  thankyou: {
    enabled: { type: Boolean, default: true },
    smsTemplate: String,
    emailTemplate: String,
  },
  promotion: {
    enabled: { type: Boolean, default: false },
    smsTemplate: String,
    emailTemplate: String,
  },
  announcement: {
    enabled: { type: Boolean, default: false },
    smsTemplate: String,
    emailTemplate: String,
  },
  holiday: {
    enabled: { type: Boolean, default: false },
    smsTemplate: String,
    emailTemplate: String,
  },
  cancelation: {
    enabled: { type: Boolean, default: true },
    smsTemplate: String,
    emailTemplate: String,
  },
  noshow: {
    enabled: { type: Boolean, default: true },
    smsTemplate: String,
    emailTemplate: String,
  },

  // Optional: for scheduling announcements
  scheduledAnnouncements: [{
    type: { type: String, enum: ['announcement', 'promotion'], required: true },
    scheduledAt: { type: Date, required: true },
    smsMessage: String,
    emailMessage: String,
  }]
});

module.exports = mongoose.model('NotificationSettings', NotificationSettingsSchema);
