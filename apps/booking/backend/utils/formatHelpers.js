function formatDate(input) {
  if (!input) return '';

  if (input instanceof Date) {
    if (isNaN(input)) return '';
    return input.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  const s = String(input).trim();

  // Date-only appointment values must stay as the selected calendar day.
  // new Date('YYYY-MM-DD') is parsed as UTC and can shift to the previous day.
  const ymd = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) {
    const [, y, m, d] = ymd;
    const localDate = new Date(Number(y), Number(m) - 1, Number(d));
    return localDate.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  }

  const d = new Date(s);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(input) {
  // If given a Date, format directly
  if (input instanceof Date && !isNaN(input)) {
    return input.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  if (typeof input !== 'string') return '';
  const s = input.trim();
  const now = new Date();

  // “h:mm AM/PM”
  const ampm = s.match(/^(\d{1,2}):?(\d{2})?\s*([ap]m)$/i);
  if (ampm) {
    let h = parseInt(ampm[1], 10);
    const m = parseInt(ampm[2] || '0', 10);
    const isPM = /pm/i.test(ampm[3]);
    if (h === 12) h = isPM ? 12 : 0;
    else if (isPM) h += 12;
    now.setHours(h, m, 0, 0);
    return now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  // “HH:mm”
  const hm = s.match(/^(\d{1,2}):(\d{2})$/);
  if (hm) {
    now.setHours(parseInt(hm[1], 10), parseInt(hm[2], 10), 0, 0);
    return now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }
  return '';
}


function pad2(value) {
  return String(value).padStart(2, '0');
}

function isEmptyDateTimeValue(value) {
  if (value === null || value === undefined) return true;
  const s = String(value).trim();
  return !s || /^(null|undefined|invalid date)$/i.test(s);
}

function parseAppointmentDatePart(input) {
  if (isEmptyDateTimeValue(input)) return null;

  if (input instanceof Date) {
    if (isNaN(input)) return null;
    return {
      year: input.getFullYear(),
      month: input.getMonth() + 1,
      day: input.getDate(),
      source: 'date-object',
    };
  }

  const s = String(input).trim();

  // Stored appointment date: YYYY-MM-DD. Keep it as a plain calendar date;
  // do not parse with new Date('YYYY-MM-DD') because JS treats that as UTC.
  let m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    return {
      year: Number(m[1]),
      month: Number(m[2]),
      day: Number(m[3]),
      source: 'ymd-string',
    };
  }

  // US display/input date: MM/DD/YYYY.
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) {
    return {
      year: Number(m[3]),
      month: Number(m[1]),
      day: Number(m[2]),
      source: 'mdy-string',
    };
  }

  const d = new Date(s);
  if (isNaN(d)) return null;
  return {
    year: d.getFullYear(),
    month: d.getMonth() + 1,
    day: d.getDate(),
    source: 'date-parse',
  };
}

function parseAppointmentTimePart(input) {
  if (isEmptyDateTimeValue(input)) return null;

  // Some old/alternate paths may pass minutes from midnight: 810 => 1:30 PM.
  if (typeof input === 'number' && Number.isFinite(input)) {
    const total = Math.trunc(input);
    if (total >= 0 && total < 24 * 60) {
      return {
        hour: Math.floor(total / 60),
        minute: total % 60,
        source: 'minutes-number',
      };
    }
    return null;
  }

  const s = String(input).trim();

  if (/^\d+$/.test(s)) {
    const total = Number(s);
    if (total >= 0 && total < 24 * 60) {
      return {
        hour: Math.floor(total / 60),
        minute: total % 60,
        source: 'minutes-string',
      };
    }
  }

  // 24-hour stored time: HH:mm or HH:mm:ss.
  let m = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (m) {
    const hour = Number(m[1]);
    const minute = Number(m[2]);
    if (hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59) {
      return { hour, minute, source: '24h-string' };
    }
    return null;
  }

  // Display time: h:mm AM/PM, h AM, 1:30pm, etc.
  m = s.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m\.?$/i);
  if (m) {
    let hour = Number(m[1]);
    const minute = Number(m[2] || 0);
    const marker = String(m[3]).toLowerCase();
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    if (hour === 12) hour = marker === 'p' ? 12 : 0;
    else if (marker === 'p') hour += 12;
    return { hour, minute, source: 'ampm-string' };
  }

  const d = new Date(s);
  if (!isNaN(d)) {
    return {
      hour: d.getHours(),
      minute: d.getMinutes(),
      source: 'date-parse',
    };
  }

  return null;
}

function isValidCalendarParts(datePart) {
  if (!datePart) return false;
  const { year, month, day } = datePart;
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

function formatAppointmentDatePart(datePart) {
  if (!isValidCalendarParts(datePart)) return '';
  return new Date(datePart.year, datePart.month - 1, datePart.day)
    .toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatAppointmentTimePart(timePart) {
  if (!timePart) return '';
  const d = new Date(2000, 0, 1, timePart.hour, timePart.minute, 0, 0);
  return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
}

function normalizeAppointmentDateTime(dateInput, timeInput) {
  const datePart = parseAppointmentDatePart(dateInput);
  const timePart = parseAppointmentTimePart(timeInput);

  if (!isValidCalendarParts(datePart) || !timePart) {
    return {
      ok: false,
      key: '',
      dateKey: '',
      timeKey: '',
      minutes: null,
      formattedDate: '',
      formattedTime: '',
      dateSource: datePart?.source || null,
      timeSource: timePart?.source || null,
    };
  }

  const dateKey = `${datePart.year}-${pad2(datePart.month)}-${pad2(datePart.day)}`;
  const timeKey = `${pad2(timePart.hour)}:${pad2(timePart.minute)}`;
  return {
    ok: true,
    key: `${dateKey}T${timeKey}`,
    dateKey,
    timeKey,
    minutes: timePart.hour * 60 + timePart.minute,
    formattedDate: formatAppointmentDatePart(datePart),
    formattedTime: formatAppointmentTimePart(timePart),
    dateSource: datePart.source,
    timeSource: timePart.source,
  };
}


module.exports = { formatDate, formatTime, normalizeAppointmentDateTime };
