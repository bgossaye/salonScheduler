const express = require('express');
const router = express.Router();
const availabilityController = require('../../controllers/availabilitycontroller');

// Public online-booking availability. Admin-side manual booking builds its own wider day grid.
router.get('/status', availabilityController.getStoreDateStatus);
router.get('/', availabilityController.getAvailability);

module.exports = router;
