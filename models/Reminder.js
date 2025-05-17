const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  clientName: String,
  clientId: mongoose.Schema.Types.ObjectId,
  type: String, // e.g., "email", "sms"
  status: { type: String, default: 'scheduled' }, // e.g., "scheduled", "sent", "failed"
  scheduledAt: Date,
  smsTemplate: String,
  emailTemplate: String,
  enabled: { type: Boolean, default: true }
}, { timestamps: true });

module.exports = mongoose.model('Reminder', reminderSchema);