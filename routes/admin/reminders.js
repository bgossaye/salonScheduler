const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/remindercontroller');

router.get('/', controller.getReminders);
router.put('/:type', controller.updateReminderSettings);
router.post('/', controller.createReminder); // ✅ Add this

module.exports = router;
