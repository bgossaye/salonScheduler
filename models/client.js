const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  fullName: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, unique: true, sparse: true},
  dob: { type: Date },

  contactPreferences: {
    method: { type: String, enum: ['sms', 'email', 'phone'], default: 'sms' },
    optInPromotions: { type: Boolean, default: false }
  },

  appointmentHistory: [
    {
      service: String,
      date: Date,
      stylist: String,
      duration: String,
      status: { type: String, enum: ['completed', 'no-show', 'cancelled'], default: 'completed' }
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
  }
});

module.exports = mongoose.models.Client || mongoose.model('Client', clientSchema);
