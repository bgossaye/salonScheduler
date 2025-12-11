const express = require('express');
const router = express.Router();
const ctl = require('../../controllers/admin/notificationtemplatescontroller');

router.get('/', ctl.getAll);
router.put('/master-toggle', ctl.toggleMaster);
router.put('/:templateType', ctl.updateOne);

module.exports = router;
