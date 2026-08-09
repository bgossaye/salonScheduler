const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const Client = require('../../models/client');
const Otp = require('../../models/otp');
const FamilyInvitationAudit = require('../../models/familyinvitationaudit');
const AdminNotification = require('../../models/adminnotification');
const sendSMS = require('../../utils/sendSMS');
const sendOtpSMS = require('../../utils/sendOtpSMS');
const { alertOps: opsAlert } = require('../../utils/opsAlert');
const { getRuntimeBoolean, getRuntimeString, getRuntimeNumber } = require('../../utils/runtimeSettings');

const SUPPORT = { tech: '(585) 414-6041' };
const SUPPORT_SMS = '5854146041';
const PIN_HELP_KEYWORD = 'RAKIE PIN';
const PIN_LOCK_MAX_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;
const OTP_TTL_MINUTES = 10;
const OTP_VERIFIED_TTL_MINUTES = 15;
const OTP_MAX_ATTEMPTS = 5;
const OTP_REQUESTS_PER_HOUR = 5;

const otpBuckets = new Map();

function makeFamilyInvitationToken() {
  return crypto.randomBytes(32).toString('base64url');
}
function hashFamilyInvitationToken(token = '') {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}
async function familyInvitationUrl(token) {
  let base = await getRuntimeString('family.invitation.baseUrl', process.env.FAMILY_INVITATION_BASE_URL || process.env.FRONTEND_BASE_URL || 'https://rakiesalon.com/booking');
  base = String(base || 'https://rakiesalon.com/booking').trim().replace(/\/+$/, '');
  // Local frontend normally serves the booking SPA under /booking.
  // If a localhost base URL was configured without that prefix, add it so
  // the debug link lands on the same route shape as production.
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(base)) {
    base = `${base}/booking`;
  }
  return `${base}/family-invitation/${encodeURIComponent(token)}`;
}
function logFamilyInvitationDebugUrl(inviteUrl, member = null) {
  // Never log bearer invitation URLs in production, even if a stale debug env flag remains set.
  const debugEnabled = process.env.NODE_ENV !== 'production' && String(process.env.FAMILY_INVITATION_DEBUG_LINK || 'true').toLowerCase() !== 'false';
  if (!debugEnabled) return;

  // The SMS/public invitation URL may intentionally use the production domain via
  // Runtime Settings. For local testing, build a separate browser URL from the
  // debug base so the same secure token can be exercised against the local SPA.
  const tokenMarker = '/family-invitation/';
  const tokenIndex = String(inviteUrl || '').lastIndexOf(tokenMarker);
  const tokenPart = tokenIndex >= 0 ? String(inviteUrl).slice(tokenIndex + tokenMarker.length) : '';
  let debugBase = String(
    process.env.FAMILY_INVITATION_DEBUG_BASE_URL ||
    process.env.FRONTEND_BASE_URL ||
    'http://localhost:3001/booking'
  ).trim().replace(/\/+$/, '');
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(debugBase)) {
    debugBase = `${debugBase}/booking`;
  }
  const debugUrl = tokenPart ? `${debugBase}/family-invitation/${tokenPart}` : inviteUrl;
  const suffix = member?.phone ? ` -> ***-***-${phone10(member.phone).slice(-4)}` : '';
  console.info(`\n[FAMILY INVITATION DEBUG]${suffix}\nSMS URL: ${inviteUrl}\nLOCAL TEST URL: ${debugUrl}\n`);
}


async function familyInvitationDeclineCooldownHours() {
  let hours = Number(await getRuntimeNumber('family.invitation.declineCooldownHours', 24));
  // Allow very small fractional values for local/testing while keeping a sane production ceiling.
  // 0.001 hour is about 3.6 seconds.
  if (!Number.isFinite(hours) || hours < 0) hours = 24;
  return Math.min(hours, 24 * 30);
}
function formatCooldownDuration(hours) {
  const n = Number(hours);
  if (!Number.isFinite(n)) return '24 hours';
  if (n === 0) return 'no cooldown';
  if (n < 1 / 60) return `${Math.max(1, Math.round(n * 3600))} second${Math.round(n * 3600) === 1 ? '' : 's'}`;
  if (n < 1) return `${Math.max(1, Math.round(n * 60))} minute${Math.round(n * 60) === 1 ? '' : 's'}`;
  const rounded = Number.isInteger(n) ? n : Number(n.toFixed(3));
  return `${rounded} hour${rounded === 1 ? '' : 's'}`;
}

async function familyInvitationExpiry() {
  let hours = Number(await getRuntimeNumber('family.invitation.linkExpiryHours', 48));
  if (!Number.isFinite(hours) || hours < 1 || hours > 168) hours = 48;
  return new Date(Date.now() + hours * 60 * 60 * 1000);
}
function clearFamilyInvitationToken(link) {
  if (!link) return;
  link.invitationTokenHash = '';
  link.invitationExpiresAt = null;
}

async function recordFamilyInvitationAudit({ requester, invitee, action, actorType = 'system', actorClientId = null, actorAdminId = null, reason = '', metadata = {} }) {
  if (!requester?._id || !invitee?._id || !action) return;
  try {
    await FamilyInvitationAudit.create({
      requesterClientId: requester._id,
      inviteeClientId: invitee._id,
      action,
      actorType,
      actorClientId,
      actorAdminId,
      reason,
      metadata,
    });
  } catch (err) {
    console.error(`[family invitation audit:${action}] failed:`, err?.message || err);
  }
}

async function recordFamilyInvitationReport({ requester, invitee, source = 'client' }) {
  if (!requester?._id || !invitee?._id) return;
  await Promise.all([
    recordFamilyInvitationAudit({ requester, invitee, action: 'reported', actorType: source === 'public_link' ? 'public_link' : 'client', actorClientId: invitee._id, reason: 'Recipient reported the family invitation.' }),
    AdminNotification.create({
      type: 'family_invitation_reported',
      severity: 'warning',
      title: 'Family invitation reported',
      message: `${String(invitee.firstName || 'A client').trim()} reported a family invitation from ${String(requester.firstName || 'another client').trim()}. Future invitations between this pair are blocked until staff allows them again.`,
      clientId: invitee._id,
      status: 'unread',
      metadata: {
        requesterClientId: String(requester._id),
        inviteeClientId: String(invitee._id),
        source,
      },
    }),
  ]).catch((err) => console.error('[family invitation report audit] failed:', err?.message || err));
}

function onlyDigits(s = '') { return String(s || '').replace(/\D/g, ''); }
function phone10(p = '') {
  const d = onlyDigits(p);
  return d.length >= 10 ? d.slice(-10) : d;
}
function normalizePhone(p = '') { return phone10(p); }
function last4(p = '') { return onlyDigits(p).slice(-4); }
function maskPhone(p = '') {
  const d = phone10(p);
  return d.length === 10 ? `(***) ***-${d.slice(-4)}` : '';
}
function parseBoolean(value) {
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    return !(s === 'false' || s === '0' || s === '' || s === 'null' || s === 'undefined');
  }
  return !!value;
}
function parseNullableDate(value) {
  if (!value || value === 'null' || value === 'undefined' || value === '') return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}
