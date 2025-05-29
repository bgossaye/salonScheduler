const express = require('express');
const router = express.Router();

// Controllers
const { getSuggestedAddOns } = require('../controllers/schedulingcontroller');

// Routes
router.post('/suggestions', getSuggestedAddOns);

module.exports = router;
