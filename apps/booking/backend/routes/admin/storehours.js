const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/storehourscontroller');
const auth = require('../../middleware/authmiddleware');

const { requirePermission, requireAnyPermission } = auth;

router.use(auth);
router.get('/', requireAnyPermission(['settingsManage', 'appointmentsViewAll', 'appointmentsCreate', 'appointmentsCreateOwn', 'appointmentsCreateForOthers']), controller.getStoreHours);
router.get('/calendar', requireAnyPermission(['settingsManage', 'appointmentsViewAll', 'appointmentsCreate', 'appointmentsCreateOwn', 'appointmentsCreateForOthers']), controller.getCalendarExceptions);
router.post('/calendar', requirePermission('settingsManage'), controller.createCalendarException);
router.put('/calendar/:id', requirePermission('settingsManage'), controller.updateCalendarException);
router.delete('/calendar/:id', requirePermission('settingsManage'), controller.deleteCalendarException);
router.put('/:day', requirePermission('settingsManage'), controller.updateStoreHour);

module.exports = router;
