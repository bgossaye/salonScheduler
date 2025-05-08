const express = require('express');
const router = express.Router();
const StoreHours = require('../models/StoreHours');

router.get('/', async (req, res) => {
  const hours = await StoreHours.find();
  res.json(hours);
});

router.put('/:day', async (req, res) => {
  const { day } = req.params;
  const updated = await StoreHours.findOneAndUpdate({ day }, req.body, { new: true, upsert: true });
  res.json(updated);
});

module.exports = router;