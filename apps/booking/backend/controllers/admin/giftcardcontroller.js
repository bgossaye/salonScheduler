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
      return res
        .status(400)
        .json({ message: 'Invalid card type. Must be digital or physical.' });
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount < 0) {
      return res
        .status(400)
        .json({ message: 'Amount must be a positive number.' });
    }

    if (!code || code.length !== 28) {
      return res
        .status(400)
        .json({ message: 'Code must be exactly 28 characters long.' });
    }

    if (type === 'digital' && (!email || !email.includes('@'))) {
      return res
        .status(400)
        .json({ message: 'A valid email is required for digital gift cards.' });
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
      return res
        .status(201)
        .json({ message: 'Gift card created successfully.', giftCard: newCard });
    } catch (saveErr) {
      console.error('GiftCard save error:', saveErr.message, saveErr);

      // 🔍 Handle duplicate code nicely
      if (
        saveErr.code === 11000 ||
        (typeof saveErr.message === 'string' &&
          saveErr.message.toLowerCase().includes('duplicate key'))
      ) {
        return res.status(409).json({
          message:
            'This gift card code is already in the system. ' +
            'Try redeeming that card or use a different code.',
        });
      }

      return res.status(500).json({
        message:
          'Could not save the gift card. Please try again or contact support.',
        error: saveErr.message,
      });
    }
  } catch (err) {
    console.error('Create gift card error:', err.message, err.stack);
    return res
      .status(500)
      .json({ message: 'Server error while creating gift card.', error: err.message });
  }
};


// ✅ Scan Gift Card to Validate and Fetch Info
exports.scanGiftCard = async (req, res) => {
  try {
    const { code } = req.body;

    if (!code || code.length !== 28) {
      return res.status(400).json({
        message:
          'Invalid or missing gift card code. ' +
          'The code must be exactly 28 characters long.',
      });
    }

    const card = await GiftCard.findOne({ code });
    if (!card) {
      return res.status(404).json({
        message:
          'This gift card is not in the system. ' +
          'Please check the code or load a new gift card.',
      });
    }

    return res.json({
      message: 'Gift card found.',
      giftCard: {
        type: card.type,
        amount: card.amount,
        remainingBalance: card.remainingBalance,
        requiresPin: !!card.pin,
      },
    });
  } catch (error) {
    console.error('Scan error:', error);
    return res
      .status(500)
      .json({ message: 'Server error while scanning gift card.' });
  }
};

// ✅ Redeem Gift Card
exports.redeemGiftCard = async (req, res) => {
  try {
    const { code, redeemAmount, pin } = req.body;

    const card = await GiftCard.findOne({ code });
    if (!card) {
      return res.status(404).json({
        message:
          'This gift card is not in the system. ' +
          'Please verify the code or load the gift card before redeeming.',
      });
    }

    // PIN check (if the card requires one)
    if (card.pin && pin !== card.pin) {
      return res.status(403).json({
        message: 'Incorrect PIN. Please double-check and try again.',
      });
    }

    const numericAmount = Number(redeemAmount);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return res.status(400).json({
        message:
          'Redeem amount must be a positive number greater than zero.',
      });
    }

    if (numericAmount > card.remainingBalance) {
      return res.status(400).json({
        message:
          'Redeem amount is greater than the card balance. ' +
          'You can only redeem up to the remaining balance.',
      });
    }

    // Record redemption and adjust balance
    card.redeemedAt.push({ date: new Date(), amount: numericAmount });
    card.remainingBalance -= numericAmount;

    // ✅ If balance now 0, delete card instead of saving it
    if (card.remainingBalance <= 0) {
      await GiftCard.deleteOne({ _id: card._id });
      return res.json({
        message: 'Card fully redeemed and removed from the system.',
        remaining: 0,
        deleted: true,
      });
    } else {
      await card.save();
      return res.json({
        message: 'Gift card redeemed successfully.',
        remaining: card.remainingBalance,
        deleted: false,
      });
    }
  } catch (error) {
    console.error('Redeem error:', error);
    return res
      .status(500)
      .json({ message: 'Server error while redeeming gift card.' });
  }
};


