const mongoose = require('mongoose');

const giftCardSchema = new mongoose.Schema({
  code: {
    type: String,
    required: true,
    unique: true,
    length: 28,
  },
  type: {
    type: String,
    enum: ['digital', 'physical'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
    min: 0,
  },
  remainingBalance: {
    type: Number,
    required: true,
    default: function () {
      return this.amount;
    },
  },
  email: {
    type: String,
  },
  pin: {
    type: String,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  redeemedAt: [
    {
      date: Date,
      amount: Number,
    },
  ],
  expiresAt: {
    type: Date,
  },
  createdBy: {
    type: String, // Admin identifier
    required: true,
  },
});

module.exports = mongoose.model('GiftCard', giftCardSchema);
