const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const Client = require('../../models/client');
const Appointment = require('../../models/appointment');
const Otp = require('../../models/otp');
const sendSMS = require('../../utils/sendSMS');
const sendOtpSMS = require('../../utils/sendOtpSMS');

let opsAlert = async () => {};
try { ({ opsAlert } = require('../../lib/opsAlert')); } catch {/* ignore */}

function onlyDigits(s = '') { return String(s).replace(/\D/g, ''); }
function phone10(p = '') {
  const d = onlyDigits(p);
  return d.length >= 10 ? d.slice(-10) : d;
}
function last4(p = '') { return onlyDigits(p).slice(-4); }
function maskPhone(p = '') {
  const d = phone10(p);
  return d.length === 10 ? `(***) ***-${d.slice(-4)}` : '';
}
function normalizePhone(p = '') { return phone10(p); }
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
function isAdminRoute(req) {
  const url = String(req.originalUrl || req.baseUrl || '');
  return /\/api\/admin\//.test(url);
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
      : `If the code does not arrive or keeps failing, text ${PIN_HELP_KEYWORD} to ${SUPPORT.tech} and Rakie Salon will help you manually.`
  };
}

const SUPPORT = { tech: '(585) 414-6041', mgr: '(585) 957-6404' };
const SUPPORT_SMS = '5854146041';
const PIN_HELP_KEYWORD = 'RAKIE PIN';
const PIN_LOCK_MAX_ATTEMPTS = 5;
const PIN_LOCK_MINUTES = 15;
const OTP_TTL_MINUTES = 10;
const OTP_VERIFIED_TTL_MINUTES = 15;
const OTP_MAX_ATTEMPTS = 5;
const OTP_REQUESTS_PER_HOUR = 5;

const otpBuckets = new Map(); // key => { count, resetAt }

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
      }
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

exports.getClients = async (req, res) => {
  try {
    const { search, phone } = req.query;

    if (phone) {
      const p10 = phone10(phone);
      if (!p10) return res.json(null);
      const one = await Client.findOne({ phone: p10 }).lean();
      return res.json(one || null);
    }

    const rawSearch = String(search || '').trim();
    const searchDigits = onlyDigits(rawSearch);
    const query = rawSearch
      ? {
          $or: [
            { firstName: { $regex: rawSearch, $options: 'i' } },
            { lastName: { $regex: rawSearch, $options: 'i' } },
            ...(searchDigits
              ? [
                  ...(searchDigits.length >= 10 ? [{ phone: phone10(searchDigits) }] : []),
                  { phone: { $regex: searchDigits } },
                ]
              : [{ phone: { $regex: rawSearch, $options: 'i' } }]),
          ],
        }
      : {};

    const clients = await Client.find(query);
    return res.json(clients);
  } catch (err) {
    return res.status(500).json({ error: 'Server error' });
  }
};

exports.updateClient = async (req, res) => {
  try {
    const body = { ...req.body };

    if (Object.prototype.hasOwnProperty.call(body, 'requiresNamePinUpgrade')) {
      const v = body.requiresNamePinUpgrade;
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        body.requiresNamePinUpgrade = !(s === 'false' || s === '0' || s === '' || s === 'null' || s === 'undefined');
      } else {
        body.requiresNamePinUpgrade = !!v;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'nameVerifiedAt')) {
      const v = body.nameVerifiedAt;
      if (!v || v === 'null' || v === 'undefined' || v === '') {
        body.nameVerifiedAt = null;
      } else {
        const d = new Date(v);
        body.nameVerifiedAt = Number.isNaN(d.getTime()) ? null : d;
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, 'phone')) {
      body.phone = normalizePhone(body.phone);
      if (!/^\d{10}$/.test(body.phone)) {
        return res.status(400).json({ error: 'Phone must be 10 digits' });
      }
    }

    let pinChanged = false;
    if (body.pin) {
      if (!/^\d{4}$/.test(String(body.pin))) {
        return res.status(400).json({ error: 'PIN must be 4 digits' });
      }
      let pinPhone = body.phone || normalizePhone(req.body?.phone || '');
      if (!pinPhone) {
        const existingClient = await Client.findById(req.params.id).select('phone').lean();
        pinPhone = normalizePhone(existingClient?.phone || '');
      }
      if (String(body.pin) === last4(pinPhone)) {
        return res.status(400).json({ error: "PIN cannot be your phone number's last 4 digits" });
      }
      body.pinHash = await bcrypt.hash(String(body.pin), 10);
      body.pinSetAt = new Date();
      body.pinIsDefault = false;
      body.failedPinAttempts = 0;
      body.pinLockedUntil = undefined;
      pinChanged = true;
      delete body.pin;
    }

    const updated = await Client.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: 'Client not found' });

    const safe = safeClient(updated);
    res.json(safe);

    if (pinChanged) {
      const c = updated.toObject ? updated.toObject() : updated;
      setImmediate(() => {
        sendSMS('pin_changed', { clientId: c }, {
          message: 'Your PIN was updated. If you did not request this, please contact Rakie Salon.'
        }).catch(err => console.error('[updateClient] sendSMS error:', err?.message || err));
      });
    }
  } catch (err) {
    console.error('updateClient failed:', err);
    return res.status(500).json({ error: 'Server error updating client' });
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
  } catch (e) {
    console.error('loginClient error', e);
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
        ...manualPinHelpPayload(phone, 'rate_limited')
      });
    }

    const result = await issueOtpAndSend({ phone, purpose, client: existingClient || { phone } });
    if (!result.ok) {
      console.error('requestPinOtp send failed:', result.err?.message || result.err);
      try { await opsAlert('[Rakie OTP] send failed', { where: 'requestPinOtp', phone, purpose, err: String(result.err) }); } catch {}
      return res.status(502).json({
        error: 'We could not send the code right now.',
        ...manualPinHelpPayload(phone, 'send_failed')
      });
    }

    return res.json({ ok: true, purpose, ttlMins: OTP_TTL_MINUTES, maskedPhone: maskPhone(phone) });
  } catch (err) {
    console.error('requestPinOtp failed:', err);
    try { await opsAlert('[Rakie OTP] request failed', { where: 'requestPinOtp', err: String(err) }); } catch {}
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
    console.error('verifyPinOtp failed:', err);
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
    if (!client) {
      return res.status(404).json({ error: 'Client not found for this phone number.' });
    }

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
        message: 'Your Rakie Salon PIN was set successfully. Keep it private.'
      }).catch(err => console.error('[setPinWithOtp] sendSMS error:', err?.message || err));
    });
  } catch (e) {
    console.error('setPinWithOtp error:', e);
    return res.status(500).json({ error: 'Failed to set PIN' });
  }
};

