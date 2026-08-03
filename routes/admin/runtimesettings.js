const express = require('express');
const router = express.Router();
const auth = require('../../middleware/authmiddleware');
const ctl = require('../../controllers/admin/runtimesettingscontroller');

router.use(auth);
router.get('/', auth.requirePermission('settingsManage'), ctl.getAll);
router.put('/:key', auth.requirePermission('settingsManage'), ctl.updateOne);

module.exports = router;