exports.getGiftCardByCode = async (req, res) => {
  try {
    const { code } = req.params;

    if (!code || code.length !== 28) {
      return res.status(400).json({
        message:
          'Invalid gift card code. It must be exactly 28 characters long.',
      });
    }

    const card = await GiftCard.findOne({ code });
    if (!card) {
      return res.status(404).json({
        message:
          'Gift card not found in the system. ' +
          'Check the code or load a new card before redeeming.',
      });
    }

    return res.json({ card });
  } catch (err) {
    console.error('Lookup error:', err);
    return res
      .status(500)
      .json({ message: 'Server error while looking up gift card.' });
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

exports.updateGiftCard = async (req, res) => {
    try {
        const { code } = req.params;
        const { amount, pin } = req.body;

        const card = await GiftCard.findOne({ code });
        if (!card) {
            return res.status(404).json({ message: 'Gift card not found' });
        }

        if (amount !== undefined) card.amount = Number(amount);
        if (pin !== undefined) card.pin = pin;

        card.remainingBalance = card.amount; // Optionally reset balance
        await card.save();

        res.json({ message: 'Gift card updated', card });
    } catch (err) {
        console.error('Update error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.deleteGiftCard = async (req, res) => {
    try {
        const { code } = req.params;
        const result = await GiftCard.findOneAndDelete({ code });

        if (!result) {
            return res.status(404).json({ message: 'Gift card not found' });
        }

        res.json({ message: 'Gift card deleted' });
    } catch (err) {
        console.error('Delete error:', err);
        res.status(500).json({ message: 'Server error' });
    }
};

exports.sendGiftCardEmail = async (req, res) => {
    const { email, code, amount } = req.body;

    try {
        const qrImage = await QRCode.toDataURL(code); // use this base64 in img src

        if (!qrImage || !qrImage.startsWith('data:image/png;base64,')) {
            throw new Error('Invalid QR image data.');
        }

        const qrBase64 = qrImage.replace(/^data:image\/png;base64,/, '');

        const transporter = nodemailer.createTransport({
            service: 'gmail',
            auth: {
                user: process.env.EMAIL_USER,
                pass: process.env.EMAIL_PASS,
            }
        });

        const mailOptions = {
            from: `"Rakie Salon" <${process.env.EMAIL_USER}>`,
            to: email,
            subject: '🎁 Your Rakie Salon Gift Card',
            html: `
        <div style="font-family: Arial, sans-serif; text-align: center; padding: 20px; background-color: #fdfdfd; color: #333;">
          <img src="cid:rakielogo" alt="Rakie Salon Logo" style="height: 80px; margin-bottom: 20px;" />
          <h2 style="color: #d16b86;">🎁 You’ve received a Rakie Salon Gift Card!</h2>
          <p><strong>Value:</strong> <span style="color: #28a745;">$${amount}</span></p>
          <p><strong>Code (last 6 digits):</strong> <code style="font-size: 1.2em;">${code.slice(-6)}</code></p>
          <p>Scan the QR code below at the salon to redeem:</p>
          <img src="cid:qrcode" alt="QR Code" style="height: 150px; border: 1px solid #ccc; padding: 5px; background-color: white;" />
          <h3 style="margin-top: 30px; color: #444;">How to Redeem:</h3>
          <p>
  Visit <strong><a href="https://g.co/kgs/zLahGMh" target="_blank" style="color: #007bff; text-decoration: none;">Rakie Salon</a></strong> at <strong>4051 US-78 Suite E105, Lilburn, GA 30047</strong><br/>
  Show this email or scan the QR code at checkout<br/>
  Enjoy your service!
</p>

          <p style="color: #aaa; font-size: 0.9em;">Thank you for choosing Rakie Salon!</p>
        </div>
      `,
            attachments: [
                {
                    filename: 'TheRSlogo.png',
                    path: path.join(__dirname, '../../public/TheRSlogo.png'),
                    cid: 'rakielogo'
                },
                {
                    filename: 'qrcode.png',
                    content: Buffer.from(qrBase64, 'base64'),
                    cid: 'qrcode'
                }
            ]
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Giftcard email sent to ${email}`);
        return res.status(200).json({ message: 'Email sent successfully' });

    } catch (err) {
        console.error('❌ Failed to send email:', err);
        throw err;
    }
};