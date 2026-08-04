
// adminAppointmentsHelper.js

/**
 * Get day name from a date string
 */
export function getDayName(dateStr) {
  const date = new Date(dateStr);
  return date.toLocaleDateString('en-US', { weekday: 'long' });
}

/**
 * Calculate next available open date after N weeks
 * Skips closed days based on storeHours array
 */
export function getNextOpenDate(startDateStr, weeksAhead, storeHours) {
  let date = new Date(startDateStr);
  date.setDate(date.getDate() + (weeksAhead * 7));

  for (let i = 0; i < 14; i++) {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
    const storeDay = storeHours.find(d => d.day === dayName);
    if (storeDay && !storeDay.closed) {
      return date.toISOString().slice(0, 10); // format YYYY-MM-DD
    }
    date.setDate(date.getDate() + 1); // move to next day
  }

  return null;
}

/**
 * Build a clean payload for a NEW appointment based on a completed one.
 * Appointment rows are populated for display, so references must be reduced
 * back to IDs and completed/history metadata must not be copied into POST.
 */
export function buildRebookedAppointment(originalAppointment, newDate) {
  const idOf = (value) => value?._id || value || '';

  return {
    clientId: idOf(originalAppointment?.clientId),
    serviceId: idOf(originalAppointment?.serviceId),
    service: originalAppointment?.serviceId?.name || originalAppointment?.service || '',
    workerId: idOf(originalAppointment?.workerId) || null,
    workerTierKey:
      originalAppointment?.workerId?.tierKey ||
      originalAppointment?.workerTierKey ||
      originalAppointment?.priceSnapshot?.workerTierKey ||
      '',
    workerName:
      originalAppointment?.workerId?.displayName ||
      originalAppointment?.workerName ||
      originalAppointment?.priceSnapshot?.workerName ||
      '',
    date: newDate,
    time: String(originalAppointment?.time || '').slice(0, 5),
    duration: Number(originalAppointment?.duration) || 60,
    status: 'booked',
    addOns: (originalAppointment?.addOns || []).map(idOf).filter(Boolean),
  };
}
