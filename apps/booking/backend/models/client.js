const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String, default: null, trim: true },
  email: { type: String, unique: true, sparse: true},

  profileType: {
    type: String,
    enum: ['independent', 'minor_dependent', 'adult_dependent', 'admin_no_phone'],
    default: 'independent',
    index: true,
  },
  guardianClientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },
  relationshipToGuardian: { type: String, default: '' },
  guardianAttestedAt: { type: Date, default: null },
  createdByType: { type: String, enum: ['client', 'admin', 'staff', 'system'], default: 'system' },
  createdById: { type: mongoose.Schema.Types.ObjectId, default: null },
  phoneVerified: { type: Boolean, default: false },
  dob: { type: Date },
  nickname: { type: String, default: '' }, // 🔒 Admin-only field

  clientType: { type: String, enum: ['full', 'event_guest'], default: 'full', index: true },
  isEventGuest: { type: Boolean, default: false, index: true },
  eventGuestMeta: {
    source: { type: String, default: '' },
    eventLabel: { type: String, default: '' },
    eventRole: { type: String, default: '' },
    createdFromGroupBookingId: { type: String, default: '' },
    convertedToFullClientAt: { type: Date, default: null },
  },

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

  welcomeOffer: {
    code: { type: String, default: '' },
    amount: { type: Number, default: 0 },
    status: { type: String, enum: ['available', 'redeemed', 'expired', 'void'], default: 'available' },
    source: { type: String, default: '' },
    grantedAt: { type: Date, default: null },
    redeemedAt: { type: Date, default: null },
    appointmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Appointment', default: null },
  },

  profilePhoto: String,

  assignedStylistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },
  defaultStylistAssignedBy: { type: String, default: '' },
  defaultStylistAssignedAt: { type: Date, default: null },
  preferredStylistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },
  lastStylistId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },

  // Household/family links used by client-side family booking.
  familyLinks: [{
    clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
    relationship: { type: String, default: 'family' },
    status: { type: String, enum: ['active', 'pending', 'declined', 'blocked'], default: 'active', index: true },
    direction: { type: String, enum: ['outgoing', 'incoming', 'reciprocal'], default: 'reciprocal' },
    invitedByClientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
    invitationFirstName: { type: String, default: '' },
    invitationLastName: { type: String, default: '' },
    permissions: {
      canBook: { type: Boolean, default: true },
      canViewUpcoming: { type: Boolean, default: true },
      canCancel: { type: Boolean, default: false },
      canEditProfile: { type: Boolean, default: false },
    },
    addedAt: { type: Date, default: Date.now },
    respondedAt: { type: Date, default: null },
    reportedAt: { type: Date, default: null },
    unblockedAt: { type: Date, default: null },
    unblockedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
    unblockReason: { type: String, default: '', trim: true },
    invitationTokenHash: { type: String, default: '' },
    invitationExpiresAt: { type: Date, default: null },
    invitationSentAt: { type: Date, default: null },
  }],
  managedByClientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null, index: true },

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

clientSchema.index(
  { phone: 1 },
  { unique: true, partialFilterExpression: { phone: { $type: 'string' } } }
);

module.exports = mongoose.models.Client || mongoose.model('Client', clientSchema);
