const Appointment = require('../models/appointment');
const Service = require('../models/service');
const StoreHours = require('../models/storehours');
const { resolveStoreCalendarStatus } = require('../utils/storeCalendar');
const { resolveWorkerService, getDefaultWorker } = require('../utils/workerPricing');
const { isActiveAppointmentStatus } = require('../utils/appointmentIntegrity');

function normalizeTimeToMinutes(timeStr) {
  const ampmMatch = String(timeStr || '').trim().match(/^(\d{1,2}):(\d{2})\s?(AM|PM)?$/i);
  if (ampmMatch) {
    let [, hour, minute, period] = ampmMatch;
    hour = parseInt(hour, 10);
    minute = parseInt(minute, 10);
    if (period) {
      if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
      if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;
    }
    return hour * 60 + minute;
  }
  return null;
}

function pad(n) {
  return n.toString().padStart(2, '0');
}

function timeFromMinutes(total) {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${pad(h)}:${pad(m)}`;
}

function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && aEnd > bStart;
}

function dateInRange(date, startDate, endDate) {
  const value = String(date || '');
  const start = String(startDate || value);
  const end = String(endDate || start);
  return value >= start && value <= end;
}

function dayNameFromDate(date) {
  return new Date(`${date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long' });
}

function findWorkerSchedule(worker, dayName) {
  const target = String(dayName || '').toLowerCase();
  return (worker?.weeklySchedule || []).find((row) => String(row.day || '').toLowerCase() === target) || null;
}

function approvedBlocksForDate(worker, date) {
  return (worker?.blockedTimes || []).filter((block) => {
    if (!block || block.active === false) return false;
    if (block.status && !['approved'].includes(String(block.status))) return false;
    return dateInRange(date, block.startDate, block.endDate || block.startDate);
  });
}

function blockOverlapsCandidate(block, startMin, endMin) {
  if (block.allDay !== false) return true;
  const bStart = normalizeTimeToMinutes(block.startTime);
  const bEnd = normalizeTimeToMinutes(block.endTime);
  if (bStart === null || bEnd === null) return true;
  return overlaps(startMin, endMin, bStart, bEnd);
}


exports.getStoreDateStatus = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ error: 'Missing date' });
    const status = await resolveStoreCalendarStatus(date);
    res.json(status);
  } catch (err) {
    console.error('❌ Error fetching store date status:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
};

exports.getAvailability = async (req, res) => {
  try {
    const { date, serviceId, workerId, excludeId } = req.query;
    if (!date || !serviceId) return res.status(400).json({ error: 'Missing parameters' });

    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    let effectiveWorkerId = workerId || '';
    if (!effectiveWorkerId) {
      const defaultWorker = await getDefaultWorker();
      effectiveWorkerId = defaultWorker?._id ? String(defaultWorker._id) : '';
    }

    const resolved = await resolveWorkerService({
      workerId: effectiveWorkerId,
      serviceId,
      requireOnline: true,
    });
    const worker = resolved.worker;
    const duration = Number(req.query.duration || resolved.duration || service.duration || 60);

    const calendarStatus = await resolveStoreCalendarStatus(date);
    if (calendarStatus.storeClosed || calendarStatus.onlineBookingOff) {
      return res.json([]);
    }

    const weekday = dayNameFromDate(date);
    const storeHours = await StoreHours.findOne({ day: weekday }).lean();
    if (!storeHours || storeHours.closed === true || String(storeHours.open || '').toLowerCase() === 'closed') {
      return res.json([]);
    }

    const effectiveOpen = calendarStatus.hasSpecialHours ? calendarStatus.open : storeHours.open;
    const effectiveClose = calendarStatus.hasSpecialHours ? calendarStatus.close : storeHours.close;
    const storeOpen = normalizeTimeToMinutes(effectiveOpen);
    const storeClose = normalizeTimeToMinutes(effectiveClose);
    if (storeOpen === null || storeClose === null || storeClose <= storeOpen) return res.json([]);

    const workerSchedule = findWorkerSchedule(worker, weekday);
    if (workerSchedule && workerSchedule.enabled === false) return res.json([]);

    const workOpen = normalizeTimeToMinutes(workerSchedule?.start) ?? storeOpen;
    const workClose = normalizeTimeToMinutes(workerSchedule?.end) ?? storeClose;
    const startMin = Math.max(storeOpen, workOpen);
    const closeMin = Math.min(storeClose, workClose);
    if (closeMin <= startMin) return res.json([]);

    const appointmentQuery = { date };
    if (effectiveWorkerId) {
      appointmentQuery.$or = [
        { workerId: effectiveWorkerId },
        { workerId: null },
        { workerId: { $exists: false } },
      ];
    }

    const appointments = await Appointment.find(appointmentQuery).lean();
    const activeAppointments = appointments.filter((appt) => {
      if (excludeId && String(appt._id) === String(excludeId)) return false;
      return isActiveAppointmentStatus(appt.status);
    });

    const existingSlots = activeAppointments.map((appt) => {
      const start = normalizeTimeToMinutes(appt.time);
      const end = start === null ? null : start + (Number(appt.duration) || 60);
      return { start, end, apptId: String(appt._id), workerId: String(appt.workerId || '') };
    }).filter((slot) => slot.start !== null && slot.end !== null);

    const breaks = (workerSchedule?.breaks || []).map((item) => ({
      start: normalizeTimeToMinutes(item.start),
      end: normalizeTimeToMinutes(item.end),
      label: item.label || 'Break',
    })).filter((item) => item.start !== null && item.end !== null && item.end > item.start);

    const blocks = approvedBlocksForDate(worker, date);
    const slots = [];

    for (let min = startMin; min < closeMin; min += 15) {
      const candidateEnd = min + duration;
      const visualEnd = min + 15;
      let status = candidateEnd <= closeMin ? 'free' : 'closed';
      let reason = '';
      let isStart = false;
      let isEnd = false;

      if (status === 'free') {
        const breakHit = breaks.find((br) => overlaps(min, candidateEnd, br.start, br.end));
        if (breakHit) {
          status = 'blocked';
          reason = breakHit.label || 'Break';
        }
      }

      if (status === 'free') {
        const blockHit = blocks.find((block) => blockOverlapsCandidate(block, min, candidateEnd));
        if (blockHit) {
          status = 'blocked';
          reason = blockHit.label || 'Unavailable';
        }
      }

      for (const existing of existingSlots) {
        const candidateOverlaps = overlaps(min, candidateEnd, existing.start, existing.end);
        const visualOverlaps = overlaps(min, visualEnd, existing.start, existing.end);
        if (candidateOverlaps && status === 'free') status = 'booked';
        if (visualOverlaps) {
          if (min === existing.start) isStart = true;
          if (visualEnd === existing.end) isEnd = true;
        }
      }

      slots.push({
        time: timeFromMinutes(min),
        status,
        reason,
        start: isStart,
        end: isEnd,
        conflict: false,
        group: null,
        workerId: effectiveWorkerId || null,
      });
    }

    res.json(slots);
  } catch (err) {
    console.error('❌ Error fetching availability:', err);
    res.status(err.status || 500).json({ error: err.message || 'Internal server error', code: err.code });
  }
};
