const mongoose = require('mongoose');

const OtpSchema = new mongoose.Schema(
  {
    phone: { type: String, required: true, index: true }, // store digits-only
    purpose: { type: String, enum: ['pin_set', 'login', 'verify'], default: 'pin_set' },
    codeHash: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true }, // TTL field
  },
  { timestamps: true }
);

// expire automatically at expiresAt
OtpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
// one active code per phone/purpose
OtpSchema.index({ phone: 1, purpose: 1 }, { unique: true });

module.exports = mongoose.model('Otp', OtpSchema);