function safeClient(doc) {
  const o = doc?.toObject ? doc.toObject() : { ...(doc || {}) };
  delete o.pinHash;
  delete o.otpHash;
  delete o.otpExpiresAt;
  delete o.otpIssuedAt;
  delete o.otpVerifyAttempts;
  delete o.otpRequestCount;
  delete o.otpLastRequestedAt;
  delete o.pinOtpHash;
  delete o.pinOtpExpires;
  delete o.pinOtpAttempts;
  return o;
}
function getOtpPurpose(raw, fallback = 'reset') {
  const p = String(raw || fallback).trim().toLowerCase();
  return ['signup', 'reset', 'login', 'verify', 'pin_set'].includes(p) ? p : fallback;
}
function manualPinHelpPayload(phone = '', reason = 'otp_failed') {
  const suffix = last4(phone);
  return {
    mode: 'manual_support',
    reason,
    keyword: PIN_HELP_KEYWORD,
    supportPhone: SUPPORT_SMS,
    supportPhoneDisplay: SUPPORT.tech,
    message: suffix
      ? `If the code does not arrive or keeps failing, text ${PIN_HELP_KEYWORD} to ${SUPPORT.tech} from the phone ending in ${suffix} and Rakie Salon will help you manually.`
      : `If the code does not arrive or keeps failing, text ${PIN_HELP_KEYWORD} to ${SUPPORT.tech} and Rakie Salon will help you manually.`,
  };
}
function duplicateClientResponse(res, existing, reason = 'duplicate') {
  return res.status(409).json({
    error: existing?.phone
      ? 'A client with that phone number already exists.'
      : 'A client with that phone or email already exists.',
    code: 'CLIENT_ALREADY_EXISTS',
    reason,
    // Never disclose an existing customer's profile from an unauthenticated
    // create/duplicate probe. The caller only needs to know that the account exists.
    existingClient: existing ? {
      exists: true,
      requiresNamePinUpgrade: !!existing.requiresNamePinUpgrade,
      pinIsDefault: !!existing.pinIsDefault,
    } : null,
  });
}
async function findExistingClientByPhoneOrEmail({ phone, email, excludeId = null }) {
  const or = [];
  const p10 = normalizePhone(phone);
  const cleanEmail = String(email || '').trim().toLowerCase();

  if (/^\d{10}$/.test(p10)) or.push({ phone: p10 });
  if (cleanEmail) or.push({ email: cleanEmail });
  if (!or.length) return null;

  const query = { $or: or };
  if (excludeId) query._id = { $ne: excludeId };
  return Client.findOne(query).exec();
}
function canRequestOtp(phone, purpose) {
  const key = `${purpose}:${phone}`;
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const bucket = otpBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    otpBuckets.set(key, { count: 1, resetAt: now + hour });
    return true;
  }
  if (bucket.count >= OTP_REQUESTS_PER_HOUR) return false;
  bucket.count += 1;
  return true;
}
function generateOtpCode() {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, '0');
}
async function upsertOtp({ phone, purpose, code }) {
  const codeHash = await bcrypt.hash(String(code), 10);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);
  await Otp.findOneAndUpdate(
    { phone, purpose },
    {
      $set: {
        codeHash,
        attempts: 0,
        verifiedAt: null,
        expiresAt,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
  return { expiresAt };
}
async function findActiveOtp(phone, purpose) {
  const doc = await Otp.findOne({ phone, purpose }).exec();
  if (!doc) return null;
  if (!doc.expiresAt || doc.expiresAt.getTime() <= Date.now()) {
    await Otp.deleteOne({ _id: doc._id }).catch(() => {});
    return null;
  }
  return doc;
}
async function verifyOtpCode({ phone, purpose, otp, markVerified = false, consume = false }) {
  const doc = await findActiveOtp(phone, purpose);
  if (!doc) return { ok: false, reason: 'missing_or_expired' };

  if ((doc.attempts || 0) >= OTP_MAX_ATTEMPTS) {
    await Otp.deleteOne({ _id: doc._id }).catch(() => {});
    return { ok: false, reason: 'too_many_attempts' };
  }

  const matched = await bcrypt.compare(String(otp || ''), doc.codeHash);
  if (!matched) {
    doc.attempts = Number(doc.attempts || 0) + 1;
    await doc.save();
    if (doc.attempts >= OTP_MAX_ATTEMPTS) {
      await Otp.deleteOne({ _id: doc._id }).catch(() => {});
      return { ok: false, reason: 'too_many_attempts' };
    }
    return { ok: false, reason: 'invalid' };
  }

  if (consume) {
    await Otp.deleteOne({ _id: doc._id }).catch(() => {});
    return { ok: true };
  }

  if (markVerified) {
    doc.verifiedAt = new Date();
    doc.attempts = 0;
    await doc.save();
  }

  return { ok: true };
}
async function consumeVerifiedOtp(phone, purpose) {
  const doc = await findActiveOtp(phone, purpose);
  if (!doc || !doc.verifiedAt) return false;
  const ageMs = Date.now() - new Date(doc.verifiedAt).getTime();
  if (ageMs > OTP_VERIFIED_TTL_MINUTES * 60 * 1000) {
    await Otp.deleteOne({ _id: doc._id }).catch(() => {});
    return false;
  }
  await Otp.deleteOne({ _id: doc._id }).catch(() => {});
  return true;
}
async function issueOtpAndSend({ phone, purpose, client = null }) {
  const code = generateOtpCode();
  await upsertOtp({ phone, purpose, code });
  try {
    await sendOtpSMS({ phone, code, ttlMins: OTP_TTL_MINUTES, client });
    return { ok: true };
  } catch (err) {
    await Otp.deleteMany({ phone, purpose }).catch(() => {});
    return { ok: false, err };
  }
}
function otpFailureResponse(res, phone, reason) {
  const fallback = manualPinHelpPayload(phone, reason);
  if (reason === 'too_many_attempts') {
    return res.status(429).json({
      error: 'Too many incorrect codes. Please request a new code or contact Rakie Salon.',
      ...fallback,
    });
  }
  if (reason === 'missing_or_expired') {
    return res.status(410).json({
      error: 'This code is missing or expired. Please request a new code.',
      ...fallback,
    });
  }
  return res.status(400).json({ error: 'Invalid code' });
}
function publicProfilePatch(body = {}, existing = {}) {
  const patch = {};
  if (Object.prototype.hasOwnProperty.call(body, 'firstName')) patch.firstName = String(body.firstName || '').trim();
  if (Object.prototype.hasOwnProperty.call(body, 'lastName')) patch.lastName = String(body.lastName || '').trim();
  if (Object.prototype.hasOwnProperty.call(body, 'email')) {
    const email = String(body.email || '').trim().toLowerCase();
    if (email) patch.email = email;
    else patch.$unsetEmail = true;
  }
  if (Object.prototype.hasOwnProperty.call(body, 'dob')) patch.dob = body.dob ? new Date(body.dob) : null;
  if (Object.prototype.hasOwnProperty.call(body, 'visitFrequency')) patch.visitFrequency = body.visitFrequency;
  if (Object.prototype.hasOwnProperty.call(body, 'servicePreferences')) patch.servicePreferences = body.servicePreferences;
  if (Object.prototype.hasOwnProperty.call(body, 'contactPreferences')) {
    patch.contactPreferences = {
      method: 'sms',
      optInPromotions: body.contactPreferences?.optInPromotions === true,
      emailDisabled: body.contactPreferences?.emailDisabled === true,
    };
  }
  if (Object.prototype.hasOwnProperty.call(body, 'requiresNamePinUpgrade')) {
    patch.requiresNamePinUpgrade = parseBoolean(body.requiresNamePinUpgrade);
  }
  if (Object.prototype.hasOwnProperty.call(body, 'nameVerifiedAt')) {
    patch.nameVerifiedAt = parseNullableDate(body.nameVerifiedAt);
  }
  // Compatibility for the legacy name-upgrade flow; normal nickname management stays admin-side.
  if (existing?.requiresNamePinUpgrade === true && Object.prototype.hasOwnProperty.call(body, 'nickname')) {
    patch.nickname = String(body.nickname || '').trim().slice(0, 120);
  }
  return patch;
}

exports.getClients = async (req, res) => {
  try {
    const p10 = phone10(req.query?.phone || '');
    if (!p10) return res.status(400).json({ error: 'Phone is required for public client lookup.' });
    const client = await Client.findOne({ phone: p10 }).populate('assignedStylistId preferredStylistId lastStylistId');
    if (!client) return res.json(null);

    // Before sign-in this endpoint is only an existence/PIN-state probe. Do not
    // expose the customer's profile, DOB, preferences, family data, etc. to
    // anyone who merely knows a phone number. A valid matching client session
    // receives the normal safe profile.
    if (String(req.client?.id || '') === String(client._id)) {
      return res.json(safeClient(client));
    }
    return res.json({
      _id: client._id,
      exists: true,
      requiresNamePinUpgrade: !!client.requiresNamePinUpgrade,
      pinIsDefault: !!client.pinIsDefault,
    });
  } catch (err) {
    console.error('public getClients failed:', err?.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
};

function createClientSessionToken(client) {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required for client sessions');
  return jwt.sign(
    { id: String(client._id), phone: normalizePhone(client.phone), tokenType: 'client' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.CLIENT_SESSION_TTL || '30d' }
  );
}

exports.loginClient = async (req, res) => {
  try {
    const { phone, pin, updateInfo } = req.body || {};
    const p10 = phone10(phone);
    if (p10.length !== 10) return res.status(400).json({ error: 'Phone must be 10 digits' });
    if (!/^\d{4}$/.test(String(pin || ''))) return res.status(400).json({ error: 'PIN must be 4 digits' });

    const doc = await Client.findOne({ phone: p10 }).select('+pinHash').exec();
    if (!doc || !doc.pinHash) {
      return res.status(409).json({
        error: 'No PIN on file. Please verify by code to set your PIN.',
        requiresOtp: true,
        otpPurpose: 'reset',
        phone: p10,
      });
    }

    if (doc.pinLockedUntil && new Date(doc.pinLockedUntil) > new Date()) {
      return res.status(423).json({
        error: 'Too many incorrect PIN attempts. Reset your PIN by code or try again later.',
        retryAt: doc.pinLockedUntil,
        requiresOtp: true,
        otpPurpose: 'reset',
        phone: p10,
      });
    }

    const ok = await bcrypt.compare(String(pin), doc.pinHash);
    if (!ok) {
      const failed = Number(doc.failedPinAttempts || 0) + 1;
      const update = { failedPinAttempts: failed };
      if (failed >= PIN_LOCK_MAX_ATTEMPTS) {
        update.failedPinAttempts = 0;
        update.pinLockedUntil = new Date(Date.now() + PIN_LOCK_MINUTES * 60 * 1000);
      }
      await Client.updateOne({ _id: doc._id }, { $set: update });
      if (failed >= PIN_LOCK_MAX_ATTEMPTS) {
        return res.status(423).json({
          error: `Too many incorrect PIN attempts. Reset your PIN by code or try again in ${PIN_LOCK_MINUTES} minutes.`,
          retryAt: update.pinLockedUntil,
          requiresOtp: true,
          otpPurpose: 'reset',
          phone: p10,
        });
      }
      return res.status(401).json({ error: 'Invalid phone or PIN' });
    }

    if ((doc.failedPinAttempts || 0) > 0 || doc.pinLockedUntil) {
      doc.failedPinAttempts = 0;
      doc.pinLockedUntil = undefined;
      await doc.save();
    }

    const usingDefaultPin = !!doc.pinIsDefault && String(pin) === last4(doc.phone);
    const mustChangePin = !!doc.requiresNamePinUpgrade;
    const proceedToIntake = mustChangePin || !!updateInfo;
    const clientToken = createClientSessionToken(doc);
    return res.json({ ...safeClient(doc), mustChangePin, proceedToIntake, usingDefaultPin, clientToken });
  } catch (err) {
    console.error('public loginClient error:', err?.message || err);
    return res.status(500).json({ error: 'Login failed' });
  }
};

exports.requestPinOtp = async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const purpose = getOtpPurpose(req.body?.purpose, 'reset');
    if (!/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'Phone must be 10 digits' });

    const existingClient = await Client.findOne({ phone }).select('firstName lastName phone contactPreferences').lean();
    if (purpose === 'reset' && !existingClient) {
      return res.status(404).json({ error: 'No client was found for this phone number.' });
    }

    if (!canRequestOtp(phone, purpose)) {
      return res.status(429).json({
        error: 'Too many code requests. Please try again later.',
        ...manualPinHelpPayload(phone, 'rate_limited'),
      });
    }

    const result = await issueOtpAndSend({ phone, purpose, client: existingClient || { phone } });
    if (!result.ok) {
      console.error('public requestPinOtp send failed:', result.err?.message || result.err);
      try { await opsAlert('[Rakie OTP] send failed', { where: 'publicRequestPinOtp', phone, purpose, err: String(result.err) }); } catch {}
      return res.status(502).json({
        error: 'We could not send the code right now.',
        ...manualPinHelpPayload(phone, 'send_failed'),
      });
    }

    return res.json({ ok: true, purpose, ttlMins: OTP_TTL_MINUTES, maskedPhone: maskPhone(phone) });
  } catch (err) {
    console.error('public requestPinOtp failed:', err?.message || err);
    try { await opsAlert('[Rakie OTP] request failed', { where: 'publicRequestPinOtp', err: String(err) }); } catch {}
    return res.status(500).json({ error: 'Could not start phone verification.' });
  }
};

exports.verifyPinOtp = async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const otp = String(req.body?.otp || '').trim();
    const purpose = getOtpPurpose(req.body?.purpose, 'signup');
    if (!/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'Phone must be 10 digits' });
    if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'Code must be 6 digits' });

    const result = await verifyOtpCode({ phone, purpose, otp, markVerified: true });
    if (!result.ok) return otpFailureResponse(res, phone, result.reason);

    const client = await Client.findOne({ phone }).exec();
    if (client) {
      const clientToken = createClientSessionToken(client);
      return res.json({ ok: true, verified: true, purpose, client: safeClient(client), clientToken });
    }
    return res.json({ ok: true, verified: true, purpose });
  } catch (err) {
    console.error('public verifyPinOtp failed:', err?.message || err);
    return res.status(500).json({ error: 'Could not verify the code.' });
  }
};

