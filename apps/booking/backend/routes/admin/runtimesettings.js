const express = require('express');
const router = express.Router();
const auth = require('../../middleware/authmiddleware');
const ctl = require('../../controllers/admin/runtimesettingscontroller');

router.use(auth);
router.get('/', auth.requirePermission('settingsManage'), ctl.getAll);
router.get('/appointment-retention/preview', auth.requirePermission('settingsManage'), ctl.previewAppointmentRetention);
router.post('/appointment-retention/run', auth.requirePermission('settingsManage'), ctl.runAppointmentRetention);
router.put('/:key', auth.requirePermission('settingsManage'), ctl.updateOne);

module.exports = router;
