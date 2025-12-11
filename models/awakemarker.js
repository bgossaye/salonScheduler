// models/AwakeMarker.js
const mongoose = require('mongoose');
const AwakeMarkerSchema = new mongoose.Schema({
  _id: { type: String, default: 'render-awake', immutable: true },
  lastWakeAt: { type: Date, default: Date.now },
  lastTouchAt: { type: Date, default: Date.now },
  by: { type: String, default: 'server' }
}, { versionKey: false, minimize: true });

module.exports = mongoose.model('AwakeMarker', AwakeMarkerSchema);