exports.verifyOtpOnly = exports.verifyPinOtp;

exports.getClientDetails = async (req, res) => {
  try {
    const client = await Client.findById(req.params.id)
      .select('-pinHash -pinOtpHash -pinOtpExpires -pinOtpAttempts');

    if (!client) {
      return res.status(404).json({ error: 'Client not found' });
    }

    const lastCompletedAppointment = await Appointment.findOne({
      clientId: req.params.id,
      status: 'completed',
    })
      .sort({ date: -1, time: -1 })
      .select('date service');

    return res.json({
      _id: client._id,
      firstName: client.firstName,
      lastName: client.lastName,
      phone: client.phone,
      email: client.email,
      dob: client.dob,
      nickname: client.nickname,
      notes: client.notes,
      appointmentHistory: client.appointmentHistory,
      servicePreferences: client.servicePreferences,
      paymentInfo: client.paymentInfo,
      profilePhoto: client.profilePhoto,
      visitFrequency: client.visitFrequency,
      contactPreferences: {
        method: client.contactPreferences?.method,
        optInPromotions: client.contactPreferences?.optInPromotions === true,
        emailDisabled: client.contactPreferences?.emailDisabled === true,
      },
      lastCompletedAppointment,
    });
  } catch (err) {
    console.error('Error fetching client details:', err);
    return res.status(400).json({ error: 'Client not found' });
  }
};

