const RuntimeSetting = require('../models/runtimesetting');

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map();


function envBool(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  return !['false', '0', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

function envString(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  return String(raw);
}

function envNumber(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === null || raw === '') return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

const DEFAULT_RUNTIME_SETTINGS = [
  {
    key: 'sms.auditCopy.enabled',
    type: 'boolean',
    group: 'SMS Safety',
    label: 'Send SMS audit copy',
    description: 'Sends a copy of each outgoing SMS to the audit phone number for temporary monitoring/debugging.',
    defaultValue: envBool('SMS_AUDIT_COPY_ENABLED', true),
  },
  {
    key: 'sms.auditCopy.to',
    type: 'string',
    group: 'SMS Safety',
    label: 'SMS audit copy phone',
    description: 'Phone number that receives audit copies and blocked-SMS debug copies.',
    defaultValue: envString('SMS_AUDIT_COPY_TO', '5854146041'),
  },
  {
    key: 'sms.clientDelivery.enabled',
    type: 'boolean',
    group: 'SMS Safety',
    label: 'Send SMS to clients',
    description: 'Master delivery switch for non-auth customer SMS. When OFF, appointment, reminder, promotion, and announcement SMS are blocked from clients but still sent to the audit number when audit copy is ON. PIN/OTP auth SMS still send so login and recovery continue working.',
    defaultValue: envBool('SMS_CLIENT_DELIVERY_ENABLED', true),
  },
  {
    key: 'sms.guard.blockSixAmReminders.enabled',
    type: 'boolean',
    group: 'SMS Safety',
    label: 'Block 6 AM client reminders',
    description: 'Temporary safety guard: reminder SMS with a 6 AM appointment time is sent only to audit copy, not to the client.',
    defaultValue: envBool('SMS_BLOCK_6AM_REMINDERS_ENABLED', true),
    isAdvanced: true,
  },
  {
    key: 'sms.blockIfDateTimeInvalid.enabled',
    type: 'boolean',
    group: 'SMS Safety',
    label: 'Block client SMS when date/time is invalid',
    description: 'If an appointment SMS has missing or invalid date/time tokens, send audit-only instead of sending the client a bad message.',
    defaultValue: envBool('SMS_BLOCK_INVALID_DATETIME_ENABLED', true),
    isAdvanced: true,
  },
  {
    key: 'sms.auditOnlyMode.enabled',
    type: 'boolean',
    group: 'SMS Safety',
    label: 'Audit-only SMS mode',
    description: 'Legacy debug mode kept for compatibility: do not send non-auth SMS to clients; send the would-be message only to the audit copy number. Prefer the clearer Send SMS to clients switch for daily debugging.',
    defaultValue: envBool('SMS_AUDIT_ONLY_MODE_ENABLED', false),
    isAdvanced: true,
  },
  {
    key: 'sms.reminder.strictDateTimeValidation.enabled',
    type: 'boolean',
    group: 'SMS Safety',
    label: 'Strict reminder date/time validation',
    description: 'For reminder SMS, reload the appointment from MongoDB, independently normalize the stored date/time and the prepared outgoing SMS date/time, and block client delivery if they do not match exactly.',
    defaultValue: envBool('SMS_REMINDER_STRICT_DATETIME_VALIDATION_ENABLED', true),
    isAdvanced: true,
  },
  {
    key: 'sms.clientName.enabled',
    type: 'boolean',
    group: 'SMS Content',
    label: 'Use client name in SMS',
    description: 'Controls whether SMS templates may include the client name. When disabled, {{clientName}}, [clientName], and any populated client name are removed from outgoing SMS while email templates are unchanged.',
    defaultValue: envBool('SMS_CLIENT_NAME_ENABLED', false),
  },
  {
    key: 'sms.appendBookingLink.enabled',
    type: 'boolean',
    group: 'SMS Content',
    label: 'Append booking link to non-auth SMS',
    description: 'Adds the public booking link to appointment, promotion, announcement, and other non-PIN messages.',
    defaultValue: envBool('SMS_APPEND_BOOKING_LINK_ENABLED', true),
  },
  {
    key: 'sms.bookingUrl',
    type: 'string',
    group: 'SMS Content',
    label: 'Booking link used in SMS',
    description: 'SMS-only compact-preview URL appended to outgoing non-auth SMS. It redirects customers to the regular booking page without changing website or social previews.',
    defaultValue: envString('PUBLIC_BOOKING_URL', 'https://rakiesalon.com/2booking'),
  },
  {
    key: 'sms.statusCallback.enabled',
    type: 'boolean',
    group: 'SMS Safety',
    label: 'Enable Twilio status callback',
    description: 'When enabled and BACKEND_BASE_URL is production, Twilio receives delivery status callback events.',
    defaultValue: envBool('SMS_STATUS_CALLBACK_ENABLED', true),
    isAdvanced: true,
  },
  {
    key: 'systemErrors.activeLimit',
    type: 'number',
    group: 'System Errors',
    label: 'Active unresolved error limit',
    description: 'Maximum number of unresolved unique error fingerprints to keep. New repeated errors are grouped; older unresolved rows beyond this cap are deleted during pruning.',
    defaultValue: envNumber('SYSTEM_ERROR_ACTIVE_LIMIT', 150),
    isAdvanced: true,
  },
  {
    key: 'systemErrors.resolvedLimit',
    type: 'number',
    group: 'System Errors',
    label: 'Resolved history limit',
    description: 'Maximum number of resolved historical error rows to keep after pruning.',
    defaultValue: envNumber('SYSTEM_ERROR_RESOLVED_LIMIT', 40),
    isAdvanced: true,
  },
  {
    key: 'systemErrors.resolvedRetentionDays',
    type: 'number',
    group: 'System Errors',
    label: 'Resolved retention days',
    description: 'Resolved error history older than this many days is deleted during pruning.',
    defaultValue: envNumber('SYSTEM_ERROR_RESOLVED_RETENTION_DAYS', 14),
    isAdvanced: true,
  },
  {
    key: 'systemErrors.pruneIntervalMs',
    type: 'number',
    group: 'System Errors',
    label: 'Prune interval milliseconds',
    description: 'Minimum time between automatic system-error pruning runs. Default 600000 equals 10 minutes.',
    defaultValue: envNumber('SYSTEM_ERROR_PRUNE_INTERVAL_MS', 600000),
    isAdvanced: true,
  },
  {
    key: 'staff.portalBaseUrl',
    type: 'string',
    group: 'Staff Access',
    label: 'Staff portal base URL',
    description: 'Base URL used for worker invite and password reset links. Production usually looks like https://rakiesalon.com/booking.',
    defaultValue: envString('STAFF_PORTAL_BASE_URL', 'https://rakiesalon.com/booking'),
    isAdvanced: true,
  },
  {
    key: 'booking.online.enabled',
    type: 'boolean',
    group: 'Booking Controls',
    label: 'Online booking enabled',
    description: 'Reserved switch for the next phase: can be used to temporarily disable customer online booking while keeping the salon open.',
    defaultValue: envBool('ONLINE_BOOKING_ENABLED', true),
  },
  {
    key: 'booking.online.disabledMessage',
    type: 'string',
    group: 'Booking Controls',
    label: 'Online booking disabled message',
    description: 'Message to show customers when online booking is temporarily disabled.',
    defaultValue: envString('ONLINE_BOOKING_DISABLED_MESSAGE', 'Online booking is temporarily unavailable. Please call Rakie Salon to schedule.'),
  },
  {
    key: 'booking.shopMode',
    type: 'string',
    group: 'Booking Controls',
    label: 'Shop stylist mode',
    description: 'Auto hides stylist choices and multi-stylist scheduling when only one active online-bookable stylist exists. Use single to force the simplified one-stylist experience, or multi to force full stylist controls.',
    defaultValue: envString('BOOKING_SHOP_MODE', 'auto'),
  },
  {
    key: 'booking.primaryStylistId',
    type: 'string',
    group: 'Booking Controls',
    label: 'Primary stylist ID',
    description: 'Optional worker ID used when Shop stylist mode is forced to single. Leave blank in Auto mode; the only active online-bookable stylist is selected automatically.',
    defaultValue: envString('BOOKING_PRIMARY_STYLIST_ID', ''),
    isAdvanced: true,
  },
  {
    key: 'booking.online.maxServicesPerVisit',
    type: 'number',
    group: 'Booking Controls',
    label: 'Maximum online services per visit',
    description: 'Maximum separate services a client can book online in one visit. Allowed values are 1, 2, 3, or 4. Default is 2; larger bookings are redirected to call the salon so staff can allocate enough time.',
    defaultValue: envNumber('ONLINE_BOOKING_MAX_SERVICES_PER_VISIT', 2),
  },
  {
    key: 'appointmentRetention.archiveCompletedDays',
    type: 'number',
    group: 'Appointment History & Retention',
    label: 'Archive completed appointments after',
    description: 'Number of days after the appointment date before completed appointments move out of the active list.',
    defaultValue: envNumber('APPOINTMENT_ARCHIVE_COMPLETED_DAYS', 180),
  },
  {
    key: 'appointmentRetention.archiveCanceledDays',
    type: 'number',
    group: 'Appointment History & Retention',
    label: 'Archive canceled appointments after',
    description: 'Number of days after the appointment date before canceled appointments move out of the active list.',
    defaultValue: envNumber('APPOINTMENT_ARCHIVE_CANCELED_DAYS', 90),
  },
  {
    key: 'appointmentRetention.archiveNoShowDays',
    type: 'number',
    group: 'Appointment History & Retention',
    label: 'Archive no-show appointments after',
    description: 'Number of days after the appointment date before no-show appointments move out of the active list.',
    defaultValue: envNumber('APPOINTMENT_ARCHIVE_NOSHOW_DAYS', 180),
  },
  {
    key: 'appointmentRetention.permanentDeleteEnabled',
    type: 'boolean',
    group: 'Appointment History & Retention',
    label: 'Enable permanent deletion',
    description: 'When disabled, archived appointments are never automatically deleted. Keep this OFF until the salon intentionally adopts a deletion policy.',
    defaultValue: envBool('APPOINTMENT_PERMANENT_DELETE_ENABLED', false),
    isAdvanced: true,
  },
  {
    key: 'appointmentRetention.deleteArchivedDays',
    type: 'number',
    group: 'Appointment History & Retention',
    label: 'Delete archived appointments after',
    description: 'Age in days after archival before permanent deletion. Used only when permanent deletion is enabled. Default is three years.',
    defaultValue: envNumber('APPOINTMENT_DELETE_ARCHIVED_DAYS', 1095),
    isAdvanced: true,
  },
  {
    key: 'promotions.enabled',
    type: 'boolean',
    group: 'Promotions',
    label: 'Promotions enabled',
    description: 'Master switch for special-deal logic and promotion badges across client and worker screens.',
    defaultValue: envBool('PROMOTIONS_ENABLED', true),
  },
  {
    key: 'promotions.showClientBadges',
    type: 'boolean',
    group: 'Promotions',
    label: 'Show client promotion badges',
    description: 'Shows special-deal tags and notices on customer booking, confirmation, and dashboard screens.',
    defaultValue: envBool('PROMOTIONS_SHOW_CLIENT_BADGES', true),
  },
  {
    key: 'promotions.showWorkerBadges',
    type: 'boolean',
    group: 'Promotions',
    label: 'Show worker/admin promotion badges',
    description: 'Shows special-deal tags on admin appointment and worker-facing appointment views.',
    defaultValue: envBool('PROMOTIONS_SHOW_WORKER_BADGES', true),
  },
  {
    key: 'promotions.warnWrongDay',
    type: 'boolean',
    group: 'Promotions',
    label: 'Warn when promotion day does not match',
    description: 'When a promotion service is selected on a non-qualifying day, warn that regular price applies.',
    defaultValue: envBool('PROMOTIONS_WARN_WRONG_DAY', true),
  },
];

const DEFAULT_BY_KEY = new Map(DEFAULT_RUNTIME_SETTINGS.map((item) => [item.key, item]));

function normalizeValueForType(value, type) {
  if (type === 'boolean') {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    return !['false', '0', 'no', 'off', ''].includes(String(value ?? '').trim().toLowerCase());
  }

  if (type === 'number') {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }

  if (type === 'json') {
    if (typeof value === 'string') {
      try { return JSON.parse(value); } catch (_) { return value; }
    }
    return value;
  }

  return value === undefined || value === null ? '' : String(value);
}

function publicSettingShape(docOrDef) {
  const def = DEFAULT_BY_KEY.get(docOrDef.key) || {};
  return {
    key: docOrDef.key,
    value: docOrDef.value !== undefined ? docOrDef.value : def.defaultValue,
    type: docOrDef.type || def.type || 'string',
    group: docOrDef.group || def.group || 'General',
    label: docOrDef.label || def.label || docOrDef.key,
    description: docOrDef.description || def.description || '',
    isAdvanced: Boolean(docOrDef.isAdvanced ?? def.isAdvanced),
    updatedAt: docOrDef.updatedAt || null,
    updatedBy: docOrDef.updatedBy || '',
  };
}

async function seedRuntimeSettings() {
  for (const def of DEFAULT_RUNTIME_SETTINGS) {
    await RuntimeSetting.updateOne(
      { key: def.key },
      {
        $setOnInsert: {
          key: def.key,
          value: normalizeValueForType(def.defaultValue, def.type),
          type: def.type,
          group: def.group,
          label: def.label,
          description: def.description,
          isAdvanced: Boolean(def.isAdvanced),
        },
      },
      { upsert: true }
    );
  }
}

async function getAllRuntimeSettings() {
  await seedRuntimeSettings();
  const rows = await RuntimeSetting.find({}).sort({ group: 1, key: 1 }).lean();
  const byKey = new Map(rows.map((row) => [row.key, row]));

  const orderedKnown = DEFAULT_RUNTIME_SETTINGS.map((def) => publicSettingShape(byKey.get(def.key) || def));
  const extras = rows
    .filter((row) => !DEFAULT_BY_KEY.has(row.key))
    // promotions.activeDeal was the old single-deal JSON fallback. Deals now live in promotiondeals.
    .filter((row) => row.key !== 'promotions.activeDeal')
    .map(publicSettingShape);

  return [...orderedKnown, ...extras];
}

async function getRuntimeSetting(key, fallbackValue) {
  const def = DEFAULT_BY_KEY.get(key);
  const fallback = fallbackValue !== undefined ? fallbackValue : def?.defaultValue;
  const now = Date.now();
  const cached = cache.get(key);

  if (cached && cached.expiresAt > now) return cached.value;

  try {
    const row = await RuntimeSetting.getByKey(key);
    const raw = row ? row.value : fallback;
    const value = normalizeValueForType(raw, row?.type || def?.type || typeof fallback);
    cache.set(key, { value, expiresAt: now + CACHE_TTL_MS });
    return value;
  } catch (err) {
    console.warn(`[runtimeSettings] Failed to read ${key}; using fallback`, err.message);
    return fallback;
  }
}

async function setRuntimeSetting(key, value, updatedBy = '') {
  const def = DEFAULT_BY_KEY.get(key);
  if (!def) {
    const allowed = DEFAULT_RUNTIME_SETTINGS.map((item) => item.key);
    const err = new Error(`Unknown runtime setting key: ${key}`);
    err.status = 400;
    err.allowedKeys = allowed;
    throw err;
  }

  let normalized = normalizeValueForType(value, def.type);

  if (key.startsWith('appointmentRetention.') && def.type === 'number') {
    if (!Number.isInteger(normalized) || normalized < 1 || normalized > 3650) {
      const err = new Error('Appointment retention days must be a whole number between 1 and 3650.');
      err.status = 400;
      throw err;
    }
  }

  if (key === 'booking.online.maxServicesPerVisit') {
    if (!Number.isInteger(normalized) || normalized < 1 || normalized > 4) {
      const err = new Error('Maximum online services per visit must be 1, 2, 3, or 4.');
      err.status = 400;
      throw err;
    }
  }

  const doc = await RuntimeSetting.findOneAndUpdate(
    { key },
    {
      $set: {
        key,
        value: normalized,
        type: def.type,
        group: def.group,
        label: def.label,
        description: def.description,
        isAdvanced: Boolean(def.isAdvanced),
        updatedBy: String(updatedBy || ''),
      },
    },
    { new: true, upsert: true, runValidators: true }
  ).lean();

  cache.delete(key);
  return publicSettingShape(doc);
}

async function getRuntimeBoolean(key, fallbackValue = false) {
  return normalizeValueForType(await getRuntimeSetting(key, fallbackValue), 'boolean');
}

async function getRuntimeString(key, fallbackValue = '') {
  return normalizeValueForType(await getRuntimeSetting(key, fallbackValue), 'string');
}

async function getRuntimeNumber(key, fallbackValue = 0) {
  return normalizeValueForType(await getRuntimeSetting(key, fallbackValue), 'number');
}

function clearRuntimeSettingCache(key) {
  if (key) cache.delete(key);
  else cache.clear();
}

module.exports = {
  DEFAULT_RUNTIME_SETTINGS,
  getAllRuntimeSettings,
  getRuntimeSetting,
  getRuntimeBoolean,
  getRuntimeString,
  getRuntimeNumber,
  setRuntimeSetting,
  seedRuntimeSettings,
  clearRuntimeSettingCache,
};
