const express = require('express');
const router = express.Router();

// Controllers
const { getSuggestedAddOns } = require('../controllers/schedulingController');

// Routes
router.post('/suggestions', getSuggestedAddOns);

module.exports = router;
