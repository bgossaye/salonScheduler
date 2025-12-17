const Client = require('../../models/client');
const Appointment = require('../../models/appointment');
const sendSMS = require('../../utils/sendSMS');
const sendOtpSMS = require('../../utils/sendOtpSMS');
const bcrypt = require('bcryptjs');
const Otp = require('../../models/otp');  
let opsAlert = async () => {};               
try { ({ opsAlert } = require('../../lib/opsAlert')); } catch {/*ignore*/}

function onlyDigits(s=''){ return String(s).replace(/\D/g,''); }
function phone10(p){ const d=onlyDigits(p); return d.length>=10 ? d.slice(-10) : d; }
function last4(p){ return onlyDigits(p).slice(-4); }

const SUPPORT = { tech: '(585) 414-6041', mgr: '(585) 957-6404' };
const SALON_ALERT_EMAIL = 'rakiesalon@gmail.com'; // or use opsAlert(..)

const toInt = (v, d = 0) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : d;
};

function tooManyOtpRequests(doc) {
  const count = toInt(doc.otpRequestCount, 0);
  const last  = doc.otpLastRequestedAt ? new Date(doc.otpLastRequestedAt) : null;
  const within24h = last ? (Date.now() - last.getTime()) < 24 * 60 * 60 * 1000 : false;
  // allow first 3 sends within 24h; block the 4th
  return within24h && count >= 3;
}

// --- helpers ---
const normalizePhone = (p) => onlyDigits(p).slice(-10); // last 10 digits
const safeClient = (c) => {
  const o = c.toObject ? c.toObject() : c;
  delete o.pinHash; delete o.pinOtpHash; delete o.pinOtpExpires; delete o.pinOtpAttempts;
  return o;
};

// very light in-memory throttle: 5 OTP requests / hr / phone
const otpBuckets = new Map(); // phone -> {count, resetAt}
function canRequestOtp(phone) {
  const now = Date.now();
  const hour = 60 * 60 * 1000;
  const b = otpBuckets.get(phone);
  if (!b || b.resetAt < now) { otpBuckets.set(phone, { count: 1, resetAt: now + hour }); return true; }
  if (b.count >= 5) return false;
  b.count += 1; return true;
}
// transient OTPs for phones that don't exist yet (provisional flow)
const transientOtps = new Map(); // phone -> { hash, expires, attempts }
function setTransientOtp(phone, hash, ttlMs = 10 * 60 * 1000) {
  transientOtps.set(phone, { hash, expires: Date.now() + ttlMs, attempts: 0 });
}
function getTransientOtp(phone) {
  const t = transientOtps.get(phone);
  if (!t) return null;
  if (Date.now() > t.expires) { transientOtps.delete(phone); return null; }
  return t;
}
function clearTransientOtp(phone) { transientOtps.delete(phone); }

// Get all clients with optional search
exports.getClients = async (req, res) => {
  try {
   const { search, phone } = req.query;

   // ✅ Client-facing probe: return a single client (or null)
   if (phone) {
     const p10 = String(phone).replace(/\D/g, '').slice(-10);
     if (!p10) return res.json(null);
     const one = await Client.findOne({ phone: p10 }).lean();
     return res.json(one || null);
   }

    const query = search
      ? {
          $or: [
            { firstName: { $regex: search, $options: 'i' } },
            { lastName: { $regex: search, $options: 'i' } },
            { phone: { $regex: search, $options: 'i' } },
          ],
        }
      : {};

    const clients = await Client.find(query);
    res.json(clients);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
    }

};

// Update client profile
exports.updateClient = async (req, res) => {
  try {
       const body = { ...req.body };
    // ✅ Coerce requiresNamePinUpgrade robustly
    if (Object.prototype.hasOwnProperty.call(body, 'requiresNamePinUpgrade')) {
      const v = body.requiresNamePinUpgrade;
      if (typeof v === 'string') {
        const s = v.trim().toLowerCase();
        body.requiresNamePinUpgrade = !(s === 'false' || s === '0' || s === '' || s === 'null' || s === 'undefined');
      } else {
        body.requiresNamePinUpgrade = !!v;
      }
    }

    // ✅ Coerce nameVerifiedAt robustly
    if (Object.prototype.hasOwnProperty.call(body, 'nameVerifiedAt')) {
      const v = body.nameVerifiedAt;
      if (!v || v === 'null' || v === 'undefined' || v === '') {
        body.nameVerifiedAt = null;
      } else {
        const d = new Date(v);
        body.nameVerifiedAt = Number.isNaN(d.getTime()) ? null : d;
      }
    }


       let pinChanged = false;
       if (body.pin) {
        if (!/^\d{4}$/.test(String(body.pin))) {
         return res.status(400).json({ error: 'PIN must be 4 digits' });
       }
      body.pinHash = await bcrypt.hash(String(body.pin), 10);
      body.pinSetAt = new Date();
      body.pinIsDefault = false;
      pinChanged = true;
      delete body.pin;
    }
   const updated = await Client.findByIdAndUpdate(req.params.id, body, { new: true, runValidators: true });
   if (!updated) return res.status(404).json({ error: 'Client not found' });
   const safe = updated.toObject(); delete safe.pinHash;
   res.json(safe); // respond first

   if (pinChanged) {
     const c = updated.toObject ? updated.toObject() : updated;
     setImmediate(() => {
       sendSMS('pin_changed', { clientId: c }, {
         message: 'Your PIN was updated. If you did not request this, please contact us.'
       }).catch(err => console.error('[updateClient] sendSMS error:', err?.code || '', err?.message || err));
     });
   }
  } catch (err) {
    console.error('updateClient failed:', err);
    res.status(500).json({ error: 'Server error updating client' });
  }
};

