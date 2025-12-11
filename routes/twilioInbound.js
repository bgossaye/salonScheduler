// apps/booking/backend/routes/twilioInbound.js
const express = require('express');
const router = express.Router();
const twilio = require('twilio');
const { MessagingResponse } = twilio.twiml;
const Client = require('../models/client');

// optional: tighten webhook validation in prod
const twilioMiddleware = twilio.webhook({
  validate: true,              // verify X-Twilio-Signature
  protocol: 'https',
  host: process.env.PUBLIC_HOSTNAME || undefined, // e.g., rakie-backend.onrender.com
});

function normalizePhone(usPhone) {
  // your normalizeUSPhone() if you already have it—else basic:
  const digits = (usPhone || '').replace(/\D/g, '');
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return `+${digits}`;
}

function parseKeyword(text) {
  const t = (text || '').trim().toUpperCase();

  // Accept common opt-out synonyms per carrier rules
  // STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT
  if (/\b(STOP|STOPALL|UNSUBSCRIBE|CANCEL|END|QUIT)\b/.test(t)) return 'STOP';
  // START / UNSTOP / YES to re-subscribe
  if (/\b(START|UNSTOP|YES)\b/.test(t)) return 'START';
  if (/\b(HELP)\b/.test(t)) return 'HELP';
  return null;
}

async function setOptIn(phoneE164, value) {
  // Flip every known spot to be safe with legacy docs
  const doc = await Client.findOne({ phone: phoneE164 }).exec();
  if (!doc) return { updated: false, reason: 'not_found' };

  if (!doc.contactPreferences) doc.contactPreferences = {};
  if (!doc.marketing) doc.marketing = {};

  doc.optInPromotions = !!value;
  doc.contactPreferences.optInPromotions = !!value;
  doc.marketing.optInPromotions = !!value;

  // Optional: also set a hard “do not text” switch if you keep one
  if (value === false) doc.smsDisabled = true; // (leave as-is if you don’t want this)

  await doc.save({ validateBeforeSave: false });
  return { updated: true, clientId: String(doc._id) };
}

router.post('/inbound', twilioMiddleware, express.urlencoded({ extended: false }), async (req, res) => {
  const twiml = new MessagingResponse();

  try {
    const from = normalizePhone(req.body.From);
    const body = req.body.Body || '';
    const keyword = parseKeyword(body);

    if (!keyword) {
      // Ignore non-keyword messages (or route to your “2-way chat”, if any)
      // You can reply nothing (200 OK empty) or a gentle help hint.
      return res.type('text/xml').status(200).send(twiml.toString());
    }

    if (keyword === 'HELP') {
      twiml.message('Rakie Salon: Reply START to subscribe. Reply STOP to unsubscribe. Msg&Data rates may apply.');
      return res.type('text/xml').status(200).send(twiml.toString());
    }

    if (keyword === 'STOP') {
      await setOptIn(from, false);
      // Per carrier rules, you must send a single confirmation of opt-out.
      twiml.message('You have been unsubscribed and will no longer receive messages from Rakie Salon. Reply START to resubscribe.');
      return res.type('text/xml').status(200).send(twiml.toString());
    }

    if (keyword === 'START') {
      await setOptIn(from, true);
      twiml.message('You are now subscribed to messages from Rakie Salon. Reply STOP to unsubscribe at any time.');
      return res.type('text/xml').status(200).send(twiml.toString());
    }

    // Fallback
    return res.type('text/xml').status(200).send(twiml.toString());
  } catch (err) {
    console.error('[twilio inbound] error:', err);
    // Return empty 200 so Twilio doesn’t retry aggressively
    return res.type('text/xml').status(200).send(new MessagingResponse().toString());
  }
});

module.exports = router;
