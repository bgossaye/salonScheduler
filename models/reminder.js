const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  clientName: String,
  clientId: mongoose.Schema.Types.ObjectId,
  type: String, // sms or email
  templateType: { type: String }, // confirmation, reminder, thankyou, general
  status: { type: String, default: 'scheduled' },
  scheduledAt: Date,
  smsTemplate: String,
  emailTemplate: String,
  enabled: { type: Boolean, default: true },
  placeholders: [String], // e.g., ['clientName', 'date', 'time']
}, { timestamps: true });

module.exports = mongoose.model('Reminder', reminderSchema);
