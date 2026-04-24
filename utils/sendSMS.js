require('dotenv').config();
const twilio = require('twilio');
const { getTemplate } = require('./templates');
const { alertOps } = require('./opsAlert');
const { normalizeUSPhone } = require('./phone');
const NotificationSetting = require('../models/notificationsetting');
const { isMarketing } = require('../utils/canon');
const Appointment = require('../models/appointment');

const { formatDate, formatTime } = require('./formatHelpers');

let Client = null;
try { Client = require('../models/clients'); } catch {}
if (!Client) { try { Client = require('../models/client'); } catch {} }

const BOOKING_URL = 'https://rakiesalon.com/booking/';
const AUTH_TYPES = new Set(['pin_otp', 'pin_verified', 'pin_changed']);

function populate(str, data) {
  return String(str || '').replace(/\{\{?(\w+)\}?\}/g, (_, k) => (data[k] ?? ''));
}

function ensureBookingLink(msg) {
  const text = String(msg || '').trim();
  if (!text) return text;
  if (text.includes(BOOKING_URL)) return text;
  return `${text} ${BOOKING_URL}`.trim();
}


function shouldSendAuditCopy() {
  return String(process.env.SMS_AUDIT_COPY_ENABLED || 'true').toLowerCase() !== 'false';
}

function getAuditCopyNumber() {
  return normalizeUSPhone(process.env.SMS_AUDIT_COPY_TO || '5854146041');
}

async function sendAuditCopy(twilioClient, from, body, originalTo, reason = 'copy') {
  if (!shouldSendAuditCopy()) return null;

  const auditTo = getAuditCopyNumber();
  if (!auditTo) {
    console.warn('[sendSMS] SMS audit copy skipped: invalid audit number');
    return null;
  }

  if (reason === 'copy' && auditTo === originalTo) return null;

  try {
    const result = await twilioClient.messages.create({ body, from, to: auditTo });
    console.log(`📩 SMS audit ${reason} sent to ${auditTo}`);
    return result;
  } catch (e) {
    console.warn(`[sendSMS] SMS audit ${reason} failed:`, e.message);
    await alertOps?.('SMS audit copy failed', {
      where: 'sendSMS:audit-copy',
      reason,
      originalTo,
      auditTo,
      code: e?.code || null,
      status: e?.status || null,
      message: e?.message || String(e),
    });
    return null;
  }
}

function isSixAmClockText(value) {
  const s = String(value || '').trim().toLowerCase();
  if (!s) return false;

  // Matches: 6am, 6 AM, 6:00 AM, 06:00 AM
  if (/^0?6(?::00)?\s*a\.?m\.?$/i.test(s)) return true;

  // Matches a 24-hour appointment value: 06:00
  return /^0?6:00$/.test(s);
}

function isTemporaryBlockedSixAmReminder(type, tokens) {
  if (String(process.env.SMS_BLOCK_6AM_REMINDERS_ENABLED || 'true').toLowerCase() === 'false') return false;
  return type === 'reminder' && isSixAmClockText(tokens?.time);
}


