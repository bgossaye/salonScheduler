// utils/sendSMS.js
require('dotenv').config();
const twilio = require('twilio');
const { getTemplate } = require('./templates');         // DB → file resolver
const { alertOps } = require('./opsAlert');
const { normalizeUSPhone } = require('./phone');
const NotificationSetting = require('../models/notificationsetting'); // master switch
const { toCanonical, isMarketing } = require('../utils/canon');

const Appointment = require('../models/appointment');
// Try both model filenames; keep non-fatal if only one exists
let Client = null;
try { Client = require('../models/clients'); } catch {}
if (!Client) { try { Client = require('../models/client'); } catch {} }

const BOOKING_URL = 'https://rakiesalon.com/booking/';

// ---- helpers (put near top of sendSMS.js) ----
function isValidDate(d) { return d instanceof Date && !isNaN(d); }

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

  let d;
  if (cand instanceof Date) d = cand;
  else if (typeof cand === 'number') d = new Date(cand);       // ms epoch
  else if (typeof cand === 'string') d = new Date(cand);       // ISO or parseable
  return isValidDate(d) ? d : null;
}

const TZ = process.env.TZ || 'America/New_York';

function ensureDateTimeOnCtx(ctx) {
  // Try to get a Date from any of the known fields
  let d = deriveDateFromAny(ctx);

  // If no canonical start, try to build one from existing date+time strings
  if (!d && ctx.date && ctx.time) {
    const tryStart = new Date(`${ctx.date}T${ctx.time}`);
    if (!Number.isNaN(tryStart.valueOf())) d = tryStart;
  }

  if (!d) {
    console.warn('[template-populate] Missing date/time and no parseable start; tokens will remain.', {
      hasDateField: !!ctx.date, hasTimeField: !!ctx.time,
      hasStartField: !!(ctx.startTime || ctx.start || ctx.startAt || ctx.appt?.startTime)
    });
    return ctx;
  }

  // Date: "Sep 6, 2025"
  const dateFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, month: 'short', day: 'numeric', year: 'numeric'
  });

  // Time base: "5:00 pm"
  const timeBase = new Intl.DateTimeFormat('en-US', {
    timeZone: TZ, hour: 'numeric', minute: '2-digit', hour12: true
  }).format(d).toUpperCase();

  // If minutes are :00 → compress to "5:pm", else keep "5:30 pm"
  const timePretty = timeBase.includes(':00 ')
    ? timeBase.replace(':00 ', '') // "5:pm"
    : timeBase.replace(' ', '');                      // "5:30 pm"

  // Overwrite to enforce canonical display
  ctx.date = dateFmt.format(d);
  ctx.time = timePretty;
  return ctx;
}


// simple populate: replaces {token} with ctx[token]
function populate(str, data) {
  return String(str || '').replace(/\{(\w+)\}/g, (_, k) => (data[k] ?? ''));
}


function ensureBookingLink(msg) {
  const link = BOOKING_URL;
  const text = String(msg || '').trim();
  if (text.includes(link)) return text;
  return `${text} ${link}`.trim();
}

function mmToHHMM(n) {
  const hh = String(Math.floor(n / 60)).padStart(2, '0');
  const mm = String(n % 60).padStart(2, '0');
  return `${hh}:${mm}`;
}

async function hydrateAppt(appt) {
  // If we already have useful fields, keep as-is
  const hasDate = Boolean(
    appt?.date || appt?.start || appt?.startISO || appt?.startAt || appt?.startsAt
  );
  const hasTime = Boolean(
    appt?.time || appt?.startTime || appt?.slot?.time ||
    Number.isFinite(appt?.timeMinutes) || Number.isFinite(appt?.startMinutes)
  );
  if ((hasDate && hasTime) || !appt?._id) return appt;

  try {
    // Populate client + service (don’t rely on defaults; explicitly include phone)
    const fresh = await Appointment.findById(appt._id)
      .populate([
        { path: 'clientId', select: 'firstName lastName contactPreferences phone' },
        { path: 'serviceId', select: 'name duration price' }
      ])
      .lean();
    if (fresh) return { ...fresh, ...appt };
  } catch (e) {
    console.warn('[sendSMS] hydrateAppt failed:', e.message);
  }
  return appt;
}

async function hydrateApptIfNeeded(appt) {
  // Same intent as hydrateAppt; kept for call sites that pass partials
  return hydrateAppt(appt);
}

function buildTokensPassthrough(appt, extra = {}) {
  return {
    // passthrough ONLY — no parsing, no conversions
    date: extra.date ?? appt?.date ?? appt?.dateStr ?? appt?.slot?.date ?? '',
    time: extra.time ?? appt?.time ?? appt?.timeStr ?? appt?.slot?.time ?? '',
  };
}


