const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/clientadmincontroller');

// ✅ OTP endpoints (mounted at /api/clients/…)
router.post('/pin/request-otp', controller.requestPinOtp);
router.post('/pin/verify-otp', controller.verifyPinOtp);
router.post('/pin/set', controller.setPinWithOtp);

router.get('/', controller.getClients);
router.get('/all', controller.getClients);
router.post('/', controller.createClient);

 // PATCH /api/clients/:id  (use controller so pin/pinConfirm are hashed properly)
 router.patch('/:id', controller.updateClient);
 // Optional: keep PUT for compatibility, but delegate to same controller
 router.put('/:id', controller.updateClient);

router.post('/login', controller.loginClient);

module.exports = router;
