const express = require('express');
const router = express.Router();
const auth = require('../../middleware/authmiddleware');
const controller = require('../../controllers/admin/adminnotificationscontroller');

router.use(auth);
router.get('/', controller.listNotifications);
router.patch('/:id/read', controller.markRead);
router.patch('/read-all', controller.markAllRead);

module.exports = router;
