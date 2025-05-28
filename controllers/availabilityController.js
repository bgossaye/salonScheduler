const Appointment = require('../models/Appointment');
const Service = require('../models/Service');

exports.getAvailability = async (req, res) => {
  try {
    const { date, serviceId } = req.query;
    if (!date || !serviceId) return res.status(400).json({ error: 'Missing parameters' });

    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const duration = service.duration;
    const appointments = await Appointment.find({ date });

    // Build a slot usage map for overlap detection
    const existingSlots = appointments.map(appt => {
      const start = normalizeTimeToMinutes(appt.time);
      const end = start + (appt.duration || 60);
      return { start, end };
    });

    const timeBlockUsage = {};
    existingSlots.forEach(({ start, end }) => {
      for (let t = start; t < end; t += 15) {
        timeBlockUsage[t] = (timeBlockUsage[t] || 0) + 1;
      }
    });

    const conflictTimes = new Set(
      Object.keys(timeBlockUsage)
        .filter(k => timeBlockUsage[k] > 1)
        .map(k => parseInt(k))
    );

    // Create a group map to alternate appointment shading
    const groupMap = {};
    appointments.forEach((appt, idx) => {
      const start = normalizeTimeToMinutes(appt.time);
      const end = start + (appt.duration || 60);
      const group = idx % 2 === 0 ? 'even' : 'odd';

      for (let t = start; t < end; t += 15) {
        groupMap[t] = group;
      }
    });

    const startHour = 9;
    const endHour = 18;
    const slots = [];

    for (let h = startHour; h < endHour; h++) {
      for (let m = 0; m < 60; m += 15) {
        const time = `${pad(h)}:${pad(m)}`;
        const startMin = h * 60 + m;
        const endMin = startMin + 15;

        let status = 'free';
        let isStart = false;
        let isEnd = false;

        for (const existing of existingSlots) {
          if (typeof existing.start !== 'number' || typeof existing.end !== 'number') continue;

          const overlaps = startMin < (existing.end + 0.01) && endMin > existing.start;
          if (overlaps) {
            status = 'booked';
            if (startMin === existing.start) isStart = true;
            if (endMin === existing.end) isEnd = true;
          }
        }

        const isConflict = conflictTimes.has(startMin);
        const group = groupMap[startMin] || null;

        slots.push({ time, status, start: isStart, end: isEnd, conflict: isConflict, group });
      }
    }

    res.json(slots);
  } catch (err) {
    console.error('❌ Error fetching availability:', err);
    res.status(500).json({ error: err.message || 'Internal server error' });
  }
};

function normalizeTimeToMinutes(timeStr) {
  const ampmMatch = timeStr.match(/^(\d{1,2}):(\d{2})\s?(AM|PM)?$/i);
  if (ampmMatch) {
    let [_, hour, minute, period] = ampmMatch;
    hour = parseInt(hour);
    minute = parseInt(minute);
    if (period) {
      if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
      if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;
    }
    return hour * 60 + minute;
  }

  const parts = timeStr.split(':');
  if (parts.length === 2) {
    const hour = parseInt(parts[0], 10);
    const minute = parseInt(parts[1], 10);
    if (!isNaN(hour) && !isNaN(minute)) {
      return hour * 60 + minute;
    }
  }

  console.warn('⚠️ Invalid time format:', timeStr);
  return 0;
}

function pad(n) {
  return n.toString().padStart(2, '0');
}
