export const formatDate = (value) => {
  if (!value) return '';
  const [year, month, day] = value.split('-');
  const d = new Date(Number(year), Number(month) - 1, Number(day));
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${mm}/${dd}/${yy}`;
};

// Always return 12-hour clock (h:mmam/pm) WITHOUT rounding
export const formatTime = (value) => {
  if (!value) return '';

  // Accept "HH:MM" or "HH:MM:SS" (24h)
  const [hStr, mStr] = String(value).trim().split(':');
  const h24 = parseInt(hStr, 10);
  const m = parseInt(mStr ?? '0', 10);

  if (Number.isNaN(h24) || Number.isNaN(m)) return String(value);

  const ampm = h24 >= 12 ? 'pm' : 'am';
  const h12 = (h24 % 12) || 12;
  const mm = String(m).padStart(2, '0');

  return `${h12}:${mm}${ampm}`;
};

export const formatDateTime = (value) => {
  return `${formatDate(value)} ${formatTime(value)}`;
};

export const normalizeDateForInput = (value) => {
    if (!value) return '';

    let yyyy, mm, dd;

    if (typeof value === 'string') {
        if (value.includes('/')) {
            // MM/DD/YYYY or MM/DD/YY
            const parts = value.split('/');
            mm = parts[0].padStart(2, '0');
            dd = parts[1].padStart(2, '0');
            yyyy = parts[2].length === 2 ? `19${parts[2]}` : parts[2];
        } else if (value.includes('-')) {
            // Already YYYY-MM-DD (e.g., from ISO)
            return value.slice(0, 10);
        }
    } else if (value instanceof Date) {
        yyyy = value.getFullYear();
        mm = String(value.getMonth() + 1).padStart(2, '0');
        dd = String(value.getDate()).padStart(2, '0');
    }

    return `${yyyy}-${mm}-${dd}`;
};

