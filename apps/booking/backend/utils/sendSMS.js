require('dotenv').config();
const twilio = require('twilio');
const { getTemplate } = require('./templates');
const { alertOps } = require('./opsAlert');
const { normalizeUSPhone } = require('./phone');
const NotificationSetting = require('../models/notificationsetting');
const { toCanonical, isMarketing } = require('../utils/canon');
const Appointment = require('../models/appointment');
const {
  getRuntimeBoolean,
  getRuntimeString,
} = require('./runtimeSettings');

const { formatDate, formatTime, normalizeAppointmentDateTime } = require('./formatHelpers');

const Client = require('../models/client');

const DEFAULT_BOOKING_URL = 'https://rakiesalon.com/2booking';
const LEGACY_PUBLIC_BOOKING_URLS = new Set([
  'https://rakiesalon.com/booking',
  'https://rakiesalon.com/booking/',
  'https://www.rakiesalon.com/booking',
  'https://www.rakiesalon.com/booking/',
]);
const AUTH_TYPES = new Set(['pin_otp', 'pin_verified', 'pin_changed']);
const APPOINTMENT_SMS_TYPES = new Set(['pending', 'confirmation', 'reminder', 'cancellation', 'noshow']);
const SUPPORTED_SMS_TYPES = new Set([
  'pending',
  'confirmation',
  'reminder',
  'thankyou',
  'cancellation',
  'noshow',
  'promotion',
  'announcement',
  'holiday',
  'pin_otp',
  'pin_verified',
  'pin_changed',
]);

function normalizeSmsType(typeOrStatus) {
  const canonical = toCanonical(typeOrStatus);
  return SUPPORTED_SMS_TYPES.has(canonical) ? canonical : '';
}

function populate(str, data) {
  return String(str || '')
    .replace(/\{\{?\s*(\w+)\s*\}?\}/g, (_, k) => (data[k] ?? ''))
    .replace(/\[\s*(\w+)\s*\]/g, (_, k) => (data[k] ?? ''));
}

function resolveSmsBookingUrl(value) {
  const configured = String(value || '').trim();
  if (!configured || LEGACY_PUBLIC_BOOKING_URLS.has(configured)) {
    return DEFAULT_BOOKING_URL;
  }
  return configured;
}

function ensureBookingLink(msg, bookingUrl = DEFAULT_BOOKING_URL) {
  const text = String(msg || '').trim();
  const url = resolveSmsBookingUrl(bookingUrl);
  if (!text || !url) return text;
  if (text.includes(url)) return text;
  return `${text} ${url}`.trim();
}

async function getSmsRuntimeControls() {
  const auditCopyTo = await getRuntimeString('sms.auditCopy.to', process.env.SMS_AUDIT_COPY_TO || '5854146041');

  return {
    auditCopyEnabled: await getRuntimeBoolean('sms.auditCopy.enabled', String(process.env.SMS_AUDIT_COPY_ENABLED || 'true').toLowerCase() !== 'false'),
    auditCopyTo: normalizeUSPhone(auditCopyTo),
    clientDeliveryEnabled: await getRuntimeBoolean('sms.clientDelivery.enabled', String(process.env.SMS_CLIENT_DELIVERY_ENABLED || 'true').toLowerCase() !== 'false'),
    blockSixAmReminders: await getRuntimeBoolean('sms.guard.blockSixAmReminders.enabled', String(process.env.SMS_BLOCK_6AM_REMINDERS_ENABLED || 'true').toLowerCase() !== 'false'),
    blockInvalidDateTime: await getRuntimeBoolean('sms.blockIfDateTimeInvalid.enabled', String(process.env.SMS_BLOCK_INVALID_DATETIME_ENABLED || 'true').toLowerCase() !== 'false'),
    auditOnlyMode: await getRuntimeBoolean('sms.auditOnlyMode.enabled', String(process.env.SMS_AUDIT_ONLY_MODE_ENABLED || 'false').toLowerCase() === 'true'),
    reminderStrictDateTimeValidation: await getRuntimeBoolean('sms.reminder.strictDateTimeValidation.enabled', String(process.env.SMS_REMINDER_STRICT_DATETIME_VALIDATION_ENABLED || 'true').toLowerCase() !== 'false'),
    useClientName: await getRuntimeBoolean('sms.clientName.enabled', String(process.env.SMS_CLIENT_NAME_ENABLED || 'false').toLowerCase() === 'true'),
    appendBookingLink: await getRuntimeBoolean('sms.appendBookingLink.enabled', String(process.env.SMS_APPEND_BOOKING_LINK_ENABLED || 'true').toLowerCase() !== 'false'),
    bookingUrl: resolveSmsBookingUrl(await getRuntimeString('sms.bookingUrl', process.env.PUBLIC_BOOKING_URL || DEFAULT_BOOKING_URL)),
    statusCallbackEnabled: await getRuntimeBoolean('sms.statusCallback.enabled', String(process.env.SMS_STATUS_CALLBACK_ENABLED || 'true').toLowerCase() !== 'false'),
  };
}

