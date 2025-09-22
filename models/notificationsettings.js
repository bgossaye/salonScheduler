// models/notificationsettings.js (no schema change needed)
const mongoose = require('mongoose');
const NotificationSettingsSchema = new mongoose.Schema({
  masterNotificationsEnabled: { type: Boolean, default: true },
  pending: { enabled: { type: Boolean, default: true }, smsTemplate: String, emailTemplate: String },
  confirmation: { enabled: { type: Boolean, default: true }, smsTemplate: String, emailTemplate: String },
  reminder: { enabled: { type: Boolean, default: true }, smsTemplate: String, emailTemplate: String },
  thankyou: { enabled: { type: Boolean, default: true }, smsTemplate: String, emailTemplate: String },
  promotion: { enabled: { type: Boolean, default: true }, smsTemplate: String, emailTemplate: String },
  announcement: { enabled: { type: Boolean, default: true }, smsTemplate: String, emailTemplate: String },
  holiday: { enabled: { type: Boolean, default: true }, smsTemplate: String, emailTemplate: String },
  cancelation: { enabled: { type: Boolean, default: true }, smsTemplate: String, emailTemplate: String },
  noshow: { enabled: { type: Boolean, default: true }, smsTemplate: String, emailTemplate: String },
  scheduledAnnouncements: [{
    type: { type: String, enum: ['announcement', 'promotion'], required: true },
    scheduledAt: { type: Date, required: true },
    smsMessage: String,
    emailMessage: String,
  }]
});

// Add this static
NotificationSettingsSchema.statics.getSingleton = function() {
  const id = 'notificationsettings_singleton';
  return this.findOneAndUpdate(
    { _id: id },
    { $setOnInsert: { _id: id } },
    { new: true, upsert: true, setDefaultsOnInsert: true }
  );
};

module.exports = mongoose.model('NotificationSettings', NotificationSettingsSchema);
