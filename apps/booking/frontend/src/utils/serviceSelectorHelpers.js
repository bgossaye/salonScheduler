// Pure helper functions extracted from ServiceSelector.jsx.
//
// These have no dependency on component state or React — they're plain
// functions of their arguments (plus a couple of narrow localStorage/
// sessionStorage side effects for debug logging), so moving them here is
// behavior-preserving. Splitting them out of the 2,800-line component:
//   - makes them independently unit-testable without mounting the component
//   - shrinks the surface area of ServiceSelector.jsx
//   - lets other booking-flow components reuse them without duplicating logic
//
// If you continue decomposing ServiceSelector.jsx, this is the pattern to
// follow next: pull out anything that doesn't read/write a useState value,
// starting with the largest remaining stateful sections (family booking,
// coupon handling, submit flow) — see the note left in ServiceSelector.jsx.

const RAKIE_BOOKING_DEBUG_KEY = 'rakieServiceSelectorDebug';
const ONLINE_BOOKING_COUNT_KEY = 'rakieOnlineBookingServiceCount';
const ONLINE_BOOKING_COUNT_TS_KEY = 'rakieOnlineBookingServiceCountAt';

export function bookingDebug(label, details = {}) {
  const entry = {
    at: new Date().toISOString(),
    label,
    details,
  };
  try {
    console.log(`[RakieBookingDebug] ${label}`, details);
    const existing = JSON.parse(localStorage.getItem(RAKIE_BOOKING_DEBUG_KEY) || '[]');
    const next = Array.isArray(existing) ? [...existing, entry].slice(-80) : [entry];
    localStorage.setItem(RAKIE_BOOKING_DEBUG_KEY, JSON.stringify(next));
  } catch (err) {
    console.log(`[RakieBookingDebug] ${label}`, details, err?.message || err);
  }
}

export function summarizeClientAppointmentResponse(data, clientId) {
  const rows = Array.isArray(data)
    ? data
    : Array.isArray(data?.appointments)
      ? data.appointments
      : Array.isArray(data?.data)
        ? data.data
        : [];
  const wantedClientId = String(clientId || '');
  const ownedRows = rows.filter((row) => String(row?.clientId?._id || row?.clientId || '') === wantedClientId);
  const activeRows = ownedRows.filter((row) => ['pending', 'booked'].includes(String(row?.status || '').toLowerCase()));
  return {
    responseShape: Array.isArray(data) ? 'array' : Object.keys(data || {}).slice(0, 12),
    totalRows: rows.length,
    ownedRows: ownedRows.length,
    activeRows: activeRows.map((row) => ({
      id: row?._id,
      clientId: row?.clientId?._id || row?.clientId,
      service: row?.service,
      date: row?.date,
      time: row?.time,
      status: row?.status,
      bookingFlags: row?.bookingFlags,
    })),
  };
}

export function clearOnlineBookingCount() {
  try {
    sessionStorage.removeItem(ONLINE_BOOKING_COUNT_KEY);
    sessionStorage.removeItem(ONLINE_BOOKING_COUNT_TS_KEY);
  } catch {
    console.log('booking count clear failed');
  }
}

export function idOf(value) {
  return String(value?._id || value || '');
}

export function workerDisplayName(worker) {
  return worker?.displayName || [worker?.firstName, worker?.lastName].filter(Boolean).join(' ') || 'Stylist';
}

export function timeToMinutes(timeStr) {
  const [hStr, mStr] = String(timeStr || '').split(':');
  return (parseInt(hStr, 10) || 0) * 60 + (parseInt(mStr, 10) || 0);
}

export function addMinutesToTime(timeStr, minutesToAdd) {
  const [hStr, mStr] = String(timeStr || '').split(':');
  const start = (parseInt(hStr, 10) || 0) * 60 + (parseInt(mStr, 10) || 0);
  const total = start + (Number(minutesToAdd) || 0);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function basketItemDuration(item) {
  if (!item) return 0;
  const base = Number(item.service?.duration || 0);
  const extra = (item.addOns || []).reduce((sum, addOn) => sum + Number(addOn?.duration || 0), 0);
  return base + extra;
}

export function relationshipStylistIdFor(client) {
  return (
    idOf(client?.assignedStylistId) ||
    idOf(client?.preferredStylistId) ||
    idOf(client?.lastStylistId) ||
    ''
  );
}

export function clientStartingPrice(service) {
  const value = Number(service?.pricingSummary?.minPrice);
  return Number.isFinite(value) ? `$${value.toFixed(value % 1 === 0 ? 0 : 2)}` : null;
}

export function clientPriceMessage(service) {
  const startingPrice = clientStartingPrice(service);
  const consultationText = service?.requiresConsultation
    ? ' Consultation is required before final pricing is confirmed.'
    : ' Consultation may be required before final pricing is confirmed.';

  return startingPrice
    ? `Starting from ${startingPrice}.${consultationText} Final pricing may vary based on hair length, density, condition, product needs, service complexity, and time required.`
    : `Starting price requires consultation.${consultationText} Final pricing may vary based on hair length, density, condition, product needs, service complexity, and time required.`;
}
