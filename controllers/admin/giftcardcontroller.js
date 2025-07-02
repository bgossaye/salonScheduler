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

    const qrImage = await QRCode.toDataURL(code); // use this base64 in img src

    try {
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
        console.log(`✅ Email sent to ${email}`);
    } catch (err) {
        console.error('❌ Failed to send email:', err);
        throw err;
    }
};