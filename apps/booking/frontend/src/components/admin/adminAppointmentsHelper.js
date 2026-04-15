
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
 * Duplicate appointment with updated date
 */
export function buildRebookedAppointment(originalAppointment, newDate) {
  const copy = { ...originalAppointment };
  delete copy._id;
  copy.date = newDate;
  copy.status = 'booked';
  return copy;
}
