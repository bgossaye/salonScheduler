const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const Client = require('../../models/client');
const Otp = require('../../models/otp');
const sendSMS = require('../../utils/sendSMS');
const sendOtpSMS = require('../../utils/sendOtpSMS');
const { alertOps: opsAlert } = require('../../utils/opsAlert');

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
    existingClient: existing ? safeClient(existing) : null,
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
    return res.json(client ? safeClient(client) : null);
  } catch (err) {
    console.error('public getClients failed:', err?.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
};

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
    return res.json({ ...safeClient(doc), mustChangePin, proceedToIntake, usingDefaultPin });
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
    res.json(safe);

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
    res.status(201).json(safe);

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

function familyAuthMatches(owner, body = {}, query = {}) {
  const submittedPhone = normalizePhone(body.ownerPhone || body.phone || query.ownerPhone || query.phone || '');
  return !!owner && submittedPhone.length === 10 && normalizePhone(owner.phone) === submittedPhone;
}

function familyMemberSummary(client, relationship = 'family') {
  if (!client) return null;
  const safe = safeClient(client);
  return {
    _id: safe._id,
    firstName: safe.firstName,
    lastName: safe.lastName,
    phone: safe.phone,
    relationship,
    managedByClientId: safe.managedByClientId || null,
    assignedStylistId: safe.assignedStylistId || null,
    preferredStylistId: safe.preferredStylistId || null,
    lastStylistId: safe.lastStylistId || null,
  };
}

exports.getFamilyMembers = async (req, res) => {
  try {
    const owner = await Client.findById(req.params.id)
      .select('firstName lastName phone familyLinks')
      .populate({
        path: 'familyLinks.clientId',
        select: 'firstName lastName phone managedByClientId assignedStylistId preferredStylistId lastStylistId',
      })
      .lean();
    if (!owner) return res.status(404).json({ error: 'Client not found' });
    if (!familyAuthMatches(owner, {}, req.query || {})) {
      return res.status(403).json({ error: 'Unable to verify this family account.' });
    }

    const members = (owner.familyLinks || [])
      .map((link) => familyMemberSummary(link.clientId, link.relationship))
      .filter(Boolean);
    return res.json({ owner: familyMemberSummary(owner, 'self'), members });
  } catch (err) {
    console.error('getFamilyMembers failed:', err?.message || err);
    return res.status(500).json({ error: 'Could not load family members.' });
  }
};

exports.addFamilyMember = async (req, res) => {
  try {
    const owner = await Client.findById(req.params.id).select('+pinHash').exec();
    if (!owner) return res.status(404).json({ error: 'Client not found' });
    if (!familyAuthMatches(owner, req.body || {}, {})) {
      return res.status(403).json({ error: 'Unable to verify this family account.' });
    }

    const firstName = String(req.body?.firstName || '').trim();
    const lastName = String(req.body?.lastName || '').trim();
    const memberPhone = normalizePhone(req.body?.memberPhone || req.body?.familyPhone || '');
    const relationship = String(req.body?.relationship || 'family').trim().slice(0, 40) || 'family';
    if (!firstName || !lastName || !/^\d{10}$/.test(memberPhone)) {
      return res.status(400).json({ error: 'Family member name and a valid 10-digit phone are required.' });
    }
    if (memberPhone === normalizePhone(owner.phone)) {
      return res.status(400).json({ error: 'That phone belongs to the signed-in client.' });
    }

    let member = await Client.findOne({ phone: memberPhone }).select('+pinHash').exec();
    let created = false;
    if (!member) {
      const defaultPin = last4(memberPhone);
      member = await Client.create({
        firstName,
        lastName,
        phone: memberPhone,
        pinHash: await bcrypt.hash(defaultPin, 10),
        pinSetAt: new Date(),
        pinIsDefault: true,
        requiresNamePinUpgrade: true,
        managedByClientId: owner._id,
        contactPreferences: { method: 'sms', optInPromotions: false, emailDisabled: false },
      });
      created = true;
    }

    const alreadyLinked = (owner.familyLinks || []).some((link) => String(link.clientId) === String(member._id));
    if (!alreadyLinked) {
      owner.familyLinks.push({ clientId: member._id, relationship });
      await owner.save();
    }

    const reciprocal = (member.familyLinks || []).some((link) => String(link.clientId) === String(owner._id));
    if (!reciprocal) {
      member.familyLinks.push({ clientId: owner._id, relationship: 'family' });
      if (!member.managedByClientId) member.managedByClientId = owner._id;
      await member.save();
    }

    if (created) {
      setImmediate(() => {
        sendSMS('pin_changed', { clientId: safeClient(member) }, {
          messageOverride: `You were added to a Rakie Salon family account. Your temporary PIN is the last 4 digits of your phone. You will be asked to change it when you sign in.`,
        }).catch(err => console.error('[addFamilyMember] sendSMS error:', err?.message || err));
      });
    }

    return res.status(created ? 201 : 200).json({
      created,
      member: familyMemberSummary(member, relationship),
    });
  } catch (err) {
    console.error('addFamilyMember failed:', err?.message || err);
    if (err?.code === 11000) return res.status(409).json({ error: 'A client with that phone already exists.' });
    return res.status(500).json({ error: 'Could not add the family member.' });
  }
};


function isManagedDependent(ownerId, member, relationship = '') {
  const rel = String(relationship || '').trim().toLowerCase();
  const dependentRelationship = ['child', 'son', 'daughter', 'dependent', 'minor', 'ward'].includes(rel);
  return dependentRelationship || String(member?.managedByClientId || '') === String(ownerId || '');
}

exports.getFamilyOverview = async (req, res) => {
  try {
    const owner = await Client.findById(req.params.id)
      .select('firstName lastName phone familyLinks')
      .populate({
        path: 'familyLinks.clientId',
        select: 'firstName lastName phone managedByClientId assignedStylistId preferredStylistId lastStylistId',
      })
      .lean();
    if (!owner) return res.status(404).json({ error: 'Client not found' });
    if (!familyAuthMatches(owner, {}, req.query || {})) {
      return res.status(403).json({ error: 'Unable to verify this family account.' });
    }

    const people = [familyMemberSummary(owner, 'self'), ...(owner.familyLinks || [])
      .map((link) => familyMemberSummary(link.clientId, link.relationship))
      .filter(Boolean)];
    const ids = people.map((person) => person?._id).filter(Boolean);
    const Appointment = require('../../models/appointment');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const dateFloor = today.toISOString().slice(0, 10);
    const appointments = await Appointment.find({
      clientId: { $in: ids },
      status: { $in: ['pending', 'booked'] },
      date: { $gte: dateFloor },
      $or: [{ archivedAt: null }, { archivedAt: { $exists: false } }],
    }).sort({ date: 1, time: 1 }).lean();

    const byClient = new Map();
    for (const appt of appointments) {
      const key = String(appt.clientId || '');
      if (!byClient.has(key)) byClient.set(key, []);
      byClient.get(key).push(appt);
    }

    const members = people.map((person) => {
      const upcoming = byClient.get(String(person._id)) || [];
      return {
        ...person,
        canEditProfile: person.relationship === 'self' || isManagedDependent(owner._id, person, person.relationship),
        upcomingAppointments: upcoming,
        nextAppointment: upcoming[0] || null,
        pendingCount: upcoming.filter((appt) => String(appt.status).toLowerCase() === 'pending').length,
      };
    });

    return res.json({
      ownerClientId: owner._id,
      members,
      summary: {
        upcomingCount: appointments.length,
        pendingCount: appointments.filter((appt) => String(appt.status).toLowerCase() === 'pending').length,
        withoutAppointmentCount: members.filter((member) => !member.nextAppointment).length,
      },
    });
  } catch (err) {
    console.error('getFamilyOverview failed:', err?.message || err);
    return res.status(500).json({ error: 'Could not load the family overview.' });
  }
};

exports.updateFamilyMember = async (req, res) => {
  try {
    const owner = await Client.findById(req.params.id).select('firstName lastName phone familyLinks').exec();
    if (!owner) return res.status(404).json({ error: 'Client not found' });
    if (!familyAuthMatches(owner, req.body || {}, {})) {
      return res.status(403).json({ error: 'Unable to verify this family account.' });
    }
    const link = (owner.familyLinks || []).find((item) => String(item.clientId) === String(req.params.memberId));
    if (!link) return res.status(404).json({ error: 'That client is not linked to this family account.' });
    const member = await Client.findById(req.params.memberId).exec();
    if (!member) return res.status(404).json({ error: 'Family member not found.' });

    const priorRelationship = link.relationship || 'family';
    const relationship = String(req.body?.relationship || priorRelationship).trim().slice(0, 40) || 'family';
    const canEditProfile = isManagedDependent(owner._id, member, priorRelationship);
    link.relationship = relationship;
    if (canEditProfile) {
      const firstName = String(req.body?.firstName ?? member.firstName ?? '').trim();
      const lastName = String(req.body?.lastName ?? member.lastName ?? '').trim();
      if (!firstName || !lastName) return res.status(400).json({ error: 'First and last name are required.' });
      member.firstName = firstName;
      member.lastName = lastName;
      const submittedPhone = normalizePhone(req.body?.memberPhone || req.body?.phone || member.phone || '');
      if (!/^\d{10}$/.test(submittedPhone)) return res.status(400).json({ error: 'Enter a valid 10-digit phone number.' });
      const duplicate = await Client.findOne({ phone: submittedPhone, _id: { $ne: member._id } }).lean();
      if (duplicate) return res.status(409).json({ error: 'That phone number is already used by another client.' });
      member.phone = submittedPhone;
      await member.save();
    }
    await owner.save();
    return res.json({ member: familyMemberSummary(member, relationship), canEditProfile });
  } catch (err) {
    console.error('updateFamilyMember failed:', err?.message || err);
    return res.status(500).json({ error: 'Could not update the family member.' });
  }
};

exports.unlinkFamilyMember = async (req, res) => {
  try {
    const owner = await Client.findById(req.params.id).select('phone familyLinks').exec();
    if (!owner) return res.status(404).json({ error: 'Client not found' });
    if (!familyAuthMatches(owner, req.body || {}, {})) {
      return res.status(403).json({ error: 'Unable to verify this family account.' });
    }
    const before = owner.familyLinks.length;
    owner.familyLinks = owner.familyLinks.filter((item) => String(item.clientId) !== String(req.params.memberId));
    if (owner.familyLinks.length === before) return res.status(404).json({ error: 'That client is not linked to this family account.' });
    await owner.save();
    await Client.updateOne(
      { _id: req.params.memberId },
      { $pull: { familyLinks: { clientId: owner._id } } }
    );
    return res.json({ message: 'Family member unlinked. Their client account and appointment history were not deleted.' });
  } catch (err) {
    console.error('unlinkFamilyMember failed:', err?.message || err);
    return res.status(500).json({ error: 'Could not unlink the family member.' });
  }
};