exports.setPinWithOtp = async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const otp = String(req.body?.otp || '').trim();
    const purpose = getOtpPurpose(req.body?.purpose, 'reset');
    const pin = String(req.body?.pin || '').trim();
    const pinConfirm = String(req.body?.pinConfirm || '').trim();

    if (!/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'Phone must be 10 digits' });
    if (!/^\d{6}$/.test(otp)) return res.status(400).json({ error: 'Code must be 6 digits' });
    if (!/^\d{4}$/.test(pin)) return res.status(400).json({ error: 'PIN must be exactly 4 digits' });
    if (pin !== pinConfirm) return res.status(400).json({ error: 'PINs do not match' });
    if (pin === last4(phone)) return res.status(400).json({ error: "PIN cannot be your phone number's last 4 digits" });

    const verify = await verifyOtpCode({ phone, purpose, otp, consume: true });
    if (!verify.ok) return otpFailureResponse(res, phone, verify.reason);

    const client = await Client.findOne({ phone }).select('+pinHash').exec();
    if (!client) return res.status(404).json({ error: 'Client not found for this phone number.' });

    client.pinHash = await bcrypt.hash(pin, 10);
    client.pinSetAt = new Date();
    client.pinIsDefault = false;
    client.failedPinAttempts = 0;
    client.pinLockedUntil = undefined;
    await client.save();

    const safe = safeClient(client);
    const clientToken = createClientSessionToken(client);
    res.json({ ...safe, clientToken });

    setImmediate(() => {
      sendSMS('pin_changed', { clientId: safe }, {
        message: 'Your Rakie Salon PIN was set successfully. Keep it private.',
      }).catch(err => console.error('[public setPinWithOtp] sendSMS error:', err?.message || err));
    });
  } catch (err) {
    console.error('public setPinWithOtp error:', err?.message || err);
    return res.status(500).json({ error: 'Failed to set PIN' });
  }
};

