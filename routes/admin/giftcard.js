const express = require('express');
const router = express.Router();
const giftCardController = require('../../controllers/admin/giftcardcontroller');

// Create digital or physical gift card
router.post('/create', giftCardController.createGiftCard);

// Redeem card by code or phone
router.post('/redeem', giftCardController.redeemGiftCard);
router.get('/redeem-search/:code', giftCardController.getGiftCardByCode);

// Admin card list
router.get('/all', giftCardController.getAllGiftCards);


module.exports = router;
