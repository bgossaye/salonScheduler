const StoreCalendarException = require('../models/storecalendarexception');

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

function normalizeBusinessDate(value) {
  if (!value) return '';
  const str = String(value).trim();
  if (DATE_RE.test(str)) return str;
  const parsed = new Date(str);
  if (Number.isNaN(parsed.getTime())) return '';
  return parsed.toISOString().slice(0, 10);
}

function isValidBusinessDate(value) {
  return DATE_RE.test(String(value || '').trim());
}

function isValidTime(value) {
  if (!value) return true;
  return TIME_RE.test(String(value || '').trim());
}

function defaultMessageForStatus(status = {}) {
  if (status.customerMessage) return status.customerMessage;
  if (status.storeClosed) {
    return status.title
      ? `Rakie Salon is closed for ${status.title}. Please choose another date.`
      : 'Rakie Salon is closed on this date. Please choose another date.';
  }
  if (status.onlineBookingOff) {
    return 'Online booking is not available for this date. Please call Rakie Salon to schedule.';
  }
  if (status.hasSpecialHours && status.open && status.close) {
    return `Special hours for this date: ${status.open} - ${status.close}.`;
  }
  return '';
}

function publicStatusFromException(date, exception) {
  if (!exception) {
    return {
      date,
      hasException: false,
      storeClosed: false,
      onlineBookingOff: false,
      phoneCallRequired: false,
      hasSpecialHours: false,
      open: '',
      close: '',
      title: '',
      reason: '',
      customerMessage: '',
    };
  }

  const status = {
    date,
    hasException: true,
    exceptionId: String(exception._id || ''),
    title: exception.title || '',
    reason: exception.reason || 'custom',
    storeClosed: exception.storeClosed === true,
    onlineBookingOff: exception.onlineBookingOff === true,
    phoneCallRequired: exception.phoneCallRequired === true || exception.onlineBookingOff === true,
    hasSpecialHours: !exception.storeClosed && !!exception.open && !!exception.close,
    open: exception.storeClosed ? '' : (exception.open || ''),
    close: exception.storeClosed ? '' : (exception.close || ''),
    customerMessage: exception.customerMessage || '',
  };
  status.customerMessage = defaultMessageForStatus(status);
  return status;
}

async function findExceptionForDate(date) {
  const normalized = normalizeBusinessDate(date);
  if (!normalized) return null;

  // If overlapping exceptions exist, the most recently updated active record wins.
  return StoreCalendarException.findOne({
    active: true,
    startDate: { $lte: normalized },
    endDate: { $gte: normalized },
  })
    .sort({ updatedAt: -1, createdAt: -1 })
    .lean();
}

async function resolveStoreCalendarStatus(date) {
  const normalized = normalizeBusinessDate(date);
  const exception = await findExceptionForDate(normalized);
  return publicStatusFromException(normalized, exception);
}

module.exports = {
  normalizeBusinessDate,
  isValidBusinessDate,
  isValidTime,
  defaultMessageForStatus,
  resolveStoreCalendarStatus,
};