exports.createClient = async (req, res) => {
  try {
    const {
      firstName,
      lastName,
      phone,
      email,
      visitFrequency,
      servicePreferences,
      contactPreferences,
      pin,
      requiresNamePinUpgrade,
      nameVerifiedAt,
      otp,
      otpPurpose,
      welcomeOfferCode,
      welcomeOfferSource,
    } = req.body || {};

    const phoneDigits = normalizePhone(phone);
    if (!firstName || !lastName || !/^\d{10}$/.test(phoneDigits)) {
      return res.status(400).json({ error: 'First name, last name, and a valid 10-digit phone are required' });
    }

    const normalizedEmail = String(email || '').trim().toLowerCase();
    const existingClient = await findExistingClientByPhoneOrEmail({ phone: phoneDigits, email: normalizedEmail });
    if (existingClient) return duplicateClientResponse(res, existingClient, 'create_duplicate');

    const suppliedPin = /^\d{4}$/.test(String(pin || '')) ? String(pin) : '';
    if (!suppliedPin) return res.status(400).json({ error: 'PIN is required' });
    if (suppliedPin === last4(phoneDigits)) {
      return res.status(400).json({ error: "PIN cannot be your phone number's last 4 digits" });
    }

    const purpose = getOtpPurpose(otpPurpose, 'signup');
    let verified = false;
    if (/^\d{6}$/.test(String(otp || ''))) {
      const direct = await verifyOtpCode({ phone: phoneDigits, purpose, otp: String(otp), consume: true });
      verified = direct.ok;
    } else {
      verified = await consumeVerifiedOtp(phoneDigits, purpose);
    }
    if (!verified) {
      return res.status(403).json({
        error: 'Phone verification is required before creating your profile.',
        requiresOtp: true,
        otpPurpose: 'signup',
      });
    }

    const newClient = {
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      phone: phoneDigits,
      ...(normalizedEmail && { email: normalizedEmail }),
      ...(visitFrequency && { visitFrequency }),
      ...(servicePreferences && { servicePreferences }),
      contactPreferences: {
        method: 'sms',
        optInPromotions: contactPreferences?.optInPromotions === true,
        emailDisabled: contactPreferences?.emailDisabled === true,
      },
      requiresNamePinUpgrade: Object.prototype.hasOwnProperty.call(req.body || {}, 'requiresNamePinUpgrade')
        ? !!requiresNamePinUpgrade
        : false,
      nameVerifiedAt: Object.prototype.hasOwnProperty.call(req.body || {}, 'nameVerifiedAt')
        ? parseNullableDate(nameVerifiedAt)
        : new Date(),
      pinHash: await bcrypt.hash(String(suppliedPin), 10),
      pinSetAt: new Date(),
      pinIsDefault: false,
      failedPinAttempts: 0,
      ...(String(welcomeOfferCode || '').trim().toUpperCase() === 'NEWCLIENT10' && {
        welcomeOffer: {
          code: 'NEWCLIENT10',
          amount: 10,
          status: 'available',
          source: String(welcomeOfferSource || 'website_home_cta').trim().slice(0, 80),
          grantedAt: new Date(),
          redeemedAt: null,
          appointmentId: null,
        },
      }),
    };

    const client = await new Client(newClient).save();
    const safe = safeClient(client);
    const clientToken = createClientSessionToken(client);
    res.status(201).json({ ...safe, clientToken });

    setImmediate(() => {
      sendSMS('pin_changed', { clientId: safe }, {
        messageOverride: 'Welcome to Rakie Salon! Your login PIN is ready. Keep it private.',
      }).catch(err => console.error('[public createClient] sendSMS error:', err?.message || err));
    });
  } catch (err) {
    console.error('public createClient failed:', err?.message || err);
    if (err?.code === 11000) {
      const existing = await findExistingClientByPhoneOrEmail({ phone: req.body?.phone, email: req.body?.email }).catch(() => null);
      return duplicateClientResponse(res, existing, 'create_duplicate_key');
    }
    return res.status(500).json({ error: 'Server error creating client' });
  }
};

exports.updateClient = async (req, res) => {
  try {
    const existing = await Client.findById(req.params.id).select('+pinHash').exec();
    if (!existing) return res.status(404).json({ error: 'Client not found' });

    const submittedPhone = Object.prototype.hasOwnProperty.call(req.body || {}, 'phone')
      ? normalizePhone(req.body.phone)
      : existing.phone;

    if (!/^\d{10}$/.test(submittedPhone)) return res.status(400).json({ error: 'Phone must be 10 digits' });
    if (submittedPhone !== normalizePhone(existing.phone)) {
      return res.status(403).json({ error: 'Phone number changes must be handled by Rakie Salon.' });
    }

    const patch = publicProfilePatch(req.body || {}, existing);
    if (patch.firstName === '') return res.status(400).json({ error: 'First name is required' });
    if (patch.lastName === '') return res.status(400).json({ error: 'Last name is required' });

    if (Object.prototype.hasOwnProperty.call(patch, 'email')) {
      const duplicate = await findExistingClientByPhoneOrEmail({ email: patch.email, excludeId: req.params.id });
      if (duplicate) return duplicateClientResponse(res, duplicate, 'update_duplicate');
    }

    const unsetEmail = !!patch.$unsetEmail;
    const update = { ...patch };
    delete update.$unsetEmail;

    let pinChanged = false;
    if (req.body?.pin) {
      const newPin = String(req.body.pin || '').trim();
      if (!/^\d{4}$/.test(newPin)) return res.status(400).json({ error: 'PIN must be 4 digits' });
      if (newPin === last4(existing.phone)) {
        return res.status(400).json({ error: "PIN cannot be your phone number's last 4 digits" });
      }
      update.pinHash = await bcrypt.hash(newPin, 10);
      update.pinSetAt = new Date();
      update.pinIsDefault = false;
      update.failedPinAttempts = 0;
      update.pinLockedUntil = undefined;
      pinChanged = true;
    }

    const updateOperation = unsetEmail
      ? { $set: update, $unset: { email: 1 } }
      : { $set: update };

    const updated = await Client.findByIdAndUpdate(req.params.id, updateOperation, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: 'Client not found' });

    const safe = safeClient(updated);
    res.json(safe);

    if (pinChanged) {
      setImmediate(() => {
        sendSMS('pin_changed', { clientId: safe }, {
          message: 'Your PIN was updated. If you did not request this, please contact Rakie Salon.',
        }).catch(err => console.error('[public updateClient] sendSMS error:', err?.message || err));
      });
    }
  } catch (err) {
    console.error('public updateClient failed:', err?.message || err);
    if (err?.code === 11000) {
      const existing = await findExistingClientByPhoneOrEmail({ phone: req.body?.phone, email: req.body?.email, excludeId: req.params.id }).catch(() => null);
      return duplicateClientResponse(res, existing, 'update_duplicate_key');
    }
    return res.status(500).json({ error: 'Server error updating client' });
  }
};

exports.verifyOtpOnly = exports.verifyPinOtp;

function familyMemberSummary(client, relationship = 'family', link = {}) {
  if (!client) return null;
  const safe = safeClient(client);
  const useInvitationLabel = String(link.status || '') === 'pending' && String(link.direction || '') === 'outgoing';
  return {
    _id: safe._id,
    firstName: useInvitationLabel && link.invitationFirstName ? link.invitationFirstName : safe.firstName,
    lastName: useInvitationLabel && link.invitationLastName ? link.invitationLastName : safe.lastName,
    phone: safe.phone || null,
    relationship,
    linkStatus: link.status || 'active',
    linkDirection: link.direction || 'reciprocal',
    permissions: link.permissions || { canBook: true, canViewUpcoming: true, canCancel: false, canEditProfile: false },
    profileType: safe.profileType || 'independent',
    dob: safe.dob || null,
    guardianClientId: safe.guardianClientId || null,
    managedByClientId: safe.managedByClientId || null,
    assignedStylistId: safe.assignedStylistId || null,
    preferredStylistId: safe.preferredStylistId || null,
    lastStylistId: safe.lastStylistId || null,
  };
}

function activeFamilyLink(link) {
  return String(link?.status || 'active') === 'active';
}

function canManageDependent(ownerId, member) {
  return member?.profileType === 'minor_dependent' &&
    String(member?.guardianClientId || '') === String(ownerId || '');
}

exports.getFamilyMembers = async (req, res) => {
  try {
    const owner = await Client.findById(req.params.id)
      .select('firstName lastName phone familyLinks')
      .populate({
        path: 'familyLinks.clientId',
        select: 'firstName lastName phone dob profileType guardianClientId managedByClientId assignedStylistId preferredStylistId lastStylistId',
      }).lean();
    if (!owner) return res.status(404).json({ error: 'Client not found' });
    if (String(req.client?.id || '') !== String(owner._id)) return res.status(403).json({ error: 'You do not have permission to manage this family account.' });

    const members = (owner.familyLinks || [])
      .map((link) => familyMemberSummary(link.clientId, link.relationship, link))
      .filter(Boolean);
    return res.json({
      owner: familyMemberSummary(owner, 'self', { status: 'active' }),
      members: members.filter((m) => m.linkDirection !== 'incoming'),
      incomingInvitations: members.filter((m) => m.linkDirection === 'incoming' && m.linkStatus === 'pending'),
    });
  } catch (err) {
    console.error('getFamilyMembers failed:', err?.message || err);
    return res.status(500).json({ error: 'Could not load family members.' });
  }
};

