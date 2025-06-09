// models/settings.js
const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
  smsEnabled: { type: Boolean, default: true },
  emailEnabled: { type: Boolean, default: true }
});

module.exports = mongoose.model('Settings', settingsSchema);
