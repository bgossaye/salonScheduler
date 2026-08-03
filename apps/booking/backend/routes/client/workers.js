const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/workerscontroller');

router.get('/', controller.listPublicWorkers);

module.exports = router;
