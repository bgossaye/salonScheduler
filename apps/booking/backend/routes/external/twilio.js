// routes/external/twilio.js
const twilio = require('twilio');
const express = require('express');
const router = express.Router();
const StatusLog = require('../../models/statusLog');

// Twilio Status Callback Handler
router.post(
  '/status-callback',
  twilio.webhook({ validate: false }), // ⬅️ middleware goes here
  async (req, res) => {
    try {
      const {
        MessageSid,
        MessageStatus,
        To,
        From,
        ErrorCode,
        ErrorMessage,
        SmsStatus,
        Timestamp
      } = req.body;

      console.log(`📡 Twilio status update for ${To} → ${MessageStatus || SmsStatus}`);

      // Log to MongoDB
      const log = new StatusLog({
        messageSid: MessageSid,
        to: To,
        from: From,
        status: MessageStatus || SmsStatus,
        errorCode: ErrorCode,
        errorMessage: ErrorMessage,
        timestamp: new Date(Timestamp || Date.now())
      });

      await log.save();
      res.sendStatus(200);
    } catch (err) {
      console.error('❌ Twilio status-callback error:', err);
      res.sendStatus(500);
    }
  }
);

module.exports = router;
