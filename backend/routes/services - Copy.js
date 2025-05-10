// backend/routes/services.js
const express = require('express');
const router = express.Router();

// Mock service database
const serviceDB = {
  haircut: [
    { name: 'Basic Cut', price: 30 },
    { name: 'Fade', price: 35 }
  ],
  coloring: [
    { name: 'Root Touch-up', price: 60 },
    { name: 'Full Color', price: 90 }
  ],
  styling: [
    { name: 'Blow Dry', price: 25 },
    { name: 'Updo', price: 50 }
  ]
};

// GET /api/services?category=haircut
router.get('/', (req, res) => {
  const category = (req.query.category || '').trim().toLowerCase();
  const services = serviceDB[category] || [];
  res.json(services);
});

module.exports = router;
