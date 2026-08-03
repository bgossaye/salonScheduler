const sendSMS = require('./sendSMS');
const { normalizeUSPhone } = require('./phone');

module.exports = async function sendOtpSMS({ phone, code, ttlMins = 10, client = null }) {
  // Prepare tokens for the pin_otp template
  const tokens = {
    otp: String(code).padStart(6, '0'),
    ttlMins
  };

  // Build the "appt-like" shape sendSMS expects:
  // Prefer a full client doc when you have it; otherwise pass a minimal client object with phone.
  const clientId = client
    ? client // may include _id, firstName, lastName, phone, contactPreferences
    : { phone: normalizeUSPhone(phone) || phone };

  // One pipeline handles templates (DB→file), tokens, phone, and Twilio
  await sendSMS('pin_otp', { clientId }, tokens);
};
