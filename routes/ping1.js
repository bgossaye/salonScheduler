// routes/ping.js
const express = require('express');
const router = express.Router();

router.get('/ping', (req, res) => {
  res.status(200).json({ message: 'MongoDB is awake!' });
});

module.exports = router;
