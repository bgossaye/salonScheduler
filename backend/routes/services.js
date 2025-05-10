const express = require('express');
const router = express.Router();
const Service = require('../models/Service'); // Make sure this path matches your project

// GET /api/services - Retrieve all services
router.get('/', async (req, res) => {
  try {
    const services = await Service.find();
    res.json(services);
  } catch (err) {
    console.error('Failed to fetch services:', err);
    res.status(500).json({ message: 'Server error fetching services' });
  }
});

module.exports = router;
