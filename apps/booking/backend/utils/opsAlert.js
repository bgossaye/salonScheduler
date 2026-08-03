// apps/booking/backend/utils/opsAlert.js
require('dotenv').config();
const nodemailer = require('nodemailer');

const TO = 'rakiesalon@gmail.com';
const FROM = process.env.EMAIL_USER || 'rakiesalon1@gmail.com'; // sender
const PASS = process.env.EMAIL_PASS;

const transporter = nodemailer.createTransport({
  host: 'smtp.gmail.com',
  port: 587,          // use 465 with secure: true if you prefer
  secure: false,
  auth: { user: FROM, pass: PASS },
});

function toText(details) {
  try {
    if (details == null) return '';
    if (typeof details === 'string') return details;
    if (details instanceof Error) return `${details.message}\n${details.stack || ''}`;
    return JSON.stringify(details, null, 2);
  } catch {
    return String(details);
  }
}

/**
 * Send any alert as a plain email to rakiesalon@gmail.com. Never throws.
 * @param {string} subject - short title (e.g., "Twilio SMS send failed")
 * @param {any} details    - any object/string/error; appended to body
 */
async function alertOps(subject, details) {
  const sub = `[Rakie Alert] ${subject || 'Alert'}`;
  const text = toText(details);

  try {
    const info = await transporter.sendMail({
      from: FROM,
      to: TO,
      subject: sub,
      text,
    });
    console.log('[opsAlert] sent to admin');
  } catch (e) {
    // Just log if email cannot be sent; do not throw
    console.error('[opsAlert] email send failed:', e?.message || e);
  }
}

module.exports = { alertOps };