exports.addFamilyMember = async (req, res) => {
  try {
    const owner = await Client.findById(req.params.id).select('+pinHash').exec();
    if (!owner) return res.status(404).json({ error: 'Client not found' });
    if (String(req.client?.id || '') !== String(owner._id)) return res.status(403).json({ error: 'You do not have permission to manage this family account.' });

    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const memberPhone = normalizePhone(req.body?.memberPhone || req.body?.familyPhone || '');
    const relationship = String(req.body?.relationship || 'family').trim().slice(0, 40) || 'family';
    const noPhone = req.body?.noPhone === true || String(req.body?.noPhone || '').toLowerCase() === 'true';
    const dob = parseNullableDate(req.body?.dob);
    const guardianAttestation = req.body?.guardianAttestation === true || String(req.body?.guardianAttestation || '').toLowerCase() === 'true';
    const allowedMinorRelationships = ['child', 'stepchild', 'foster_child', 'legal_ward', 'grandchild', 'minor_sibling'];
    if (!firstName || !lastName) return res.status(400).json({ error: 'Family member first and last name are required.' });

    let member = null;
    let created = false;
    let pendingInvitation = false;

    if (noPhone) {
      if (!dob || !guardianAttestation || !allowedMinorRelationships.includes(relationship)) {
        return res.status(400).json({ error: 'A date of birth, qualifying relationship, and guardian confirmation are required to add a minor without a phone.' });
      }
      const today = new Date();
      let age = today.getFullYear() - dob.getFullYear();
      const md = today.getMonth() - dob.getMonth();
      if (md < 0 || (md === 0 && today.getDate() < dob.getDate())) age -= 1;
      if (age < 0 || age >= 18) return res.status(403).json({ error: 'Only a minor under your care may be added without a phone. Adults without a phone must be added by salon staff.' });

      const duplicate = await Client.findOne({ guardianClientId: owner._id, firstName: { $regex: `^${firstName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }, lastName: { $regex: `^${lastName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, $options: 'i' }, dob, profileType: 'minor_dependent' }).exec();
      if (duplicate) return res.status(409).json({ error: 'A matching dependent already exists in your family.' });
      member = await Client.create({ firstName, lastName, phone: null, dob, profileType: 'minor_dependent', guardianClientId: owner._id, relationshipToGuardian: relationship, guardianAttestedAt: new Date(), createdByType: 'client', createdById: owner._id, phoneVerified: false, requiresNamePinUpgrade: false, managedByClientId: owner._id, contactPreferences: { method: 'phone', optInPromotions: false, emailDisabled: true }, welcomeOffer: { status: 'void', source: 'client_created_minor_no_phone', amount: 0 } });
      created = true;
    } else {
      if (!/^\d{10}$/.test(memberPhone)) return res.status(400).json({ error: 'A valid 10-digit phone number is required.' });
      if (memberPhone === normalizePhone(owner.phone)) return res.status(400).json({ error: 'That phone belongs to the signed-in client.' });
      member = await Client.findOne({ phone: memberPhone }).select('+pinHash').exec();
      if (!member) {
        const defaultPin = last4(memberPhone);
        member = await Client.create({ firstName, lastName, phone: memberPhone, phoneVerified: false, pinHash: await bcrypt.hash(defaultPin, 10), pinSetAt: new Date(), pinIsDefault: true, requiresNamePinUpgrade: true, managedByClientId: owner._id, createdByType: 'client', createdById: owner._id, contactPreferences: { method: 'sms', optInPromotions: false, emailDisabled: false }, welcomeOffer: { status: 'void', source: 'family_created_unverified', amount: 0 } });
        created = true;
      } else {
        pendingInvitation = true;
      }
    }

    const existingOwnerLink = (owner.familyLinks || []).find((l) => String(l.clientId) === String(member._id));
    if (existingOwnerLink) {
      const existingStatus = String(existingOwnerLink.status || 'active');
      if (existingStatus === 'blocked') return res.status(403).json({ error: 'This client has blocked family invitations from this account. Salon staff must review any future request.' });
      if (existingStatus === 'active') return res.status(409).json({ error: 'This client is already in your family.' });
      if (existingStatus === 'pending') {
        // A prior invitation may have been persisted even if SMS delivery failed.
        // Treat another Add attempt as an explicit resend instead of trapping the
        // relationship in a permanent "already pending" state.
        if (!member.phone) {
          return res.status(409).json({ error: 'A family invitation is already pending, but this client has no phone number available for delivery. Salon staff must review it.' });
        }
        const invitationToken = makeFamilyInvitationToken();
        const invitationTokenHash = hashFamilyInvitationToken(invitationToken);
        const invitationExpiresAt = await familyInvitationExpiry();
        let memberIncomingLink = (member.familyLinks || []).find((l) => String(l.clientId) === String(owner._id) && String(l.status) === 'pending' && String(l.direction) === 'incoming');
        existingOwnerLink.invitationTokenHash = invitationTokenHash;
        existingOwnerLink.invitationExpiresAt = invitationExpiresAt;
        existingOwnerLink.invitationSentAt = new Date();
        if (!memberIncomingLink) {
          member.familyLinks.push({
            clientId: owner._id, relationship: 'family', status: 'pending', direction: 'incoming',
            invitedByClientId: owner._id, invitationTokenHash, invitationExpiresAt, invitationSentAt: new Date(),
            permissions: { canBook: false, canViewUpcoming: false, canCancel: false, canEditProfile: false },
          });
          memberIncomingLink = member.familyLinks[member.familyLinks.length - 1];
        } else {
          memberIncomingLink.invitationTokenHash = invitationTokenHash;
          memberIncomingLink.invitationExpiresAt = invitationExpiresAt;
          memberIncomingLink.invitationSentAt = new Date();
        }
        await Promise.all([owner.save(), member.save()]);
        const inviteUrl = await familyInvitationUrl(invitationToken);
        logFamilyInvitationDebugUrl(inviteUrl, member);
        const inviteText = `${owner.firstName || 'A Rakie Salon client'} invited you to join their Rakie Salon family for booking. Review the invitation here: ${inviteUrl}`;
        const smsResult = await sendSMS('family_invite', { clientId: safeClient(member) }, { messageOverride: inviteText });
        if (!smsResult) {
          return res.status(503).json({
            pendingInvitation: true,
            invitationResent: false,
            smsSent: false,
            error: 'The family invitation is still pending, but the text message could not be sent. Please try again. You do not need to remove the invitation first.',
          });
        }
        await recordFamilyInvitationAudit({ requester: owner, invitee: member, action: 'resent', actorType: 'client', actorClientId: owner._id, reason: 'Family invitation text resent.' });
        return res.status(200).json({
          created: false,
          pendingInvitation: true,
          invitationResent: true,
          smsSent: true,
          member: familyMemberSummary(member, existingOwnerLink.relationship || relationship, existingOwnerLink),
          message: 'Family invitation text resent successfully.',
        });
      }
      const cooldownHours = await familyInvitationDeclineCooldownHours();
      const cooldownMs = cooldownHours * 60 * 60 * 1000;
      const declinedAtMs = existingOwnerLink.respondedAt ? new Date(existingOwnerLink.respondedAt).getTime() : NaN;
      if (existingStatus === 'declined' && !existingOwnerLink.unblockedAt && Number.isFinite(declinedAtMs) && cooldownMs > 0 && Date.now() - declinedAtMs < cooldownMs) {
        const remainingMs = Math.max(0, cooldownMs - (Date.now() - declinedAtMs));
        const remainingSeconds = Math.max(1, Math.ceil(remainingMs / 1000));
        const remainingMinutes = Math.ceil(remainingMs / (60 * 1000));
        const remainingHours = Math.ceil(remainingMs / (60 * 60 * 1000));
        const waitText = remainingMs < 60 * 1000
          ? `${remainingSeconds} second${remainingSeconds === 1 ? '' : 's'}`
          : remainingMs < 60 * 60 * 1000
            ? `${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'}`
            : `${remainingHours} hour${remainingHours === 1 ? '' : 's'}`;
        return res.status(429).json({ error: `This invitation was declined. Please wait about ${waitText} or ask salon staff to allow another invitation now.`, declineCooldownHours: cooldownHours, remainingMs, remainingSeconds, remainingMinutes, remainingHours });
      }
      owner.familyLinks = owner.familyLinks.filter((l) => String(l.clientId) !== String(member._id));
    }

    const status = pendingInvitation ? 'pending' : 'active';
    const invitationToken = pendingInvitation ? makeFamilyInvitationToken() : '';
    const invitationTokenHash = pendingInvitation ? hashFamilyInvitationToken(invitationToken) : '';
    const invitationExpiresAt = pendingInvitation ? await familyInvitationExpiry() : null;
    owner.familyLinks.push({ clientId: member._id, relationship, status, direction: pendingInvitation ? 'outgoing' : 'reciprocal', invitedByClientId: owner._id, invitationFirstName: pendingInvitation ? firstName : '', invitationLastName: pendingInvitation ? lastName : '', invitationTokenHash, invitationExpiresAt, invitationSentAt: pendingInvitation ? new Date() : null, permissions: { canBook: !pendingInvitation, canViewUpcoming: !pendingInvitation, canCancel: false, canEditProfile: canManageDependent(owner._id, member) } });
    await owner.save();

    const reciprocal = (member.familyLinks || []).find((l) => String(l.clientId) === String(owner._id));
    if (reciprocal) {
      reciprocal.relationship = 'family'; reciprocal.status = status; reciprocal.direction = pendingInvitation ? 'incoming' : 'reciprocal'; reciprocal.invitedByClientId = owner._id;
      reciprocal.invitationTokenHash = invitationTokenHash; reciprocal.invitationExpiresAt = invitationExpiresAt; reciprocal.invitationSentAt = pendingInvitation ? new Date() : null;
      // This is a brand-new invitation lifecycle. Do not carry an old decline/report override
      // into the new request or the admin profile may incorrectly hide its cooldown/block state.
      reciprocal.respondedAt = null;
      reciprocal.reportedAt = null;
      reciprocal.unblockedAt = null;
      reciprocal.unblockedByAdminId = null;
      reciprocal.unblockReason = '';
    } else {
      member.familyLinks.push({ clientId: owner._id, relationship: 'family', status, direction: pendingInvitation ? 'incoming' : 'reciprocal', invitedByClientId: owner._id, invitationTokenHash, invitationExpiresAt, invitationSentAt: pendingInvitation ? new Date() : null, permissions: { canBook: false, canViewUpcoming: false, canCancel: false, canEditProfile: false } });
    }
    await member.save();

    if (created && member.phone) {
      setImmediate(() => sendSMS('pin_changed', { clientId: safeClient(member) }, { messageOverride: 'A family member created your Rakie Salon profile. Your temporary PIN is the last 4 digits of your phone. You will be asked to change it when you sign in. Contact the salon if this was not authorized.' }).catch(err => console.error('[addFamilyMember] sendSMS error:', err?.message || err)));
    } else if (pendingInvitation && member.phone) {
      // Invitation delivery is awaited so the API never claims "sent" when the
      // database link was saved but Twilio/template delivery did not occur.
      const inviteUrl = await familyInvitationUrl(invitationToken);
      logFamilyInvitationDebugUrl(inviteUrl, member);
      const inviteText = `${owner.firstName || 'A Rakie Salon client'} invited you to join their Rakie Salon family for booking. Review the invitation here: ${inviteUrl}`;
      const smsResult = await sendSMS('family_invite', { clientId: safeClient(member) }, { messageOverride: inviteText });
      if (!smsResult) {
        return res.status(202).json({
          created,
          pendingInvitation: true,
          smsSent: false,
          member: familyMemberSummary(member, relationship, { status, direction: 'outgoing' }),
          message: 'The family invitation is pending, but the text message could not be sent. Try adding this member again to resend the invitation.',
        });
      }
      await recordFamilyInvitationAudit({ requester: owner, invitee: member, action: 'invited', actorType: 'client', actorClientId: owner._id, reason: 'Family invitation sent.' });
      return res.status(202).json({
        created,
        pendingInvitation: true,
        smsSent: true,
        member: familyMemberSummary(member, relationship, { status, direction: 'outgoing' }),
        message: 'Invitation sent. The existing client must accept before booking is allowed.',
      });
    }

    return res.status(created ? 201 : 202).json({ created, pendingInvitation, member: familyMemberSummary(member, relationship, { status, direction: pendingInvitation ? 'outgoing' : 'reciprocal' }), message: pendingInvitation ? 'Invitation pending.' : 'Family member added.' });
  } catch (err) {
    console.error('addFamilyMember failed:', err?.message || err);
    if (err?.code === 11000) return res.status(409).json({ error: 'A client with that phone already exists.' });
    return res.status(500).json({ error: 'Could not add the family member.' });
  }
};

exports.requestFamilyInvitationAcceptOtp = async (req, res) => {
  try {
    const invitee = await Client.findById(req.params.id).exec();
    if (!invitee) return res.status(404).json({ error: 'Client not found.' });
    if (String(req.client?.id || '') !== String(invitee._id)) return res.status(403).json({ error: 'You do not have permission to manage this family account.' });

    const otpRequired = await getRuntimeBoolean('family.invitation.acceptOtpRequired.enabled', false);
    if (!otpRequired) return res.json({ required: false, message: 'OTP confirmation is currently disabled.' });

    const link = (invitee.familyLinks || []).find((l) => String(l.clientId) === String(req.params.requesterId) && String(l.status) === 'pending' && String(l.direction) === 'incoming');
    if (!link) return res.status(404).json({ error: 'Pending invitation not found.' });
    const phone = normalizePhone(invitee.phone);
    if (!/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'A valid phone number is required to send the confirmation code.' });
    if (!canRequestOtp(phone, 'family_accept')) return res.status(429).json({ error: 'Too many codes requested. Please wait before trying again.' });

    const result = await issueOtpAndSend({ phone, purpose: 'family_accept', client: safeClient(invitee) });
    if (!result.ok) return res.status(502).json({ error: 'Could not send the confirmation code. Please try again or contact the salon.' });
    return res.json({ required: true, sent: true, maskedPhone: maskPhone(phone), expiresInMinutes: OTP_TTL_MINUTES });
  } catch (err) {
    console.error('requestFamilyInvitationAcceptOtp failed:', err?.message || err);
    return res.status(500).json({ error: 'Could not send the family invitation confirmation code.' });
  }
};