async function ensureClientLoaded(appt) {
  const cid = appt?.clientId;
  const looksPopulated =
    cid && typeof cid === 'object' &&
    (Object.prototype.hasOwnProperty.call(cid, 'phone') ||
     Object.prototype.hasOwnProperty.call(cid, 'firstName') ||
     Object.prototype.hasOwnProperty.call(cid, 'lastName'));

  if (looksPopulated && cid.phone != null) return appt;

  // If we can and have the model, fetch the client with phone explicitly selected
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

// ---- SINGLE ENTRY POINT ----
module.exports = async function sendSMS(typeOrStatus, apptLike, extra = {}) {
  let t = null;
  let to = null;
  let payload = null;
try {
    const sid  = process.env.TWILIO_SID || process.env.TWILIO_ACCOUNT_SID;
    const auth = process.env.TWILIO_AUTH || process.env.TWILIO_AUTH_TOKEN;
    const from = process.env.TWILIO_PHONE || process.env.TWILIO_FROM;
    if (!sid || !auth || !from) {
      console.log('📴 Twilio not configured; skipping SMS');
      return;
    }
    const twilioClient = twilio(sid, auth);

    // 1) normalize event type
    const map = {
      pending: 'pending',
      booked: 'confirmation',
      confirmation: 'confirmation',
      reminder: 'reminder',
      completed: 'thankyou',
      thankyou: 'thankyou',
      canceled: 'cancellation',
      cancelation: 'cancellation', // accept old spelling as input
      cancellation: 'cancellation',
      noshow: 'noshow',
      promotion: 'promotion',
      announcement: 'announcement',
      holiday: 'holiday',
      pin_otp: 'pin_otp',
      pin_verified: 'pin_verified',
      pin_changed: 'pin_changed',
    };
    t = map[String(typeOrStatus).toLowerCase().trim()];
    if (!t) {
      await alertOps?.('sendSMS unknown type', { where: 'sendSMS', typeOrStatus });
      return;
    }

    // 2) hydrate appointment & client w/ phone
    let appt = await hydrateAppt(apptLike);
    appt = await hydrateApptIfNeeded(appt);
    appt = await ensureClientLoaded(appt);

    const clientData = (appt?.clientId && typeof appt.clientId === 'object') ? appt.clientId : null;
    if (!clientData) {
      await alertOps?.('SMS skipped: missing client', {
        where: 'sendSMS:client-missing', type: t, apptId: appt?._id || null, clientId: String(appt?.clientId || '')
      });
      return;
    }
    // 2a) master switch (global) — skip if OFF
    try {
      const setting = await NotificationSetting.getSingleton();
      if (setting && setting.masterNotificationsEnabled === false) {
        console.log('📴 SMS skipped: master switch OFF');
         return;
      }
    } catch (e) {
      console.warn('[sendSMS] master switch check failed:', e.message);
    }

    // 2b) client preference — single consent flag (optInPromotions)
    const prefs = clientData.contactPreferences || {};
    if (prefs.optInPromotions !== true) {
      console.log('📴 SMS skipped: client has not opted in (contactPreferences.optInPromotions !== true)');
      return;
    }
    // 3) resolve template (DB → file). No generic/defaults.
    let tpl;
    try {
      tpl = await getTemplate(t); // { sms, email, enabled, source }
    } catch (e) {
      await alertOps?.('Template missing for SMS', { where: 'sendSMS:template-missing', type: t, apptId: appt?._id || null, error: e.message });
      return;
    }

    // 3a) template-level enable
    if (tpl && tpl.enabled === false) {
      console.log(`📴 SMS skipped: template "${t}" disabled`);
      return;
    }

    // 4) build tokens & body
let tokens = {
  ...buildTokensPassthrough(appt, extra),

  // keep existing behavior
  clientName: ` ${clientData?.firstName ?? ''}`.trim(),
  service: appt?.serviceId?.name || appt?.service || '',
  message: extra?.message || ''
};

// Optional guardrail (recommended):
if (!tokens.date || !tokens.time) {
  console.warn('[sendSMS] Missing passthrough date/time tokens', {
    type: t,
    apptId: appt?._id,
    date: tokens.date,
    time: tokens.time,
    apptDate: appt?.date,
    apptTime: appt?.time,
    extraDate: extra?.date,
    extraTime: extra?.time
  });
}

    let body = populate(tpl.sms || '', tokens);
    body = ensureBookingLink(body);
    if (!body?.trim()) {
      await alertOps?.('Template populated empty body', { where: 'sendSMS', type: t, apptId: appt?._id || null });
      return;
    }

    // 5) normalize phone & send
    to = normalizeUSPhone(clientData.phone);

    if (!to) {
      await alertOps?.('SMS skipped: invalid phone', {
        where: 'sendSMS:invalid-phone',
        type: t, apptId: appt?._id || null, clientId: String(clientData?._id || ''), rawPhone: clientData.phone
      });
      return;
    }

// 🚧 TEMP WORKAROUND
// Do not send SMS if client has not completed name/pin upgrade
if (clientData?.requiresNamePinUpgrade === true) {
  console.log(
    '[sendSMS] SMS blocked — requiresNamePinUpgrade is still true for client:',
    clientData.phone
  );
  return {
    skipped: true,
    reason: 'requiresNamePinUpgrade=true'
  };
}
    payload = { body, from, to };
    const base = process.env.BACKEND_BASE_URL;
const isLocal = !base || /localhost|127\.0\.0\.1/i.test(base);

if (!isLocal) {
  payload.statusCallback = `${base.replace(/\/$/, '')}/api/twilio/status-callback`;
}

    //console.log(`📩 SMS final body: `, payload);
    const result = await twilioClient.messages.create(payload);
    console.log(`📩 SMS (${t}) sent to ${to}`);
    return result;
  } catch (err) {
    // Always log gracefully, even if t/to/payload weren’t set yet
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
    // Include a trimmed payload preview (masked) for debugging
    if (payload) {
      console.error('[SMS payload debug]', {
        to: mask(payload.to),
        from: mask(payload.from),
        bodyLen: (payload.body || '').length,
        hasCallback: Boolean(payload.statusCallback),
      });
    }
    await alertOps?.('sendSMS crashed', info);
    return;
  }
};
