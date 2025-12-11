// utils/canon.js
const MAP = {
  pending: 'pending',
  booked: 'confirmation',
  confirmation: 'confirmation',
  reminder: 'reminder',
  completed: 'thankyou',
  thankyou: 'thankyou',
  canceled: 'cancellation',
  cancel: 'cancellation',
  cancelation: 'cancellation',
  cancellation: 'cancellation',
  noshow: 'noshow',
  promotion: 'promotion',
  announcement: 'announcement',
  holiday: 'holiday',
  pin_otp: 'pin_otp',
  pin_verified: 'pin_verified',
  pin_changed: 'pin_changed',
};
function toCanonical(s) {
  const k = String(s || '').toLowerCase().trim();
  return MAP[k] || k;
}
const MARKETING = new Set(['promotion','announcement','holiday']);
const isMarketing = (t) => MARKETING.has(toCanonical(t));

module.exports = { toCanonical, isMarketing };
