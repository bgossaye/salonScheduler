const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/exportcontroller');
const auth = require('../../middleware/authmiddleware');

router.use(auth);
router.get('/appointments', auth.requirePermission('reportsView'), controller.exportAppointments);

module.exports = router;
