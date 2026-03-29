const mongoose = require('mongoose');

const OtpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true }, // digits-only 10-digit US phone
    purpose: {
      type: String,
      enum: ['signup', 'reset', 'login', 'verify', 'pin_set'],
      default: 'reset',
      index: true,
    },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    verifiedAt: { type: Date, default: null },
    expiresAt: { type: Date, required: true }, // TTL field
  },
  { timestamps: true }
);

OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
OtpSchema.index({ phone: 1, purpose: 1 }, { unique: true });

module.exports = mongoose.models.Otp || mongoose.model('Otp', OtpSchema);
