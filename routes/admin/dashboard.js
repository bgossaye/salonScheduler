const express = require('express');
const router = express.Router();
const auth = require('../../middleware/authmiddleware');
const controller = require('../../controllers/admin/dashboardcontroller');

router.use(auth);
router.get('/', auth.requirePermission('dashboardView'), controller.getDashboard);

module.exports = router;
