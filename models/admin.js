const mongoose = require('mongoose');

const adminSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, trim: true, lowercase: true },
  username: { type: String, default: '', trim: true, lowercase: true },
  password: { type: String, required: true },
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },
  roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffRole', default: null },
  roleKey: { type: String, default: 'admin' },
  status: { type: String, enum: ['invited', 'active', 'disabled'], default: 'active', index: true },
  mustChangePassword: { type: Boolean, default: false },
  inviteTokenHash: { type: String, default: '' },
  inviteExpiresAt: { type: Date, default: null },
  inviteSentAt: { type: Date, default: null },
  passwordResetTokenHash: { type: String, default: '' },
  passwordResetExpiresAt: { type: Date, default: null },
  passwordResetSentAt: { type: Date, default: null },
  credentialLastDeliveryStatus: { type: String, default: '' },
  credentialLastDeliveryChannel: { type: String, default: '' },
  credentialLastDeliveryError: { type: String, default: '' },
  lastLoginAt: { type: Date, default: null },
}, { timestamps: true });

adminSchema.pre('validate', function normalizeAdmin(next) {
  this.email = String(this.email || '').trim().toLowerCase();
  this.username = String(this.username || this.email || '').trim().toLowerCase();
  this.roleKey = String(this.roleKey || 'admin').trim().toLowerCase();
  next();
});

adminSchema.index({ username: 1 }, { unique: true, sparse: true, partialFilterExpression: { username: { $type: 'string', $ne: '' } } });

module.exports = mongoose.models.Admin || mongoose.model('Admin', adminSchema);
