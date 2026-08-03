const express = require('express');
const router = express.Router();
const ctl = require('../../controllers/admin/notificationtemplatescontroller');
const auth = require('../../middleware/authmiddleware');

router.use(auth);
router.get('/', auth.requirePermission('smsSettingsManage'), ctl.getAll);
router.put('/master-toggle', auth.requirePermission('smsSettingsManage'), ctl.toggleMaster);
router.put('/:templateType', auth.requirePermission('smsSettingsManage'), ctl.updateOne);

module.exports = router;
