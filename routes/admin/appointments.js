const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/appointmentadmincontroller');
const Appointment = require('../../models/appointment');

router.get('/', controller.getAppointments);
router.post('/', controller.createAppointment);  
router.patch('/:id', controller.updateAppointment);
router.delete('/:id', controller.deleteAppointment);


module.exports = router;