// POST /api/clients/login  { phone, pin, updateInfo? }
exports.loginClient = async (req, res) => {
  try {
    const { phone, pin, updateInfo } = req.body || {};
    const p10 = phone10(phone);
    if (p10.length !== 10) return res.status(400).json({ error: 'Phone must be 10 digits' });
    if (!/^\d{4}$/.test(String(pin||''))) return res.status(400).json({ error: 'PIN must be 4 digits' });

    const doc = await Client.findOne({ phone: p10 }).select('+pinHash').lean();
    if (!doc || !doc.pinHash) return res.status(409).json({ error: 'No PIN yet' }); // frontend will start OTP

    const ok = await bcrypt.compare(String(pin), doc.pinHash);
    const isDefault = ok && (String(pin) === last4(doc.phone)) || doc.pinIsDefault;
    if (!ok) return res.status(401).json({ error: 'Invalid phone or PIN' });

    // If default PIN or "Update my info" -> send to Intake (force set PIN on form)
    const mustChangePin = !!isDefault;
    const proceedToIntake = mustChangePin || !!updateInfo;
    const safe = { ...doc }; delete safe.pinHash;
    return res.json({ ...safe, mustChangePin, proceedToIntake });
  } catch (e) {
    console.error('loginClient error', e);
   return res.status(500).json({ error: 'Login failed' });
  }
};

// POST /api/clients/pin/request-otp  { phone }
exports.requestPinOtp = async (req, res) => {
  try {
    const raw = req.body?.phone;
    const phone = (String(raw || '').replace(/\D/g, '')).slice(-10);
    if (!phone) return res.status(400).json({ error: 'phone_required' });

    // 6-digit code, 10-min expiry
    const code = String(Math.floor(100000 + Math.random() * 900000)); // ← 6 digits
    const codeHash = await bcrypt.hash(code, 10);
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

    await Otp.findOneAndUpdate(
      { phone, purpose: 'pin_set' },
      { codeHash, attempts: 0, expiresAt },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    // ✅ use the dedicated OTP sender (handles E.164, service SID, callbacks, etc.)
    await sendOtpSMS({ phone, code, ttlMins: 10, meta: { purpose: 'pin_set' } });

    return res.status(204).end();
  } catch (err) {
    try { await opsAlert('[Rakie OTP] request failed', { where: 'requestPinOtp', err: String(err) }); } catch {}
    return res.status(500).json({ error: 'otp_request_failed' });
  }
};

exports.verifyPinOtp = async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const code = (req.body?.code || '').trim();
    if (!phone || !code) return res.status(400).json({ error: 'phone_and_code_required' });

    const otp = await Otp.findOne({ phone, purpose: 'pin_set' });
    if (!otp || otp.expiresAt <= new Date()) return res.status(400).json({ error: 'otp_expired_or_missing' });
    if (otp.attempts >= 5) return res.status(429).json({ error: 'too_many_attempts' });

    const ok = await bcrypt.compare(code, otp.codeHash);
    if (!ok) {
      await Otp.updateOne({ _id: otp._id }, { $inc: { attempts: 1 } });
      return res.status(400).json({ error: 'invalid_code' });
    }

    await Otp.deleteOne({ _id: otp._id }); // consume OTP
   // Notify: code verified
   try {
     const clientDoc = await Client.findOne({ phone }).select('+phone firstName lastName contactPreferences').lean();
     if (clientDoc) await sendSMS('pin_verified', { clientId: clientDoc });
   } catch {/*ignore*/}

    return res.status(204).end();
  } catch (err) {
    try { await opsAlert('[Rakie OTP] verify failed', { where: 'verifyPinOtp', err: String(err) }); } catch {}
    return res.status(500).json({ error: 'otp_verify_failed' });
  }
};

