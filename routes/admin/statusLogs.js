// routes/admin/statusLogs.js
const express = require('express');
const router = express.Router();
const StatusLog = require('../../models/statusLog');

// GET /api/admin/status-logs
router.get('/', async (req, res) => {
  try {
    const logs = await StatusLog.find().sort({ timestamp: -1 }).limit(100);
    res.json(logs);
  } catch (err) {
    console.error('❌ Failed to fetch status logs:', err);
    res.status(500).json({ message: 'Failed to retrieve status logs' });
  }
});

module.exports = router;
