const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/storehourscontroller');

// Public, read-only store hours used by client booking.
// All create/update/delete operations remain under /api/admin/store-hours.
router.get('/', controller.getStoreHours);

module.exports = router;