// POST /api/clients/pin/set { phone, otp, pin, pinConfirm }
exports.setPinWithOtp = async (req, res) => {
  try {
    const phone = normalizePhone(req.body?.phone);
    const { otp, pin } = req.body || {};

    if (!/^\d{10}$/.test(phone)) return res.status(400).json({ error: 'Phone must be 10 digits' });
    if (!/^\d{6}$/.test(String(otp||''))) return res.status(400).json({ error: 'OTP must be 6 digits' });
    if (!/^\d{4}$/.test(String(pin||''))) return res.status(400).json({ error: 'PIN must be 4 digits' });

    // Look up the OTP issued by requestPinOtp (purpose: 'pin_set')
    const rec = await Otp.findOne({ phone, purpose: 'pin_set' });
    if (!rec || rec.expiresAt <= new Date()) return res.status(410).json({ error: 'OTP expired' });

    const ok = await bcrypt.compare(String(otp), rec.codeHash);
    if (!ok) {
      await Otp.updateOne({ _id: rec._id }, { $inc: { attempts: 1 } });
try {
  const safe = safeClient(client);
  await sendSMS('pin_changed', { clientId: safe }, {
    message: 'Your PIN was set after OTP verification.'
  });
} catch { /* ignore */ }

      return res.status(401).json({ error: 'Invalid OTP' });
    }

    // Consume OTP
    await Otp.deleteOne({ _id: rec._id });

    // Create or update client with new PIN
    let client = await Client.findOne({ phone }).select('+pinHash');
    if (!client) {
      client = await Client.create({
        phone,
        firstName: 'Guest',
        lastName: phone.slice(-4),
        pinHash: await bcrypt.hash(String(pin), 10),
        pinSetAt: new Date(),
        provisional: true,
      });
    } else {
      client.pinHash = await bcrypt.hash(String(pin), 10);
      client.pinSetAt = new Date();
      client.pinIsDefault = false;
      await client.save();
    }

    const safe = safeClient(client);
try {
  const safe = safeClient(client);
  await sendSMS('pin_changed', { clientId: safe });
} catch {/*ignore*/}
    return res.json(safe);
  } catch (e) {
    console.error('setPinWithOtp error:', e);
    return res.status(500).json({ error: 'Failed to set PIN' });
  }
};

// POST /api/clients/pin/verify  { phone, otp }
exports.verifyOtpOnly = async (req, res) => {
  try {
    const p10 = phone10(req.body?.phone || '');
    const { otp } = req.body || {};
    if (p10.length !== 10) return res.status(400).json({ error: 'Phone must be 10 digits' });
    if (!/^\d{6}$/.test(String(otp||''))) return res.status(400).json({ error: 'OTP must be 6 digits' });

    const client = await Client.findOne({ phone: p10 }).select('+otpHash +otpExpiresAt otpVerifyAttempts');
    if (!client || !client.otpHash) return res.status(404).json({ error: 'No OTP pending' });
    if (client.otpVerifyAttempts >= 3) return res.status(423).json({ error: 'Too many attempts' });
    if (!client.otpExpiresAt || client.otpExpiresAt < new Date()) return res.status(410).json({ error: 'OTP expired' });

    const ok = await bcrypt.compare(String(otp), client.otpHash);
    if (!ok) {
      client.otpVerifyAttempts += 1;
      await client.save();
      return res.status(401).json({ error: 'Invalid code' });
    }
    // success → clear OTP fields; client proceeds to Intake to set PIN
    client.otpHash = undefined;
    client.otpExpiresAt = undefined;
    client.otpIssuedAt = undefined;
    client.otpVerifyAttempts = 0;
    await client.save();

    const minimal = { _id: client._id, phone: client.phone, provisional: !client.firstName };
    return res.json(minimal);
  } catch (e) {
    console.error('verifyOtpOnly error', e);
    return res.status(500).json({ error: 'OTP verify failed' });
  }
};

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

        res.json({
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
                emailDisabled: client.contactPreferences?.emailDisabled === true
            },
            lastCompletedAppointment
        });

    } catch (err) {
        console.error('Error fetching client details:', err);
        res.status(400).json({ error: 'Client not found' });
    }
};



// Upload client profile photo
exports.uploadClientPhoto = async (req, res) => {
  try {
    const filePath = `/uploads/${req.file.filename}`;
    const client = await Client.findByIdAndUpdate(
      req.params.id,
      { profilePhoto: filePath },
      { new: true }
    );
    res.json({ url: client.profilePhoto });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to upload image' });
  }
};

