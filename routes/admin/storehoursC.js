const express = require('express'); const router = express.Router(); const controller = require('../../controllers/admin/storehourscontroller');

router.get('/', controller.getStoreHours);
router.put('/:day', controller.updateStoreHour);

module.exports = router;