const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, unique: true, sparse: true},
  dob: { type: Date },
  nickname: { type: String, default: '' }, // 🔒 Admin-only field

  visitFrequency: { type: Number, default: 6 },

  contactPreferences: {
    method: { type: String, enum: ['sms', 'email', 'phone'], default: 'sms' },
    optInPromotions: { type: Boolean, default: true },
    emailDisabled: { type: Boolean, default: false }
  },

  smsHistory: [
    {
      date: { type: Date, default: Date.now },
      content: { type: String, required: true }
    }
  ],



  appointmentHistory: [
    {
      service: String,
      date: Date,
      stylist: String,
      duration: String,
      status: { type: String, enum: ['booked', 'completed', 'noshow', 'cancelled'], default: 'booked' }
    }
  ],

  servicePreferences: {
    stylist: String,
    services: [String],
    preferredTimes: [String],
    productPreferences: [String]
  },

  notes: {
    allergies: String,
    hairType: String,
    colorHistory: String,
    inspirationImage: String,
    specialInstructions: String
  },

  paymentInfo: {
    loyaltyPoints: { type: Number, default: 0 },
    method: String,
    giftCards: [String]
  },

  profilePhoto: String,

  visitStats: {
    averageFrequencyWeeks: Number,
    lastVisit: Date,
    nextAppointment: Date
  },
  // Authentication
  pinHash: { type: String, select: false },
  pinSetAt: { type: Date },
  pinIsDefault: { type: Boolean, default: false },
  failedPinAttempts: { type: Number, default: 0 },
  pinLockedUntil: { type: Date },
  // OTP flow (phone verification / PIN reset)
  otpHash: { type: String, select: false },
  otpExpiresAt: { type: Date },
  otpIssuedAt: { type: Date },
  otpVerifyAttempts: {
    type: Number,
    default: 0,
    set: v => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }
  },
  otpRequestCount: {
    type: Number,
    default: 0,
    set: v => {
      const n = Number(v);
      return Number.isFinite(n) && n >= 0 ? n : 0;
    }
  },
  otpLastRequestedAt: { type: Date },
// Profile verification / upgrade
requiresNamePinUpgrade: { type: Boolean, default: true },
nameVerifiedAt: { type: Date }

});

module.exports = mongoose.models.Client || mongoose.model('Client', clientSchema);
