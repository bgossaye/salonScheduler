const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const StoreHours = require('../models/StoreHours');

// Helper to parse "HH:MM" or "h:mm AM/PM" into Date object for given day
function parseTime(dateStr, timeStr) {
  const [hourStr, minuteStr] = timeStr.match(/\d{1,2}:\d{2}/)[0].split(':');
  const hour = parseInt(hourStr);
  const minute = parseInt(minuteStr);
  const isPM = /PM/i.test(timeStr);
  const isAM = /AM/i.test(timeStr);

  let h = hour;
  if (isPM && hour < 12) h += 12;
  if (isAM && hour === 12) h = 0;

  const base = new Date(dateStr);
  base.setHours(h, minute, 0, 0);
  return base;
}

// GET /api/availability?date=YYYY-MM-DD&serviceId=...
router.get('/', async (req, res) => {
  const { date, serviceId } = req.query;

  if (!date || !serviceId) {
    return res.status(400).json({ error: 'Missing date or serviceId' });
  }

  try {
    const service = await Service.findById(serviceId);
    if (!service) return res.status(404).json({ error: 'Service not found' });

    const duration = service.duration; // in minutes
    const weekday = new Date(date).toLocaleDateString('en-US', { weekday: 'long' });
    const storeHours = await StoreHours.findOne({ day: weekday });

    if (!storeHours || storeHours.open === 'closed') {
      return res.json([]);
    }

    const openTime = parseTime(date, storeHours.open);
    const closeTime = parseTime(date, storeHours.close);

    const appointments = await Appointment.find({ date });

    const takenRanges = appointments.map(appt => {
      const start = parseTime(appt.date, appt.time);
      const end = new Date(start.getTime() + appt.duration * 60000);
      return { start, end };
    });

    const results = [];
    let current = new Date(openTime);

    while (current < closeTime) {
      const end = new Date(current.getTime() + duration * 60000);
      if (end > closeTime) break;

      const isBlocked = takenRanges.some(({ start, end: blockedEnd }) =>
        current < blockedEnd && end > start
      );

      results.push({
        time: current.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }),
        available: !isBlocked
      });

      current.setMinutes(current.getMinutes() + 15);
    }

    if (results.length === 0) {
      console.warn(`⚠️ No available slots for ${date} (${duration} min service)`);
    }
	//console.table(results);
    res.json(results);
  } catch (err) {
    console.error('❌ Error checking availability:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