async function sendAuditCopy(twilioClient, from, body, originalTo, reason = 'copy', runtimeControls = null) {
  const controls = runtimeControls || await getSmsRuntimeControls();
  if (!controls.auditCopyEnabled) return null;

  const auditTo = controls.auditCopyTo;
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

function isTemporaryBlockedSixAmReminder(type, tokens, runtimeControls = {}) {
  if (!runtimeControls.blockSixAmReminders) return false;
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
    .replace(/\[\s*clientName\s*\]/gi, '')
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

async function loadFreshAppointmentForSmsAudit(appt) {
  if (!appt?._id) return null;
  try {
    return await Appointment.findById(appt._id)
      .populate([
        { path: 'clientId', select: 'firstName lastName contactPreferences phone' },
        { path: 'serviceId', select: 'name duration price' },
      ])
      .lean();
  } catch (e) {
    console.warn('[sendSMS] loadFreshAppointmentForSmsAudit failed:', e.message);
    await alertOps?.('SMS DB appointment reload failed', {
      where: 'sendSMS:db-reload',
      apptId: String(appt?._id || ''),
      error: e.message,
    });
    return null;
  }
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

function firstNonEmptyEntry(entries) {
  for (const entry of entries) {
    const value = entry?.value;
    if (value === null || value === undefined) continue;
    const s = String(value).trim();
    if (s) return entry;
  }
  return { source: null, value: '' };
}

function summarizeForLog(value) {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? 'Invalid Date' : value.toISOString();
  if (typeof value === 'object') {
    if (value._id) return `{object _id=${String(value._id)}}`;
    return `{object keys=${Object.keys(value).slice(0, 8).join(',')}}`;
  }
  const s = String(value).trim();
  return s.length > 120 ? `${s.slice(0, 117)}...` : s;
}

function maskPhoneForLog(value) {
  const s = String(value || '');
  return s ? s.replace(/(\+?\d{0,6})\d+/, '$1XXXX') : '';
}

function getTokenDiagnostics(appt, extra = {}, tokens = {}) {
  const startEntry = firstNonEmptyEntry([
    { source: 'extra.startTime', value: extra.startTime },
    { source: 'appt.startTime', value: appt?.startTime },
    { source: 'appt.start', value: appt?.start },
    { source: 'appt.startISO', value: appt?.startISO },
    { source: 'appt.startAt', value: appt?.startAt },
    { source: 'appt.startsAt', value: appt?.startsAt },
  ]);
  const rawStartDate = asValidDate(startEntry.value);
  const startValid = Boolean(rawStartDate);

  const dateEntry = firstNonEmptyEntry([
    { source: 'extra.date', value: extra.date },
    { source: 'appt.date', value: appt?.date },
    { source: 'appt.dateStr', value: appt?.dateStr },
    { source: 'appt.slot.date', value: appt?.slot?.date },
  ]);

  const timeEntry = firstNonEmptyEntry([
    { source: 'extra.time', value: extra.time },
    { source: 'appt.time', value: appt?.time },
    { source: 'appt.timeMinutes', value: appt?.timeMinutes },
    { source: 'appt.timeStr', value: appt?.timeStr },
    { source: 'appt.slot.time', value: appt?.slot?.time },
  ]);

  const normalizedRawDateTime = normalizeAppointmentDateTime(dateEntry.value, timeEntry.value);
  const formattedDateFromRaw = normalizedRawDateTime.ok
    ? normalizedRawDateTime.formattedDate
    : (dateEntry.value ? formatDate(dateEntry.value) : '');
  const formattedTimeFromRaw = normalizedRawDateTime.ok
    ? normalizedRawDateTime.formattedTime
    : (timeEntry.value ? formatTime(timeEntry.value) : '');

  const issues = [];
  if (startEntry.value && !startValid) issues.push('invalid_start_datetime');
  if (!tokens.date) issues.push('missing_date_token');
  if (!tokens.time) issues.push('missing_time_token');
  if (dateEntry.value && !formattedDateFromRaw && !startValid) issues.push('invalid_date_format');
  if (timeEntry.value && !formattedTimeFromRaw && !startValid) issues.push('invalid_time_format');

  return {
    hasIssues: issues.length > 0,
    issues,
    appointment: {
      id: String(appt?._id || ''),
      status: String(appt?.status || ''),
      service: summarizeForLog(getServiceName(appt)),
      duration: summarizeForLog(appt?.duration),
    },
    client: {
      id: String((appt?.clientId && typeof appt.clientId === 'object' ? appt.clientId._id : appt?.clientId) || ''),
      phone: maskPhoneForLog(appt?.clientId && typeof appt.clientId === 'object' ? appt.clientId.phone : ''),
    },
    sources: {
      start: { source: startEntry.source, raw: summarizeForLog(startEntry.value), valid: startValid },
      date: { source: dateEntry.source, raw: summarizeForLog(dateEntry.value), formatted: formattedDateFromRaw },
      time: { source: timeEntry.source, raw: summarizeForLog(timeEntry.value), formatted: formattedTimeFromRaw },
    },
    tokens: {
      date: tokens.date || '',
      time: tokens.time || '',
      service: tokens.service || '',
    },
  };
}

async function logAppointmentDateTimeIssues(type, appt, extra, tokens, templateSource) {
  if (!APPOINTMENT_SMS_TYPES.has(type)) return null;

  const diagnostics = getTokenDiagnostics(appt, extra, tokens);
  if (!diagnostics.hasIssues) return null;

  const details = {
    where: 'sendSMS:appointment-datetime-validation',
    type,
    templateSource: templateSource || null,
    ...diagnostics,
  };

  console.warn('[sendSMS] Appointment SMS date/time validation issue', details);
  await alertOps?.('Appointment SMS date/time validation issue', details);
  return details;
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
    appt?.timeMinutes,
    appt?.timeStr,
    appt?.slot?.time
  );
  const normalized = normalizeAppointmentDateTime(rawDate, rawTime);

  const date = start
    ? formatDate(start)
    : (normalized.ok ? normalized.formattedDate : (formatDate(rawDate) || String(rawDate || '').trim()));
  const time = start
    ? formatTime(start)
    : (normalized.ok ? normalized.formattedTime : (formatTime(rawTime) || String(rawTime || '').trim()));

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


function getReminderDateTimeEntries(appt, extra = {}, dbAppt = null) {
  const db = dbAppt || null;
  const dateEntry = firstNonEmptyEntry([
    { source: 'db.date', value: db?.date },
    { source: 'db.dateStr', value: db?.dateStr },
    { source: 'db.slot.date', value: db?.slot?.date },
    { source: 'extra.date', value: extra.date },
    { source: 'appt.date', value: appt?.date },
    { source: 'appt.dateStr', value: appt?.dateStr },
    { source: 'appt.slot.date', value: appt?.slot?.date },
  ]);

  const timeEntry = firstNonEmptyEntry([
    { source: 'db.time', value: db?.time },
    { source: 'db.timeMinutes', value: db?.timeMinutes },
    { source: 'db.timeStr', value: db?.timeStr },
    { source: 'db.slot.time', value: db?.slot?.time },
    { source: 'extra.time', value: extra.time },
    { source: 'appt.time', value: appt?.time },
    { source: 'appt.timeMinutes', value: appt?.timeMinutes },
    { source: 'appt.timeStr', value: appt?.timeStr },
    { source: 'appt.slot.time', value: appt?.slot?.time },
  ]);

  return { dateEntry, timeEntry };
}

async function applyReminderChronologyGuard(type, appt, extra = {}, tokens = {}, options = {}) {
  if (type !== 'reminder') return { tokens, details: null, blockClient: false };

  const dbAppt = options.dbAppt || null;
  const strict = options.strict !== false;
  const { dateEntry, timeEntry } = getReminderDateTimeEntries(appt, extra, dbAppt);
  const dbReloaded = Boolean(dbAppt?._id);
  const rawNormalized = normalizeAppointmentDateTime(dateEntry.value, timeEntry.value);
  const issues = [];

  if (!dbReloaded && appt?._id) issues.push('db_reload_unavailable');
  if (!dateEntry.value) issues.push('missing_raw_reminder_date');
  if (!timeEntry.value) issues.push('missing_raw_reminder_time');
  if ((dateEntry.value || timeEntry.value) && !rawNormalized.ok) issues.push('invalid_raw_reminder_datetime');

  if (!rawNormalized.ok || (strict && !dbReloaded && appt?._id)) {
    const details = {
      where: 'sendSMS:reminder-chronology-guard',
      action: strict ? 'block_client_send_audit_only' : 'using_generic_reminder_fallback',
      issues,
      strict,
      appointment: {
        id: String(appt?._id || ''),
        status: String(appt?.status || ''),
      },
      receivedFromDb: dbReloaded,
      received: {
        date: { source: dateEntry.source, raw: summarizeForLog(dateEntry.value) },
        time: { source: timeEntry.source, raw: summarizeForLog(timeEntry.value) },
        normalized: rawNormalized,
      },
    };
    console.warn('[sendSMS] Reminder date/time rejected before client send', details);
    await alertOps?.(strict ? 'Reminder SMS blocked: invalid DB date/time' : 'Reminder SMS using generic fallback: invalid date/time', details);
    return { tokens: { ...tokens, date: '', time: '' }, details, blockClient: strict };
  }

  const proposedTokens = {
    ...tokens,
    date: rawNormalized.formattedDate,
    time: rawNormalized.formattedTime,
  };

  // Independent chronological comparison:
  // 1) stored DB/raw date+time -> normalized key
  // 2) prepared outgoing SMS date+time -> normalized key
  // If formatting changes the actual calendar day or clock time, block client delivery.
  const outgoingNormalized = normalizeAppointmentDateTime(proposedTokens.date, proposedTokens.time);
  if (!outgoingNormalized.ok || outgoingNormalized.key !== rawNormalized.key) {
    const details = {
      where: 'sendSMS:reminder-chronology-guard',
      action: strict ? 'block_client_send_audit_only' : 'using_generic_reminder_fallback',
      issues: ['reminder_datetime_chronology_mismatch'],
      strict,
      appointment: {
        id: String(appt?._id || ''),
        status: String(appt?.status || ''),
      },
      receivedFromDb: dbReloaded,
      received: {
        date: { source: dateEntry.source, raw: summarizeForLog(dateEntry.value) },
        time: { source: timeEntry.source, raw: summarizeForLog(timeEntry.value) },
        normalized: rawNormalized,
      },
      outgoing: {
        date: proposedTokens.date,
        time: proposedTokens.time,
        normalized: outgoingNormalized,
      },
      comparison: {
        storedKey: rawNormalized.key,
        outgoingKey: outgoingNormalized.key || '',
        matched: outgoingNormalized.key === rawNormalized.key,
      },
    };
    console.warn('[sendSMS] Reminder date/time chronology mismatch before client send', details);
    await alertOps?.(strict ? 'Reminder SMS blocked: chronology mismatch' : 'Reminder SMS using generic fallback: chronology mismatch', details);
    return { tokens: strict ? { ...tokens, date: '', time: '' } : proposedTokens, details, blockClient: strict };
  }

  return {
    tokens: proposedTokens,
    details: {
      where: 'sendSMS:reminder-chronology-guard',
      action: 'specific_reminder_datetime_approved',
      strict,
      appointment: {
        id: String(appt?._id || ''),
        status: String(appt?.status || ''),
      },
      receivedFromDb: dbReloaded,
      received: {
        date: { source: dateEntry.source, raw: summarizeForLog(dateEntry.value) },
        time: { source: timeEntry.source, raw: summarizeForLog(timeEntry.value) },
        normalized: rawNormalized,
      },
      outgoing: {
        date: proposedTokens.date,
        time: proposedTokens.time,
        normalized: outgoingNormalized,
      },
      comparison: {
        storedKey: rawNormalized.key,
        outgoingKey: outgoingNormalized.key,
        matched: true,
      },
    },
    blockClient: false,
  };
}


function logReminderTimeComparison(type, appt, guardDetails, action, meta = {}) {
  if (type !== 'reminder' || !guardDetails) return null;

  const received = guardDetails.received || {};
  const outgoing = guardDetails.outgoing || {};
  const comparison = guardDetails.comparison || {};
  const clientId = appt?.clientId && typeof appt.clientId === 'object'
    ? appt.clientId._id
    : appt?.clientId;

  const record = {
    where: 'sendSMS:reminder-time-comparison',
    appointmentId: String(appt?._id || guardDetails.appointment?.id || ''),
    clientId: String(clientId || ''),
    sourceDateFromDb: received.date?.raw || '',
    sourceDateField: received.date?.source || '',
    sourceTimeFromDb: received.time?.raw || '',
    sourceTimeField: received.time?.source || '',
    normalizedDbStart: received.normalized?.key || '',
    smsRenderedDate: outgoing.date || '',
    smsRenderedTime: outgoing.time || '',
    normalizedSmsStart: outgoing.normalized?.key || '',
    matched: comparison.matched === true,
    action,
    strict: guardDetails.strict === true,
    issues: Array.isArray(guardDetails.issues) ? guardDetails.issues : [],
    blockedReason: meta.blockedReason || null,
  };

  console.log('[sendSMS] Reminder time comparison', record);
  return record;
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

function reminderSpecificText(tokens) {
  const clientName = String(tokens?.clientName || '').trim();
  const greeting = clientName ? `Hi ${clientName}, this is` : 'Hi, this is';
  const service = tokens?.service
    ? `for your ${String(tokens.service).trim()}`
    : 'for your appointment';
  const when = appointmentWhenText(tokens);

  return `${greeting} a reminder from Rakie Salon ${service}${when}`
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function reminderFallbackText(tokens) {
  const clientName = String(tokens?.clientName || '').trim();
  const greeting = clientName ? `Hi ${clientName}, this is` : 'Hi, this is';
  const service = tokens?.service
    ? `for your ${String(tokens.service).trim()}`
    : 'for your appointment';
  const windowText = String(tokens?.reminderWindow || '').trim().toLowerCase();

  if (windowText === 'tomorrow') {
    return `${greeting} a reminder from Rakie Salon ${service} tomorrow.`
      .replace(/\s{2,}/g, ' ')
      .trim();
  }

  return `${greeting} a reminder from Rakie Salon ${service}.`
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function polishReminderText(body, type, tokens) {
  if (type !== 'reminder') return body;

  const text = String(body || '').trim();
  if (!text || !/\breminder\b/i.test(text)) return text;

  // If we have a trustworthy appointment date and time, standardize the reminder sentence.
  // This protects outbound SMS even when an older DB template says things like
  // "Hi, this a reminder for ..." or "Reminder: {{service}} on ... at Rakie Salon."
  if (tokens?.date && tokens?.time) {
    return reminderSpecificText(tokens);
  }

  return reminderFallbackText(tokens);
}

function cleanBrokenAppointmentText(body, type, tokens) {
  let text = String(body || '')
    .replace(/\s+([,!.?:;])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();

  const missingDate = !tokens.date;
  const missingTime = !tokens.time;
  const missingService = !tokens.service;

  if (APPOINTMENT_SMS_TYPES.has(type)
      && (missingDate || missingTime || missingService)) {
    const service = appointmentServiceText(tokens);
    const when = appointmentWhenText(tokens);

    if (type === 'pending') return `Hi, we received your appointment request${service}${when}. We’ll confirm shortly.`;
    if (type === 'confirmation') return `Hi, your appointment${service}${when} is confirmed.`;
    if (type === 'reminder') {
      if (missingDate || missingTime) return reminderFallbackText(tokens);
      return reminderSpecificText(tokens);
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
    const runtimeControls = await getSmsRuntimeControls();

    t = normalizeSmsType(typeOrStatus);
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

    const dbApptForSmsAudit = t === 'reminder'
      ? await loadFreshAppointmentForSmsAudit(appt)
      : null;

    let tokens = buildTokens(appt, clientData, extra);
    const reminderChronologyGuard = await applyReminderChronologyGuard(t, appt, extra, tokens, {
      dbAppt: dbApptForSmsAudit,
      strict: runtimeControls.reminderStrictDateTimeValidation,
    });
    tokens = reminderChronologyGuard.tokens;
    const dateTimeIssues = await logAppointmentDateTimeIssues(t, appt, extra, tokens, tpl?.source);

    const tokensForBody = runtimeControls.useClientName
      ? tokens
      : { ...tokens, clientName: '' };
    let body = (typeof extra?.messageOverride === 'string' && extra.messageOverride.trim())
      ? extra.messageOverride.trim()
      : populate(tpl.sms || '', tokensForBody);
    if (!runtimeControls.useClientName) {
      body = stripClientNameFromSMS(body, clientData);
    }
    body = cleanBrokenAppointmentText(body, t, tokensForBody);
    body = polishReminderText(body, t, tokensForBody);
    if (!AUTH_TYPES.has(t) && runtimeControls.appendBookingLink) {
      body = ensureBookingLink(body, runtimeControls.bookingUrl);
    }
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

    if (!AUTH_TYPES.has(t) && runtimeControls.clientDeliveryEnabled === false) {
      console.warn('[sendSMS] Client SMS delivery disabled: blocked client SMS and sent audit copy only', {
        type: t,
        apptId: appt?._id || null,
        to,
      });
      await alertOps?.('SMS blocked: client delivery disabled', {
        where: 'sendSMS:client-delivery-disabled',
        type: t,
        apptId: appt?._id || null,
        to,
      });
      logReminderTimeComparison(t, appt, reminderChronologyGuard.details, 'blocked_audit_only', { blockedReason: 'client_delivery_off' });
      return await sendAuditCopy(twilioClient, from, body, to, 'client-delivery-off', runtimeControls);
    }

    if (reminderChronologyGuard.blockClient) {
      console.warn('[sendSMS] Strict reminder date/time validation blocked client SMS and sent audit copy only', {
        type: t,
        apptId: appt?._id || null,
        to,
        issues: reminderChronologyGuard.details?.issues || [],
      });
      await alertOps?.('SMS blocked: strict reminder date/time validation', {
        where: 'sendSMS:strict-reminder-datetime-block',
        type: t,
        apptId: appt?._id || null,
        to,
        details: reminderChronologyGuard.details || null,
      });
      logReminderTimeComparison(t, appt, reminderChronologyGuard.details, 'blocked_audit_only', { blockedReason: 'strict_datetime_validation' });
      return await sendAuditCopy(twilioClient, from, body, to, 'strict-reminder-datetime-blocked', runtimeControls);
    }

    if (isTemporaryBlockedSixAmReminder(t, tokens, runtimeControls)) {
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
      logReminderTimeComparison(t, appt, reminderChronologyGuard.details, 'blocked_audit_only', { blockedReason: 'six_am_guard' });
      return await sendAuditCopy(twilioClient, from, body, to, '6am-blocked', runtimeControls);
    }

    if (!AUTH_TYPES.has(t) && runtimeControls.blockInvalidDateTime && dateTimeIssues) {
      console.warn('[sendSMS] Runtime guard blocked client SMS because appointment date/time tokens are invalid', {
        type: t,
        apptId: appt?._id || null,
        to,
        issues: dateTimeIssues.issues || [],
      });
      await alertOps?.('SMS blocked: invalid appointment date/time', {
        where: 'sendSMS:invalid-datetime-runtime-guard',
        type: t,
        apptId: appt?._id || null,
        to,
        issues: dateTimeIssues.issues || [],
      });
      logReminderTimeComparison(t, appt, reminderChronologyGuard.details, 'blocked_audit_only', { blockedReason: 'invalid_datetime_tokens' });
      return await sendAuditCopy(twilioClient, from, body, to, 'invalid-datetime-blocked', runtimeControls);
    }

    if (!AUTH_TYPES.has(t) && runtimeControls.auditOnlyMode) {
      console.warn('[sendSMS] Audit-only mode enabled: blocked client SMS and sent audit copy only', {
        type: t,
        apptId: appt?._id || null,
        to,
      });
      logReminderTimeComparison(t, appt, reminderChronologyGuard.details, 'blocked_audit_only', { blockedReason: 'legacy_audit_only_mode' });
      return await sendAuditCopy(twilioClient, from, body, to, 'audit-only', runtimeControls);
    }

    const base = process.env.BACKEND_BASE_URL;
    const isLocal = !base || /localhost|127\.0\.0\.1/i.test(base);
    if (runtimeControls.statusCallbackEnabled && !isLocal) {
      payload.statusCallback = `${base.replace(/\/$/, '')}/api/twilio/status-callback`;
    }

    const result = await twilioClient.messages.create(payload);
    console.log(`📩 SMS (${t}) sent to ${to}`);
    logReminderTimeComparison(t, appt, reminderChronologyGuard.details, 'sent_to_client');
    await sendAuditCopy(twilioClient, from, body, to, 'copy', runtimeControls);
    return result;
  } catch (err) {
    const info = {
      where: 'sendSMS:catch',
      typeAsked: typeOrStatus,
      type: t || null,
      to: maskPhoneForLog(to),
      code: err?.code || null,
      status: err?.status || null,
      moreInfo: err?.moreInfo || null,
      message: err?.message || String(err),
    };
    console.error('❌ sendSMS error', info);
    if (payload) {
      console.error('[SMS payload debug]', {
        to: maskPhoneForLog(payload.to),
        from: maskPhoneForLog(payload.from),
        bodyLen: (payload.body || '').length,
        hasCallback: Boolean(payload.statusCallback),
      });
    }
    await alertOps?.('sendSMS crashed', info);
    throw err;
  }
};