exports.respondFamilyInvitation = async (req, res) => {
  let inviteeForAudit = null;
  let requesterForAudit = null;
  try {
    const invitee = await Client.findById(req.params.id).exec();
    if (!invitee) return res.status(404).json({ error: 'Client not found.' });
    if (String(req.client?.id || '') !== String(invitee._id)) return res.status(403).json({ error: 'You do not have permission to manage this family account.' });
    const action = String(req.body?.action || '').toLowerCase();
    if (!['accept', 'decline', 'report'].includes(action)) return res.status(400).json({ error: 'Choose accept, decline, or report.' });

    if (action === 'accept') {
      const otpRequired = await getRuntimeBoolean('family.invitation.acceptOtpRequired.enabled', false);
      if (otpRequired) {
        const otp = String(req.body?.otp || '').trim();
        if (!/^\d{6}$/.test(otp)) {
          return res.status(428).json({ code: 'FAMILY_ACCEPT_OTP_REQUIRED', error: 'Enter the 6-digit code sent to your phone to accept this invitation.' });
        }
        const verified = await verifyOtpCode({ phone: normalizePhone(invitee.phone), purpose: 'family_accept', otp, consume: true });
        if (!verified.ok) return otpFailureResponse(res, invitee.phone, verified.reason);
      }
    }

    const session = await Client.startSession();
    let finalStatus = '';
    try {
      await session.withTransaction(async () => {
        const inviteeTx = await Client.findById(req.params.id).session(session);
        const requesterTx = await Client.findById(req.params.requesterId).session(session);
        if (!inviteeTx || !requesterTx) {
          const err = new Error('Family invitation clients were not found.'); err.status = 404; throw err;
        }
        const link = (inviteeTx.familyLinks || []).find((l) => String(l.clientId) === String(requesterTx._id) && String(l.status) === 'pending' && String(l.direction) === 'incoming');
        const reverse = (requesterTx.familyLinks || []).find((l) => String(l.clientId) === String(inviteeTx._id) && String(l.status) === 'pending' && String(l.direction) === 'outgoing');
        if (!link || !reverse) {
          const err = new Error('This invitation has already been responded to, canceled, or is no longer pending.'); err.status = 409; err.code = 'FAMILY_INVITATION_ALREADY_RESOLVED'; throw err;
        }
        const now = new Date();
        if (action === 'accept') {
          link.status = 'active'; link.direction = 'reciprocal'; link.respondedAt = now;
          link.permissions = { canBook: false, canViewUpcoming: false, canCancel: false, canEditProfile: false };
          reverse.status = 'active'; reverse.direction = 'reciprocal'; reverse.respondedAt = now;
          reverse.permissions = { canBook: true, canViewUpcoming: true, canCancel: false, canEditProfile: false };
        } else {
          const nextStatus = action === 'report' ? 'blocked' : 'declined';
          for (const item of [link, reverse]) {
            item.status = nextStatus; item.respondedAt = now;
            item.unblockedAt = null; item.unblockedByAdminId = null; item.unblockReason = '';
            item.reportedAt = action === 'report' ? now : null;
          }
        }
        clearFamilyInvitationToken(link); clearFamilyInvitationToken(reverse);
        await inviteeTx.save({ session });
        await requesterTx.save({ session });
        finalStatus = String(link.status);
        inviteeForAudit = inviteeTx;
        requesterForAudit = requesterTx;
      });
    } finally {
      await session.endSession();
    }

    if (action === 'report') await recordFamilyInvitationReport({ requester: requesterForAudit, invitee: inviteeForAudit, source: 'client' });
    else await recordFamilyInvitationAudit({ requester: requesterForAudit, invitee: inviteeForAudit, action: action === 'accept' ? 'accepted' : 'declined', actorType: 'client', actorClientId: inviteeForAudit?._id, reason: action === 'accept' ? 'Recipient accepted family invitation.' : 'Recipient declined family invitation.' });
    return res.json({ status: finalStatus, message: action === 'accept' ? 'Family invitation accepted.' : action === 'report' ? 'Invitation reported and blocked.' : `Family invitation declined. No access was granted. A new invitation can be sent after ${formatCooldownDuration(await familyInvitationDeclineCooldownHours())} unless salon staff allows it sooner.` });
  } catch (err) {
    console.error('respondFamilyInvitation failed:', err?.message || err);
    return res.status(err?.status || 500).json({ error: err?.status ? err.message : 'Could not respond to the family invitation.', code: err?.code });
  }
};


