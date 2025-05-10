// backend/routes/categories.js
const express = require('express');
const router = express.Router();

// Example static categories
const categories = [
  { name: 'Haircut' },
  { name: 'Coloring' },
  { name: 'Styling' }
];

// GET /api/categories
router.get('/', (req, res) => {
  res.json(categories);
});

module.exports = router;
