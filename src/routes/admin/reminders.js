const express = require('express'); const router = express.Router(); const controller = require('../../controllers/client/notificationscontroller');

router.get('/', controller.getReminders);
router.put('/:type', controller.updateReminderSettings);

module.exports = router;