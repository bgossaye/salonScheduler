const express = require('express');
const router = express.Router();

// use the SAME admin controller for both sides
const appt = require('../../controllers/admin/appointmentadmincontroller');

// Client-facing endpoints now delegate to the shared controller
router.get('/client/:id', appt.getAppointmentsForClient);
router.post('/', appt.createAppointment);
router.patch('/:id', appt.updateAppointment);
router.delete('/:id', appt.deleteAppointment);

module.exports = router;