const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/appointmentadmincontroller');
const auth = require('../../middleware/authmiddleware');

const { requirePermission, requireAnyPermission } = auth;

router.use(auth);

router.get('/', requireAnyPermission(['appointmentsViewAll', 'appointmentsViewOwn']), controller.getAppointments);
router.get('/:id', requireAnyPermission(['appointmentsViewAll', 'appointmentsViewOwn']), controller.getAppointmentById);
router.post('/', requireAnyPermission(['appointmentsCreate', 'appointmentsCreateOwn', 'appointmentsCreateForOthers']), controller.createAppointment);
router.post('/group', requireAnyPermission(['appointmentsCreate', 'appointmentsCreateForOthers']), controller.createGroupAppointments);
router.patch('/:id', requireAnyPermission(['appointmentsEdit', 'appointmentsEditOwn', 'appointmentsEditForOthers', 'appointmentsCancel', 'appointmentsComplete']), controller.updateAppointment);
router.delete('/:id', requirePermission('appointmentsDelete'), controller.deleteAppointment);

module.exports = router;
