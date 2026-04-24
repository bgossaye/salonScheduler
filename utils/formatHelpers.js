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

module.exports = { formatDate, formatTime };