async function findPublicFamilyInvitation(rawToken) {
  const token = String(rawToken || '').trim();
  if (!token || token.length < 32 || token.length > 200) return null;
  const tokenHash = hashFamilyInvitationToken(token);
  const invitee = await Client.findOne({
    familyLinks: {
      $elemMatch: {
        invitationTokenHash: tokenHash,
        status: 'pending',
        direction: 'incoming',
        invitationExpiresAt: { $gt: new Date() },
      },
    },
  }).exec();
  if (!invitee) return null;
  const link = (invitee.familyLinks || []).find((item) =>
    item.invitationTokenHash === tokenHash &&
    String(item.status) === 'pending' &&
    String(item.direction) === 'incoming' &&
    item.invitationExpiresAt && new Date(item.invitationExpiresAt).getTime() > Date.now()
  );
  if (!link) return null;
  const requester = await Client.findById(link.clientId).select('firstName lastName familyLinks').exec();
  if (!requester) return null;
  const reverse = (requester.familyLinks || []).find((item) =>
    String(item.clientId) === String(invitee._id) &&
    String(item.status) === 'pending' &&
    String(item.direction) === 'outgoing'
  );
  return { tokenHash, invitee, link, requester, reverse };
}

exports.getPublicFamilyInvitation = async (req, res) => {
  try {
    const found = await findPublicFamilyInvitation(req.params.token);
    if (!found) return res.status(410).json({ error: 'This family invitation link is invalid, expired, canceled, or already used.' });
    const otpRequired = await getRuntimeBoolean('family.invitation.acceptOtpRequired.enabled', false);
    const declineCooldownHours = await familyInvitationDeclineCooldownHours();
    return res.json({
      status: 'pending',
      inviterFirstName: String(found.requester.firstName || 'A Rakie Salon client').trim(),
      expiresAt: found.link.invitationExpiresAt || null,
      otpRequired,
      declineCooldownHours,
      permissions: { canBook: true, canViewUpcoming: true, canCancel: false, canEditProfile: false },
    });
  } catch (err) {
    console.error('getPublicFamilyInvitation failed:', err?.message || err);
    return res.status(500).json({ error: 'Could not load this family invitation.' });
  }
};

exports.requestPublicFamilyInvitationAcceptOtp = async (req, res) => {
  try {
    const found = await findPublicFamilyInvitation(req.params.token);
    if (!found) return res.status(410).json({ error: 'This family invitation link is invalid, expired, canceled, or already used.' });
    const otpRequired = await getRuntimeBoolean('family.invitation.acceptOtpRequired.enabled', false);
    if (!otpRequired) return res.json({ required: false, message: 'OTP confirmation is currently disabled.' });
    const phone = normalizePhone(found.invitee.phone);
    if (!/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'A valid phone number is required to send the confirmation code.' });
    if (!canRequestOtp(phone, 'family_accept')) return res.status(429).json({ error: 'Too many codes requested. Please wait before trying again.' });
    const result = await issueOtpAndSend({ phone, purpose: 'family_accept', client: safeClient(found.invitee) });
    if (!result.ok) return res.status(502).json({ error: 'Could not send the confirmation code. Please try again or contact the salon.' });
    return res.json({ required: true, sent: true, maskedPhone: maskPhone(phone), expiresInMinutes: OTP_TTL_MINUTES });
  } catch (err) {
    console.error('requestPublicFamilyInvitationAcceptOtp failed:', err?.message || err);
    return res.status(500).json({ error: 'Could not send the family invitation confirmation code.' });
  }
};

exports.respondPublicFamilyInvitation = async (req, res) => {
  let requesterForAudit = null;
  let inviteeForAudit = null;
  try {
    const token = String(req.params.token || '').trim();
    const tokenHash = hashFamilyInvitationToken(token);
    const initial = await findPublicFamilyInvitation(token);
    if (!initial) return res.status(410).json({ error: 'This family invitation link is invalid, expired, canceled, or already used.' });
    const action = String(req.body?.action || '').toLowerCase();
    if (!['accept', 'decline', 'report'].includes(action)) return res.status(400).json({ error: 'Choose accept, decline, or report.' });

    if (action === 'accept') {
      const otpRequired = await getRuntimeBoolean('family.invitation.acceptOtpRequired.enabled', false);
      if (otpRequired) {
        const otp = String(req.body?.otp || '').trim();
        if (!/^\d{6}$/.test(otp)) return res.status(428).json({ code: 'FAMILY_ACCEPT_OTP_REQUIRED', error: 'Enter the 6-digit code sent to your phone to accept this invitation.' });
        const verified = await verifyOtpCode({ phone: normalizePhone(initial.invitee.phone), purpose: 'family_accept', otp, consume: true });
        if (!verified.ok) return otpFailureResponse(res, initial.invitee.phone, verified.reason);
      }
    }

    const session = await Client.startSession();
    let finalStatus = '';
    try {
      await session.withTransaction(async () => {
        const inviteeTx = await Client.findOne({ familyLinks: { $elemMatch: { invitationTokenHash: tokenHash, status: 'pending', direction: 'incoming', invitationExpiresAt: { $gt: new Date() } } } }).session(session);
        if (!inviteeTx) {
          const err = new Error('This invitation has already been responded to, canceled, expired, or is no longer pending.'); err.status = 409; err.code = 'FAMILY_INVITATION_ALREADY_RESOLVED'; throw err;
        }
        const link = (inviteeTx.familyLinks || []).find((item) => item.invitationTokenHash === tokenHash && String(item.status) === 'pending' && String(item.direction) === 'incoming' && item.invitationExpiresAt && new Date(item.invitationExpiresAt).getTime() > Date.now());
        if (!link) { const err = new Error('This invitation is no longer pending.'); err.status = 409; throw err; }
        const requesterTx = await Client.findById(link.clientId).session(session);
        if (!requesterTx) { const err = new Error('The requesting client was not found.'); err.status = 404; throw err; }
        const reverse = (requesterTx.familyLinks || []).find((item) => String(item.clientId) === String(inviteeTx._id) && String(item.status) === 'pending' && String(item.direction) === 'outgoing' && item.invitationTokenHash === tokenHash);
        if (!reverse) { const err = new Error('This invitation is no longer pending.'); err.status = 409; err.code = 'FAMILY_INVITATION_ALREADY_RESOLVED'; throw err; }
        const now = new Date();
        if (action === 'accept') {
          link.status = 'active'; link.direction = 'reciprocal'; link.respondedAt = now;
          link.permissions = { canBook: false, canViewUpcoming: false, canCancel: false, canEditProfile: false };
          reverse.status = 'active'; reverse.direction = 'reciprocal'; reverse.respondedAt = now;
          reverse.permissions = { canBook: true, canViewUpcoming: true, canCancel: false, canEditProfile: false };
        } else {
          const nextStatus = action === 'report' ? 'blocked' : 'declined';
          for (const item of [link, reverse]) {
            item.status = nextStatus; item.respondedAt = now;
            item.unblockedAt = null; item.unblockedByAdminId = null; item.unblockReason = '';
            item.reportedAt = action === 'report' ? now : null;
          }
        }
        clearFamilyInvitationToken(link); clearFamilyInvitationToken(reverse);
        await inviteeTx.save({ session });
        await requesterTx.save({ session });
        finalStatus = String(link.status);
        requesterForAudit = requesterTx;
        inviteeForAudit = inviteeTx;
      });
    } finally {
      await session.endSession();
    }

    if (action === 'report') await recordFamilyInvitationReport({ requester: requesterForAudit, invitee: inviteeForAudit, source: 'public_link' });
    else await recordFamilyInvitationAudit({ requester: requesterForAudit, invitee: inviteeForAudit, action: action === 'accept' ? 'accepted' : 'declined', actorType: 'public_link', actorClientId: inviteeForAudit?._id, reason: action === 'accept' ? 'Recipient accepted family invitation from secure link.' : 'Recipient declined family invitation from secure link.' });
    return res.json({
      status: finalStatus,
      message: action === 'accept'
        ? 'Family invitation accepted.'
        : action === 'report'
          ? 'Invitation reported and blocked.'
          : `Family invitation declined. No access was granted. A new invitation can be sent after ${formatCooldownDuration(await familyInvitationDeclineCooldownHours())} unless salon staff allows it sooner.`,
    });
  } catch (err) {
    console.error('respondPublicFamilyInvitation failed:', err?.message || err);
    return res.status(err?.status || 500).json({ error: err?.status ? err.message : 'Could not respond to the family invitation.', code: err?.code });
  }
};


