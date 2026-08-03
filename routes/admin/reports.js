const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/reportscontroller');
const auth = require('../../middleware/authmiddleware');

router.use(auth);
router.get('/summary', auth.requirePermission('reportsView'), controller.getSummaryReport);

module.exports = router;
