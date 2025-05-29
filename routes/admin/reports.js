const express = require('express'); const router = express.Router(); const controller = require('../../controllers/admin/reportscontroller');

router.get('/summary', controller.getSummaryReport);

module.exports = router;