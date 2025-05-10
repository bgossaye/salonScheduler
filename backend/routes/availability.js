const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');
const Service = require('../models/Service');
const StoreHours = require('../models/StoreHours');

// Helper: Convert "HH:MM" to Date object on a given date
const timeToDate = (dateStr, timeStr) => {
  const [hour, minute] = timeStr.split(':').map(Number);
  const date = new Date(`${dateStr}T00:00:00`);
  date.setHours(hour, minute, 0, 0);
  return date;
};

// Get weekday name
const getWeekday = (dateStr) => {
  return new Date(dateStr).toLocaleDateString('en-US', { weekday: 'long' });
};

// GET /api/availability?date=YYYY-MM-DD&serviceId=...
router.get('/', async (req, res) => {
  const { date, serviceId } = req.query;
  console.log('➡️  Availability requested:', { date, serviceId });

  if (!date || !serviceId){
    console.warn('⚠️ Missing date or serviceId');
    return res.status(400).json({ error: 'Missing date or serviceId' });
  }

  try {
    const service = await Service.findById(serviceId);
if (!service) {
      console.warn('⚠️ No service found');
      return res.status(404).json({ error: 'Service not found' });
    }

    const duration = service.duration;

    const weekday = getWeekday(date);
    const hours = await StoreHours.findOne({ day: weekday });
console.log('🕒 Store hours for', weekday, ':', hours);
    console.log('🛠️ Service duration:', duration);

    if (!hours) return res.status(404).json({ error: 'No store hours for this day' });

    const openTime = timeToDate(date, hours.open);
    const closeTime = timeToDate(date, hours.close);

    const appointments = await Appointment.find({ date });

    // Create list of blocked time ranges
    const taken = appointments.map(appt => {
      const start = timeToDate(appt.date, appt.time);
      const end = new Date(start.getTime() + appt.duration * 60000);
      return { start, end };
    });

    const availableSlots = [];
    let cursor = new Date(openTime);

    while (cursor.getTime() + duration * 60000 <= closeTime.getTime()) {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor.getTime() + duration * 60000);

      const overlaps = taken.some(appt =>
        slotStart < appt.end && slotEnd > appt.start
      );

      if (!overlaps) {
        availableSlots.push(slotStart.toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        }));
      }

      cursor.setMinutes(cursor.getMinutes() + 30);
    }

    res.json(availableSlots);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: 'Error checking availability' });
  }
});

module.exports = router;
