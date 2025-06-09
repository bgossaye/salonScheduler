const mongoose = require('mongoose');

const clientSchema = new mongoose.Schema({
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String, required: true, unique: true },
  email: { type: String, unique: true, sparse: true},
  dob: { type: Date },
  visitFrequency: { type: String },

  contactPreferences: {
    method: { type: String, enum: ['sms', 'email', 'phone'], default: 'sms' },
    optInPromotions: { type: Boolean, default: false },
    smsDisabled: { type: Boolean, default: false },
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
  }
});

module.exports = mongoose.models.Client || mongoose.model('Client', clientSchema);
