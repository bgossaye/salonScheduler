const express = require('express');
const router = express.Router();
const Appointment = require('../models/Appointment');

// ✅ GET /api/appointments/client/:id
router.get('/client/:id', async (req, res) => {
  try {
    const clientId = req.params.id;
    const appointments = await Appointment.find({ clientId }).sort({ date: -1 });
    res.json(appointments);
  } catch (err) {
    console.error('❌ Error fetching client appointments:', err);
    res.status(500).json({ error: 'Failed to fetch appointments' });
  }
});

// ✅ POST /api/appointments
router.post('/', async (req, res) => {
  try {
    const appointment = new Appointment(req.body);
    const saved = await appointment.save();
    res.json(saved);
  } catch (err) {
    console.error('❌ Error creating appointment:', err);
    res.status(500).json({ error: 'Failed to create appointment' });
  }
});

// ✅ DELETE /api/appointments/:id
router.delete('/:id', async (req, res) => {
  try {
    const result = await Appointment.findByIdAndDelete(req.params.id);
    if (!result) {
      return res.status(404).json({ error: 'Appointment not found' });
    }
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Error deleting appointment:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
