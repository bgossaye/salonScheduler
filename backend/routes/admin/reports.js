const express = require('express'); const router = express.Router(); const controller = require('../../controllers/admin/reportsController');

router.get('/summary', controller.getSummaryReport);

module.exports = router;