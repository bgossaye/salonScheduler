// helpers/authFlags.js
const AuthSettings = require('../models/authSettings');
let cache = { otpEnabled: true, forceChangeDefaultOnFirstLogin: true };

async function getAuthFlags() {
  const s = await AuthSettings.findOne().lean();
  cache = { ...cache, ...(s || {}) };
  return cache;
}
module.exports = { getAuthFlags };
