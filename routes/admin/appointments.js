const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/appointmentadmincontroller');

router.get('/', controller.getAppointments);
router.post('/', controller.createAppointment);  
router.patch('/:id', controller.updateAppointment);
router.delete('/:id', controller.deleteAppointment);

module.exports = router;
