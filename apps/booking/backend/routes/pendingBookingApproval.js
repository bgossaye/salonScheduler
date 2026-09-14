const express = require('express');
const router = express.Router();
const {
  getAppointmentForApprovalToken,
  confirmAppointmentWithToken,
} = require('../utils/pendingBookingAdminApproval');

router.get('/:token', async (req, res) => {
  try {
    const { summary } = await getAppointmentForApprovalToken(req.params.token);
    return res.json({ appointment: summary });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.status && err.status < 500 ? err.message : 'Unable to open approval link.',
      code: err.code,
      currentStatus: err.currentStatus,
    });
  }
});

router.post('/:token/confirm', async (req, res) => {
  try {
    const { summary } = await confirmAppointmentWithToken(req.params.token);
    return res.json({ ok: true, appointment: summary });
  } catch (err) {
    return res.status(err.status || 500).json({
      error: err.status && err.status < 500 ? err.message : 'Unable to confirm appointment.',
      code: err.code,
      currentStatus: err.currentStatus,
    });
  }
});

module.exports = router;
