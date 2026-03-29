require('dotenv').config();
const twilio = require('twilio');
const { getTemplate } = require('./templates');
const { alertOps } = require('./opsAlert');
const { normalizeUSPhone } = require('./phone');
const NotificationSetting = require('../models/notificationsetting');
const { isMarketing } = require('../utils/canon');
const Appointment = require('../models/appointment');

let Client = null;
try { Client = require('../models/clients'); } catch {}
if (!Client) { try { Client = require('../models/client'); } catch {} }

const BOOKING_URL = 'https://rakiesalon.com/booking/';
const AUTH_TYPES = new Set(['pin_otp', 'pin_verified', 'pin_changed']);
const TZ = process.env.TZ || 'America/New_York';

function pickFirst(...vals) {
  for (const v of vals) if (v != null && v !== '') return v;
  return undefined;
}

function deriveDateFromAny(obj) {
  const cand = pickFirst(
    obj?.startTime, obj?.start, obj?.startAt, obj?.dateTime, obj?.datetime,
    obj?.start_date, obj?.startTimestamp, obj?.when, obj?.ts,
    obj?.appt?.startTime, obj?.appt?.start, obj?.appointment?.startTime
  );
  if (!cand) return null;
  const d = cand instanceof Date ? cand : new Date(cand);
  return Number.isNaN(d?.valueOf?.()) ? null : d;
}

function to12Hour(time24) {
  if (!time24) return time24;
  const m = String(time24).trim().match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!m) return time24;
  let hour = parseInt(m[1], 10);
  const minute = m[2];
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12;
  if (hour === 0) hour = 12;
  return `${hour}:${minute} ${ampm}`;
}

function populate(str, data) {
  return String(str || '').replace(/\{\{?(\w+)\}?\}/g, (_, k) => (data[k] ?? ''));
}

function ensureBookingLink(msg) {
  const text = String(msg || '').trim();
  if (!text) return text;
  if (text.includes(BOOKING_URL)) return text;
  return `${text} ${BOOKING_URL}`.trim();
}

async function hydrateAppt(appt) {
  const hasDate = Boolean(appt?.date || appt?.start || appt?.startISO || appt?.startAt || appt?.startsAt);
  const hasTime = Boolean(
    appt?.time || appt?.startTime || appt?.slot?.time ||
    Number.isFinite(appt?.timeMinutes) || Number.isFinite(appt?.startMinutes)
  );
  if ((hasDate && hasTime) || !appt?._id) return appt;

  try {
    const fresh = await Appointment.findById(appt._id)
      .populate([
        { path: 'clientId', select: 'firstName lastName contactPreferences phone' },
        { path: 'serviceId', select: 'name duration price' },
      ])
      .lean();
    if (fresh) return { ...fresh, ...appt };
  } catch (e) {
    console.warn('[sendSMS] hydrateAppt failed:', e.message);
  }
  return appt;
}

async function ensureClientLoaded(appt) {
  const cid = appt?.clientId;
  const looksPopulated =
    cid && typeof cid === 'object' &&
    (Object.prototype.hasOwnProperty.call(cid, 'phone') ||
      Object.prototype.hasOwnProperty.call(cid, 'firstName') ||
      Object.prototype.hasOwnProperty.call(cid, 'lastName'));

  if (looksPopulated && cid.phone != null) return appt;

  try {
    if (Client) {
      const id = (cid && typeof cid === 'object' && cid._id) ? cid._id : cid;
      if (id) {
        const doc = await Client.findById(id)
          .select('firstName lastName contactPreferences phone')
          .lean();
        if (doc) return { ...appt, clientId: doc };
      }
    }
  } catch (e) {
    console.warn('[sendSMS] ensureClientLoaded failed:', e.message);
  }
  return appt;
}

function buildTokens(appt, clientData, extra = {}) {
  const derivedDate = deriveDateFromAny({ ...appt, ...extra });

  let date = extra.date ?? appt?.date ?? appt?.dateStr ?? appt?.slot?.date ?? '';
  let time = extra.time ?? appt?.time ?? appt?.timeStr ?? appt?.slot?.time ?? '';

  if (derivedDate) {
    date = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(derivedDate);

    time = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(derivedDate).replace(' ', '');
  } else {
    time = to12Hour(time);
  }

  return {
    date,
    time,
    clientName: ` ${clientData?.firstName ?? ''}`.trim(),
    service: appt?.serviceId?.name || appt?.service || '',
    message: extra?.message || '',
    otp: extra?.otp ?? '',
    ttlMins: extra?.ttlMins ?? '',
  };
}