function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stripClientNameFromSMS(msg, clientData) {
  let text = String(msg || '').trim();
  if (!text) return text;

  text = text
    .replace(/\{\{?\s*clientName\s*\}?\}/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const first = String(clientData?.firstName || '').trim();
  const last = String(clientData?.lastName || '').trim();
  const full = [first, last].filter(Boolean).join(' ').trim();
  const candidates = [full, first, last].filter(Boolean);

  for (const value of candidates) {
    const escaped = escapeRegExp(value);
    text = text
      .replace(new RegExp(`^(Hi|Hello|Dear)\\s+${escaped}(?=\\s*[,!:\\-–—]|\\s|$)`, 'i'), '$1')
      .replace(new RegExp(`^${escaped}(?=\\s*[,!:\\-–—]|\\s)`, 'i'), '');
  }

  text = text
    .replace(/^Dear\b/i, 'Hi')
    .replace(/^(Hi|Hello)\s*[,!:\-–—]*\s*/i, '$1, ')
    .replace(/^([A-Za-z])\s+,\s+/,'$1, ')
    .replace(/^,\s*/, '')
    .replace(/\s+([,!.?:;])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return text;
}

async function hydrateAppt(appt) {
  const hasDate = Boolean(appt?.date || appt?.start || appt?.startISO || appt?.startAt || appt?.startsAt);
  const hasTime = Boolean(appt?.time || appt?.startTime || appt?.timeStr || appt?.slot?.time);
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

function firstNonEmpty(...values) {
  for (const value of values) {
    if (value === null || value === undefined) continue;
    const s = String(value).trim();
    if (s) return value;
  }
  return '';
}

function asValidDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function getServiceName(appt) {
  const svc = appt?.serviceId || appt?.service;
  if (svc && typeof svc === 'object') return String(svc.name || '').trim();
  return String(appt?.service || '').trim();
}

function buildTokens(appt, clientData, extra = {}) {
  const start = asValidDate(firstNonEmpty(
    extra.startTime,
    appt?.startTime,
    appt?.start,
    appt?.startISO,
    appt?.startAt,
    appt?.startsAt
  ));

  const rawDate = firstNonEmpty(extra.date, appt?.date, appt?.dateStr, appt?.slot?.date);
  const rawTime = firstNonEmpty(
    extra.time,
    appt?.time,
    appt?.timeStr,
    appt?.slot?.time
  );

  const date = start ? formatDate(start) : (formatDate(rawDate) || String(rawDate || '').trim());
  const time = start ? formatTime(start) : (formatTime(rawTime) || String(rawTime || '').trim());

  return {
    date,
    time,
    clientName: ` ${clientData?.firstName ?? ''}`.trim(),
    service: getServiceName(appt),
    message: extra?.message || '',
    otp: extra?.otp ?? '',
    ttlMins: extra?.ttlMins ?? '',
  };
}

function appointmentWhenText(tokens) {
  if (tokens.date && tokens.time) return ` on ${tokens.date} at ${tokens.time}`;
  if (tokens.date) return ` on ${tokens.date}`;
  if (tokens.time) return ` at ${tokens.time}`;
  return '';
}

function appointmentServiceText(tokens) {
  return tokens.service ? ` for ${tokens.service}` : '';
}

function cleanBrokenAppointmentText(body, type, tokens) {
  let text = String(body || '')
    .replace(/\s+([,!.?:;])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const missingDate = !tokens.date;
  const missingTime = !tokens.time;
  const missingService = !tokens.service;

  if (['pending', 'confirmation', 'reminder', 'cancellation', 'noshow'].includes(type)
      && (missingDate || missingTime || missingService)) {
    const service = appointmentServiceText(tokens);
    const when = appointmentWhenText(tokens);

    if (type === 'pending') return `Hi, we received your appointment request${service}${when}. We’ll confirm shortly.`;
    if (type === 'confirmation') return `Hi, your appointment${service}${when} is confirmed.`;
    if (type === 'reminder') {
      return (when || service)
        ? `Reminder: Your appointment${service}${when} is at Rakie Salon.`
        : 'Reminder: You have an upcoming appointment at Rakie Salon.';
    }
    if (type === 'cancellation') return `Hi, your appointment${service}${when} has been canceled.`;
    if (type === 'noshow') return `Hi, we missed you for your appointment${service}${when}. Please reschedule when ready.`;
  }

  return text
    .replace(/\bfor\s+on\s+at\b/gi, 'for')
    .replace(/\bon\s+at\s+at\b/gi, 'at')
    .replace(/\bon\s+at\b/gi, '')
    .replace(/\bat\s+at\b/gi, 'at')
    .replace(/\s+([,!.?:;])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
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
    body = stripClientNameFromSMS(body, clientData);
    body = cleanBrokenAppointmentText(body, t, tokens);
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

    if (isTemporaryBlockedSixAmReminder(t, tokens)) {
      console.warn('[sendSMS] Temporary 6 AM reminder guard: blocked client SMS and sent audit copy only', {
        type: t,
        apptId: appt?._id || null,
        to,
        time: tokens.time,
      });
      await alertOps?.('SMS blocked by temporary 6 AM reminder guard', {
        where: 'sendSMS:6am-guard',
        type: t,
        apptId: appt?._id || null,
        to,
        time: tokens.time,
      });
      return await sendAuditCopy(twilioClient, from, body, to, '6am-blocked');
    }

    const base = process.env.BACKEND_BASE_URL;
    const isLocal = !base || /localhost|127\.0\.0\.1/i.test(base);
    if (!isLocal) {
      payload.statusCallback = `${base.replace(/\/$/, '')}/api/twilio/status-callback`;
    }

    const result = await twilioClient.messages.create(payload);
    console.log(`📩 SMS (${t}) sent to ${to}`);
    await sendAuditCopy(twilioClient, from, body, to, 'copy');
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
