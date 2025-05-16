const express = require('express'); const router = express.Router(); const controller = require('../../controllers/admin/exportController');

router.get('/appointments', controller.exportAppointments);

module.exports = router;