exports.getFamilyOverview = async (req, res) => {
  try {
    const owner = await Client.findById(req.params.id).select('firstName lastName phone familyLinks').populate({ path: 'familyLinks.clientId', select: 'firstName lastName phone dob profileType guardianClientId managedByClientId assignedStylistId preferredStylistId lastStylistId' }).lean();
    if (!owner) return res.status(404).json({ error: 'Client not found' });
    if (String(req.client?.id || '') !== String(owner._id)) return res.status(403).json({ error: 'You do not have permission to manage this family account.' });
    const outgoing = (owner.familyLinks || []).filter((l) => l.direction !== 'incoming').map((l) => familyMemberSummary(l.clientId, l.relationship, l)).filter(Boolean);
    const incomingInvitations = (owner.familyLinks || []).filter((l) => l.direction === 'incoming' && l.status === 'pending').map((l) => familyMemberSummary(l.clientId, l.relationship, l)).filter(Boolean);
    const people = [familyMemberSummary(owner, 'self', { status: 'active' }), ...outgoing];
    const visiblePeople = people.filter((p) => p.relationship === 'self' || (p.linkStatus === 'active' && p.permissions?.canViewUpcoming !== false));
    const ids = visiblePeople.map((p) => p._id).filter(Boolean);
    const Appointment = require('../../models/appointment');
    const today = new Date(); today.setHours(0,0,0,0); const dateFloor = today.toISOString().slice(0,10);
    const appointments = await Appointment.find({ clientId: { $in: ids }, status: { $in: ['pending','booked'] }, date: { $gte: dateFloor }, $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }] }).sort({ date:1,time:1 }).lean();
    const byClient = new Map(); for (const a of appointments) { const k=String(a.clientId||''); if(!byClient.has(k)) byClient.set(k,[]); byClient.get(k).push(a); }
    const members = people.map((person) => {
      const upcomingRaw = person.linkStatus === 'active' ? (byClient.get(String(person._id)) || []) : [];
      const canEditProfile = person.relationship === 'self' || canManageDependent(owner._id, person);
      const canManageAllAppointments = person.relationship === 'self' || canEditProfile || person.permissions?.canCancel === true;
      const upcoming = upcomingRaw.map((appointment) => {
        const createdByOwner = appointment.bookedByClientId && String(appointment.bookedByClientId) === String(owner._id);
        const { bookedByClientId, ...safeAppointment } = appointment;
        return { ...safeAppointment, canEditAppointment: canManageAllAppointments || createdByOwner };
      });
      return {
        ...person,
        canEditProfile,
        canBook: person.relationship === 'self' || (person.linkStatus === 'active' && person.permissions?.canBook !== false),
        upcomingAppointments: upcoming,
        nextAppointment: upcoming[0] || null,
        activeAppointmentCount: upcoming.length,
        atOnlineAppointmentLimit: upcoming.length >= 2,
        pendingCount: upcoming.filter(a => String(a.status).toLowerCase()==='pending').length,
      };
    });
    return res.json({ ownerClientId: owner._id, members, incomingInvitations, summary: { upcomingCount: appointments.length, pendingCount: appointments.filter(a => String(a.status).toLowerCase()==='pending').length, withoutAppointmentCount: members.filter(m => m.linkStatus === 'active' && !m.nextAppointment).length } });
  } catch (err) { console.error('getFamilyOverview failed:', err?.message || err); return res.status(500).json({ error: 'Could not load the family overview.' }); }
};

exports.updateFamilyMember = async (req, res) => {
  try {
    const owner = await Client.findById(req.params.id).select('firstName lastName phone familyLinks').exec();
    if (!owner) return res.status(404).json({ error: 'Client not found' });
    if (String(req.client?.id || '') !== String(owner._id)) return res.status(403).json({ error: 'You do not have permission to manage this family account.' });
    const link = (owner.familyLinks || []).find(i => String(i.clientId) === String(req.params.memberId) && activeFamilyLink(i));
    if (!link) return res.status(404).json({ error: 'That active family link was not found.' });
    const member = await Client.findById(req.params.memberId).exec();
    if (!member) return res.status(404).json({ error: 'Family member not found.' });
    const relationship = String(req.body?.relationship || link.relationship || 'family').trim().slice(0,40) || 'family';
    const canEditProfile = canManageDependent(owner._id, member);
    link.relationship = relationship;
    if (canEditProfile) {
      const firstName = String(req.body?.firstName ?? member.firstName ?? '').trim(); const lastName = String(req.body?.lastName ?? member.lastName ?? '').trim();
      if (!firstName || !lastName) return res.status(400).json({ error: 'First and last name are required.' });
      member.firstName = firstName; member.lastName = lastName;
      const submittedPhone = normalizePhone(req.body?.memberPhone || req.body?.phone || member.phone || '');
      if (member.profileType === 'minor_dependent' && !submittedPhone) member.phone = null;
      else { if (!/^\d{10}$/.test(submittedPhone)) return res.status(400).json({ error: 'Enter a valid 10-digit phone number.' }); const duplicate = await Client.findOne({ phone: submittedPhone, _id: { $ne: member._id } }).lean(); if (duplicate) return res.status(409).json({ error: 'That phone number is already used by another client.' }); member.phone = submittedPhone; }
      await member.save();
    }
    await owner.save();
    return res.json({ member: familyMemberSummary(member, relationship, link), canEditProfile });
  } catch (err) { console.error('updateFamilyMember failed:', err?.message || err); return res.status(500).json({ error: 'Could not update the family member.' }); }
};

exports.unlinkFamilyMember = async (req, res) => {
  try {
    const owner = await Client.findById(req.params.id).select('phone familyLinks').exec();
    if (!owner) return res.status(404).json({ error: 'Client not found' });
    if (String(req.client?.id || '') !== String(owner._id)) return res.status(403).json({ error: 'You do not have permission to manage this family account.' });
    const link = (owner.familyLinks || []).find(i => String(i.clientId) === String(req.params.memberId));
    if (!link) return res.status(404).json({ error: 'That client is not linked to this family account.' });
    const member = await Client.findById(req.params.memberId).exec();
    if (member && canManageDependent(owner._id, member)) return res.status(409).json({ error: 'A minor dependent cannot be unlinked online. Salon staff must transfer or close guardianship so appointments and records remain protected.' });
    owner.familyLinks = owner.familyLinks.filter(i => String(i.clientId) !== String(req.params.memberId));
    await owner.save();
    if (member) { member.familyLinks = (member.familyLinks || []).filter(i => String(i.clientId) !== String(owner._id)); if (String(member.managedByClientId || '') === String(owner._id)) member.managedByClientId = null; await member.save(); }
    if (member && String(link.status) === 'pending') await recordFamilyInvitationAudit({ requester: owner, invitee: member, action: 'canceled', actorType: 'client', actorClientId: owner._id, reason: 'Requester canceled pending family invitation.' });
    return res.json({ message: link.status === 'pending' ? 'Family invitation cancelled.' : 'Family member unlinked. Their client account and appointment history were not deleted.' });
  } catch (err) { console.error('unlinkFamilyMember failed:', err?.message || err); return res.status(500).json({ error: 'Could not unlink the family member.' }); }
};