exports.uploadClientPhoto = async (req, res) => {
  try {
    const filePath = `/uploads/${req.file.filename}`;
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { profilePhoto: filePath },
      { new: true }
    );
    return res.json({ url: client.profilePhoto });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to upload image' });
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
    } = req.body || {};

    const phoneDigits = normalizePhone(phone);
    if (!firstName || !lastName || !/^\d{10}$/.test(phoneDigits)) {
      return res.status(400).json({ error: 'First name, last name, and a valid 10-digit phone are required' });
    }

    const adminCreated = isAdminRoute(req);
    const suppliedPin = /^\d{4}$/.test(String(pin || '')) ? String(pin) : '';
    const defaultPin = last4(phoneDigits);
    let effectivePin = suppliedPin;
    let pinIsDefault = false;

    if (adminCreated) {
      effectivePin = suppliedPin || defaultPin;
      pinIsDefault = effectivePin === defaultPin;
    } else {
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

      if (!suppliedPin) return res.status(400).json({ error: 'PIN is required' });
      if (suppliedPin === defaultPin) {
        return res.status(400).json({ error: "PIN cannot be your phone number's last 4 digits" });
      }
      pinIsDefault = false;
    }

    const newClient = {
      firstName: String(firstName).trim(),
      lastName: String(lastName).trim(),
      phone: phoneDigits,
      ...(email && { email: String(email).trim() }),
      ...(visitFrequency && { visitFrequency }),
      ...(servicePreferences && { servicePreferences }),
      contactPreferences: {
        method: 'sms',
        optInPromotions: contactPreferences?.optInPromotions === true,
        emailDisabled: contactPreferences?.emailDisabled === true,
      },
      requiresNamePinUpgrade: Object.prototype.hasOwnProperty.call(req.body || {}, 'requiresNamePinUpgrade')
        ? !!requiresNamePinUpgrade
        : adminCreated,
      nameVerifiedAt: Object.prototype.hasOwnProperty.call(req.body || {}, 'nameVerifiedAt')
        ? (nameVerifiedAt ? new Date(nameVerifiedAt) : null)
        : (adminCreated ? null : new Date()),
      pinHash: await bcrypt.hash(String(effectivePin), 10),
      pinSetAt: new Date(),
      pinIsDefault,
      failedPinAttempts: 0,
    };

    const client = await new Client(newClient).save();
    const safe = safeClient(client);
    res.status(201).json(safe);

    setImmediate(() => {
      const clientPayload = {
        _id: client._id,
        firstName: client.firstName,
        lastName: client.lastName,
        phone: client.phone,
        contactPreferences: client.contactPreferences || {},
      };

      let messageOverride = 'Welcome to Rakie Salon! Your login PIN is ready. Keep it private.';
      if (adminCreated && pinIsDefault) {
        messageOverride = 'Welcome to Rakie Salon! Your starter PIN is the last 4 digits of your phone number. Use that PIN the next time you sign in.';
      } else if (adminCreated && suppliedPin) {
        messageOverride = 'Welcome to Rakie Salon! Your login PIN has been set by Rakie Salon. Keep it private.';
      }

      sendSMS('pin_changed', { clientId: clientPayload }, { messageOverride })
        .catch(err => console.error('[createClient] sendSMS error:', err?.message || err));
    });
  } catch (err) {
    console.error('Failed to create client:', err);
    if (err?.code === 11000) {
      return res.status(409).json({ error: 'A client with that phone or email already exists' });
    }
    return res.status(500).json({ error: 'Server error creating client' });
  }
};

exports.adminUnlockPin = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Client.findByIdAndUpdate(
      id,
      {
        $unset: { pinLockedUntil: 1 },
        $set: { failedPinAttempts: 0 },
      },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: 'Client not found' });
    return res.status(204).end();
  } catch (err) {
    console.error('adminUnlockPin error:', err);
    return res.status(500).json({ error: 'Failed to unlock PIN' });
  }
};

exports.adminResetPin = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPin } = req.body || {};
    if (!/^\d{4}$/.test(String(newPin || ''))) {
      return res.status(400).json({ error: 'newPin must be a 4-digit string' });
    }
    const updated = await Client.findById(id).exec();
    if (!updated) return res.status(404).json({ error: 'Client not found' });
    if (String(newPin) === last4(updated.phone)) {
      return res.status(400).json({ error: "PIN cannot be the phone number's last 4 digits" });
    }

    updated.pinHash = await bcrypt.hash(String(newPin), 10);
    updated.pinSetAt = new Date();
    updated.pinIsDefault = false;
    updated.failedPinAttempts = 0;
    updated.pinLockedUntil = undefined;
    await updated.save();

    res.status(204).end();

    setImmediate(() => {
      sendSMS('pin_changed', {
        clientId: {
          _id: updated._id,
          firstName: updated.firstName,
          lastName: updated.lastName,
          phone: updated.phone,
          contactPreferences: updated.contactPreferences || {},
        }
      }, {
        message: 'An admin updated your PIN. Please keep it private.'
      }).catch(err => console.error('[adminResetPin] sendSMS error:', err?.message || err));
    });
  } catch (err) {
    console.error('adminResetPin error:', err);
    return res.status(500).json({ error: 'Failed to reset PIN' });
  }
};

exports.adminSendResetOtp = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Client.findById(id).select('firstName lastName phone contactPreferences').lean();
    if (!doc) return res.status(404).json({ error: 'Client not found' });
    const phone = normalizePhone(doc.phone);
    if (!/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'Invalid client phone' });

    if (!canRequestOtp(phone, 'reset')) {
      return res.status(429).json({ error: 'Too many code requests for this client right now.' });
    }

    const result = await issueOtpAndSend({ phone, purpose: 'reset', client: { ...doc, phone } });
    if (!result.ok) {
      console.error('adminSendResetOtp failed:', result.err?.message || result.err);
      return res.status(502).json({ error: 'Failed to send reset code' });
    }

    return res.status(204).end();
  } catch (err) {
    console.error('adminSendResetOtp error:', err);
    return res.status(500).json({ error: 'Failed to send reset code' });
  }
};

exports.deleteClient = async (req, res) => {
  try {
    const { id } = req.params;
    const deletedClient = await Client.findByIdAndDelete(id);
    if (!deletedClient) {
      return res.status(404).json({ error: 'Client not found' });
    }
    return res.status(200).json({ message: 'Client deleted' });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to delete client' });
  }
};
