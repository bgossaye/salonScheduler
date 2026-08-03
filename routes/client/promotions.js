const express = require('express');
const router = express.Router();
const {
  getPromotionConfig,
  validateCoupon,
} = require('../../utils/promotions');

router.get('/active', async (req, res) => {
  try {
    const config = await getPromotionConfig();
    res.json(config);
  } catch (err) {
    console.error('Failed to fetch active promotion config:', err);
    res.status(500).json({ error: 'Failed to fetch active promotion config' });
  }
});

router.post('/validate-coupon', async (req, res) => {
  try {
    const result = await validateCoupon(req.body || {});
    if (!result.valid) {
      return res.status(400).json({ valid: false, error: result.reason || 'Coupon is not valid for this service/date.' });
    }

    res.json({ valid: true, deal: result.deal });
  } catch (err) {
    console.error('Failed to validate coupon:', err);
    res.status(500).json({ valid: false, error: 'Failed to validate coupon.' });
  }
});

module.exports = router;
