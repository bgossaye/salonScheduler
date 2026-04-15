// frontend/utils/phone.js
// Canonicalize US phone numbers to local 10 digits for UI state and API payloads.
// Allows users to type/paste a leading country code (1) without losing the last digit.

export function toDigits(raw = '') {
  return String(raw).replace(/\D/g, '');
}

function stripLeadingUsCountryCode(raw = '') {
  const digits = toDigits(raw);
  return digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
}

export function coercePhone10(raw = '') {
  const digits = stripLeadingUsCountryCode(raw);
  return digits.slice(0, 10);
}

export function normalizePhone10(raw = '') {
  return coercePhone10(raw);
}

export function isTenDigit(raw = '') {
  return coercePhone10(raw).length === 10;
}

// Optional: UI helpers (DO NOT submit these to backend)
export function maskPhone(raw = '') {
  const d = coercePhone10(raw);
  if (d.length < 4) return '**********';
  return `(***) ***-${d.slice(-4)}`;
}

export function prettyPhone(raw = '') {
  const d = coercePhone10(raw);
  return d.length === 10 ? `(${d.slice(0,3)}) ${d.slice(3,6)}-${d.slice(6)}` : '';
}
