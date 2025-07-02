const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/notificationsettingscontroller');

// GET all templates + master switch
router.get('/', controller.getNotificationSettings);

// PUT: master switch toggle
router.put('/master-toggle', controller.toggleMasterSwitch);

// PUT: update individual template
router.put('/:templateType', controller.updateTemplate);


module.exports = router;