// Create client
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
      pin // <- NO pinConfirm here; client/UI validates that
    } = req.body;


    if (!firstName || !lastName || !phone) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Decide the effective PIN: use caller's 4-digit pin OR fallback to last4(phone)
    const hasCallerPin = /^\d{4}$/.test(String(pin || ''));
    const effectivePin  = hasCallerPin ? String(pin) : phone.slice(-4);

    const newClient = {
      firstName,
      lastName,
      phone,
      ...(email && { email: email.trim() }),
      ...(visitFrequency && { visitFrequency }),
      ...(servicePreferences && { servicePreferences }),
      ...(contactPreferences && { contactPreferences }),
      pinHash: await bcrypt.hash(effectivePin, 10),
      pinSetAt: new Date(),
      pinIsDefault: !hasCallerPin // true only when we auto-set last4
    };

    const client = await new Client(newClient).save();

    // Respond to the caller immediately
    res.status(201).json(client);

    // Fire-and-forget SMS (does not block the response)
    const msg = hasCallerPin
      ? 'Welcome to Rakie Salon! Your PIN was set successfully.'
      : 'A temporary PIN equal to the last 4 digits of your phone was set. Please change it ASAP using the link below.';
    setImmediate(() => {
      sendSMS('pin_changed', {
        clientId: {
          _id: client._id,
          firstName,
          lastName,
          phone,
          contactPreferences: client.contactPreferences || {}
        }
      }, { message: msg })
      .catch(err => console.error('[createClient] sendSMS error:', err?.code || '', err?.message || err));
    });
    return; // already sent response
  } catch (err) {
    console.error('❌ Failed to create client:', err);
    return res.status(500).json({ error: 'Server error creating client' });
  }
};


// ─────────────────────────────────────────────────────────────
// ADMIN PIN MANAGEMENT (under /api/admin/clients/:id/…)
// ─────────────────────────────────────────────────────────────

// POST /api/admin/clients/:id/pin/unlock
exports.adminUnlockPin = async (req, res) => {
  try {
    const { id } = req.params;
    const updated = await Client.findByIdAndUpdate(
      id,
      {
        $unset: {
          pinLockedUntil: 1,
          pinOtpHash: 1,
          pinOtpExpires: 1,
          pinOtpAttempts: 1,
        },
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

// PATCH /api/admin/clients/:id/pin/reset   body: { newPin: "1234" }
exports.adminResetPin = async (req, res) => {
  try {
    const { id } = req.params;
    const { newPin } = req.body || {};
    if (!/^\d{4}$/.test(String(newPin || ''))) {
      return res.status(400).json({ error: 'newPin must be a 4-digit string' });
    }
    const pinHash = await bcrypt.hash(String(newPin), 10);
    const updated = await Client.findByIdAndUpdate(
      id,
      {
        $set: {
          pinHash,
          pinSetAt: new Date(),
          failedPinAttempts: 0,
        },
        $unset: {
          pinLockedUntil: 1,
          pinOtpHash: 1,
          pinOtpExpires: 1,
          pinOtpAttempts: 1,
        },
      },
      { new: true }
    ).lean();
    if (!updated) return res.status(404).json({ error: 'Client not found' });
    res.status(204).end(); // respond first

    setImmediate(() => {
      sendSMS('pin_changed', {
        clientId: {
          _id: updated._id,
          firstName: updated.firstName,
          lastName: updated.lastName,
          phone: updated.phone,
          contactPreferences: updated.contactPreferences || {}
        }
      }, {
        message: 'An admin updated your PIN. Please change it ASAP using the link below.'
      }).catch(err => console.error('[adminResetPin] sendSMS error:', err?.code || '', err?.message || err));
    });
    return;
  } catch (err) {
    console.error('adminResetPin error:', err);
    return res.status(500).json({ error: 'Failed to reset PIN' });
  }
};

// POST /api/admin/clients/:id/pin/send-reset-otp
exports.adminSendResetOtp = async (req, res) => {
  try {
    const { id } = req.params;
    const doc = await Client.findById(id).select('phone');
    if (!doc) return res.status(404).json({ error: 'Client not found' });
    const phone10 = normalizePhone(doc.phone);
    if (!/^\d{10}$/.test(phone10)) return res.status(400).json({ error: 'Invalid client phone' });

    const code = String(Math.floor(100000 + Math.random() * 900000)); // 6-digit
    const hash = await bcrypt.hash(code, 10);
    await Client.findByIdAndUpdate(id, {
      $set: {
        pinOtpHash: hash,
        pinOtpExpires: new Date(Date.now() + 10 * 60 * 1000),
        pinOtpAttempts: 0,
      },
    });
    await sendOtpSMS({ phone: phone10, code, ttlMins: 10, meta: { reason: 'admin_reset' } });
    return res.status(204).end();
  } catch (err) {
    console.error('adminSendResetOtp error:', err);
    return res.status(500).json({ error: 'Failed to send reset OTP' });
  }
};

// Delete client
exports.deleteClient = async (req, res) => {
  try {
    const { id } = req.params;

    const deletedClient = await Client.findByIdAndDelete(id);

    if (!deletedClient) {
      return res.status(404).json({ error: 'Client not found' });
    }

    res.status(200).json({ message: 'Client deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete client' });
  }
};

