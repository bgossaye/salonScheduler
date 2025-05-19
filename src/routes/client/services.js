const express = require('express');
const router = express.Router();
const Service = require('../../models/service'); // already present

// EXISTING route
router.get('/', async (req, res) => {
  try {
    const services = await Service.find();
    res.json(services);
  } catch (err) {
    console.error('Failed to fetch services:', err);
    res.status(500).json({ message: 'Server error fetching services' });
  }
});

// ✅ NEW ROUTE for suggested add-ons
router.get('/:serviceId/addons', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const service = await Service.findById(serviceId).populate('suggestedAddOns');
    if (!service) return res.status(404).json({ message: 'Service not found' });
    res.json(service.suggestedAddOns || []);
  } catch (err) {
    console.error('Failed to fetch suggested add-ons:', err);
    res.status(500).json({ message: 'Server error fetching add-ons' });
  }
});

module.exports = router;
