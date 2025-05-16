const express = require('express'); const router = express.Router(); const controller = require('../../controllers/admin/storeHoursController');

router.get('/', controller.getStoreHours);
router.put('/:day', controller.updateStoreHour);

module.exports = router;