module.exports = async function sendSMS(typeOrStatus, apptLike, extra = {}) {
  let t = null;
  let to = null;
  let payload = null;

  try {
    const sid = process.env.TWILIO_SID || process.env.TWILIO_ACCOUNT_SID;
    const auth = process.env.TWILIO_AUTH || process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE || process.env.TWILIO_FROM;
    if (!sid || !auth || !from) {
      console.log('📴 Twilio not configured; skipping SMS');
      return;
    }
    const twilioClient = twilio(sid, auth);

    const map = {
      pending: 'pending',
      booked: 'confirmation',
      confirmation: 'confirmation',
      reminder: 'reminder',
      completed: 'thankyou',
      thankyou: 'thankyou',
      canceled: 'cancellation',
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
    t = map[String(typeOrStatus || '').toLowerCase().trim()];
    if (!t) {
      await alertOps?.('sendSMS unknown type', { where: 'sendSMS', typeOrStatus });
      return;
    }

    let appt = await hydrateAppt(apptLike || {});
    appt = await ensureClientLoaded(appt);

    const clientData = (appt?.clientId && typeof appt.clientId === 'object') ? appt.clientId : null;
    if (!clientData) {
      await alertOps?.('SMS skipped: missing client', {
        where: 'sendSMS:client-missing',
        type: t,
        apptId: appt?._id || null,
        clientId: String(appt?.clientId || ''),
      });
      return;
    }

    try {
      const setting = await NotificationSetting.getSingleton();
      if (setting && setting.masterNotificationsEnabled === false && !AUTH_TYPES.has(t)) {
        console.log('📴 SMS skipped: master switch OFF');
        return;
      }
    } catch (e) {
      console.warn('[sendSMS] master switch check failed:', e.message);
    }

    const prefs = clientData.contactPreferences || {};
    if (isMarketing(t) && prefs.optInPromotions !== true) {
      console.log('📴 SMS skipped: client has not opted in for marketing messages');
      return;
    }

    let tpl;
    try {
      tpl = await getTemplate(t);
    } catch (e) {
      await alertOps?.('Template missing for SMS', {
        where: 'sendSMS:template-missing',
        type: t,
        apptId: appt?._id || null,
        error: e.message,
      });
      return;
    }

    if (tpl && tpl.enabled === false) {
      console.log(`📴 SMS skipped: template "${t}" disabled`);
      return;
    }

    const tokens = buildTokens(appt, clientData, extra);
    let body = (typeof extra?.messageOverride === 'string' && extra.messageOverride.trim())
      ? extra.messageOverride.trim()
      : populate(tpl.sms || '', tokens);
    if (!AUTH_TYPES.has(t)) body = ensureBookingLink(body);
    if (!body?.trim()) {
      await alertOps?.('Template populated empty body', { where: 'sendSMS', type: t, apptId: appt?._id || null });
      return;
    }

    to = normalizeUSPhone(clientData.phone);
    if (!to) {
      await alertOps?.('SMS skipped: invalid phone', {
        where: 'sendSMS:invalid-phone',
        type: t,
        apptId: appt?._id || null,
        clientId: String(clientData?._id || ''),
        rawPhone: clientData.phone,
      });
      return;
    }

    payload = { body, from, to };
    const base = process.env.BACKEND_BASE_URL;
    const isLocal = !base || /localhost|127\.0\.0\.1/i.test(base);
    if (!isLocal) {
      payload.statusCallback = `${base.replace(/\/$/, '')}/api/twilio/status-callback`;
    }

    const result = await twilioClient.messages.create(payload);
    console.log(`📩 SMS (${t}) sent to ${to}`);
    return result;
  } catch (err) {
    const mask = v => (typeof v === 'string' ? v.replace(/(\+?\d{0,6})\d+/, '$1XXXX') : v);
    const info = {
      where: 'sendSMS:catch',
      typeAsked: typeOrStatus,
      type: t || null,
      to: mask(to),
      code: err?.code || null,
      status: err?.status || null,
      moreInfo: err?.moreInfo || null,
      message: err?.message || String(err),
    };
    console.error('❌ sendSMS error', info);
    if (payload) {
      console.error('[SMS payload debug]', {
        to: mask(payload.to),
        from: mask(payload.from),
        bodyLen: (payload.body || '').length,
        hasCallback: Boolean(payload.statusCallback),
      });
    }
    await alertOps?.('sendSMS crashed', info);
    throw err;
  }
};
