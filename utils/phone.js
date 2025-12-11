// utils/phone.js
// Normalize to E.164 for US numbers. Returns "+1XXXXXXXXXX" or null.
function normalizeUSPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  // allow 10-digit (assume US) or 11-digit with leading 1
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
  return null;
}
module.exports = { normalizeUSPhone };
