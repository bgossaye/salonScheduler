const express = require('express');
const router = express.Router();
const controller = require('../../controllers/client/appointmentcontroller');

// Public/client appointment endpoints. Admin appointment management remains under /api/admin/appointments.
router.get('/', controller.getClientAppointments);
router.get('/client/:id', controller.getAppointmentsForClient);
router.post('/', controller.createAppointment);
router.post('/batch', controller.createAppointmentBatch);
router.patch('/:id', controller.updateAppointment);
router.put('/:id', controller.updateAppointment);
router.post('/update/:id', controller.updateAppointmentFromBody);
router.post('/update', controller.updateAppointmentFromBody);
router.put('/', controller.updateAppointmentFromBody);
router.delete('/:id', controller.cancelAppointment);

module.exports = router;
