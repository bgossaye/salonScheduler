const GiftCard = require('../../models/giftcard');
const QRCode = require('qrcode');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const ADMIN_PASSWORD = process.env.ADMIN_GIFT_CARD_PASSWORD || 'changeme';

// ✅ Create Gift Card (Digital or Physical)
exports.createGiftCard = async (req, res) => {
  try {
    const { code, type, amount, pin, email, adminPassword } = req.body;

    if (!['digital', 'physical'].includes(type)) {
      return res.status(400).json({ message: 'Invalid card type' });
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount < 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    if (!code || code.length !== 28) {
      return res.status(400).json({ message: 'Code must be exactly 28 characters' });
    }

    if (type === 'digital' && (!email || !email.includes('@'))) {
      return res.status(400).json({ message: 'Valid email is required for digital cards' });
    }

    const giftCardData = {
      code,
      type,
      amount: numericAmount,
      remainingBalance: numericAmount,
      pin: pin || '',
      email: email || '',
      createdBy: 'admin',
    };

    const newCard = new GiftCard(giftCardData);

    try {
      await newCard.save();
      return res.status(201).json({ message: 'Gift card created', giftCard: newCard });
    } catch (saveErr) {
      console.error('GiftCard save error:', saveErr.message, saveErr);
      return res.status(500).json({ message: 'Failed to save gift card', error: saveErr.message });
    }
  } catch (err) {
    console.error('Create gift card error:', err.message, err.stack);
    return res.status(500).json({ message: 'Server error', error: err.message });
  }
};

// ✅ Scan Gift Card to Validate and Fetch Info
exports.scanGiftCard = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code || code.length !== 28) {
      return res.status(400).json({ message: 'Invalid or missing gift card code' });
    }

    const card = await GiftCard.findOne({ code });
    if (!card) {
      return res.status(404).json({ message: 'Gift card not found' });
    }

    res.json({
      message: 'Gift card found',
      giftCard: {
        type: card.type,
        amount: card.amount,
        remainingBalance: card.remainingBalance,
        requiresPin: !!card.pin
      }
    });
  } catch (error) {
    console.error('Scan error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ✅ Redeem Gift Card
exports.redeemGiftCard = async (req, res) => {
  try {
    const { code, redeemAmount, pin } = req.body;
    const card = await GiftCard.findOne({ code });
    if (!card) return res.status(404).json({ message: 'Card not found' });

    if (card.pin && pin !== card.pin) {
      return res.status(403).json({ message: 'Incorrect PIN' });
    }

    const numericAmount = Number(redeemAmount);
    if (isNaN(numericAmount) || numericAmount <= 0 || numericAmount > card.remainingBalance) {
      return res.status(400).json({ message: 'Invalid redeem amount' });
    }

    card.redeemedAt.push({ date: new Date(), amount: numericAmount });
    card.remainingBalance -= numericAmount;
    await card.save();

    res.json({ message: 'Card redeemed', remaining: card.remainingBalance });
  } catch (error) {
    console.error('Redeem error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

exports.getGiftCardByCode = async (req, res) => {
  try {
    const { code } = req.params;

    if (!code || code.length !== 28) {
      return res.status(400).json({ message: 'Invalid gift card code' });
    }

    const card = await GiftCard.findOne({ code });
    if (!card) {
      return res.status(404).json({ message: 'Gift card not found' });
    }

    res.json({ card });
  } catch (err) {
    console.error('Lookup error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};


// ✅ Get All Gift Cards
exports.getAllGiftCards = async (req, res) => {
  try {
    const cards = await GiftCard.find().sort({ createdAt: -1 });
    res.json(cards);
  } catch (error) {
    res.status(500).json({ message: 'Server error' });
  }
};
