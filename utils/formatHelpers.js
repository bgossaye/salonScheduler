// backend/utils/formatHelpers.js

function formatDate(input) {
  const d = input instanceof Date ? input : new Date(input);
  if (isNaN(d)) return '';
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function formatTime(input) {
  // If given a Date, format directly
  if (input instanceof Date && !isNaN(input)) {
    return input.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  }

  // Minutes since midnight (e.g. 810 → 1:30 PM)
  if (typeof input === 'number' && Number.isFinite(input)) {
    const d = new Date();
    const hh = Math.floor(input / 60);
    const mm = input % 60;
    d.setHours(hh, mm, 0, 0);
    return d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
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

module.exports = { formatDate, formatTime };