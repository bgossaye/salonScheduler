// models/statusLog.js
const mongoose = require('mongoose');

const statusLogSchema = new mongoose.Schema({
  messageSid: { type: String, required: true },
  to: { type: String, required: true },
  from: { type: String, required: true },
  status: { type: String, required: true },
  errorCode: { type: String },
  errorMessage: { type: String },
  timestamp: { type: Date, default: Date.now }
});

module.exports = mongoose.model('StatusLog', statusLogSchema);
