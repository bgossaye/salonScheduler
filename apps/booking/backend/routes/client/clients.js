const express = require('express');
const router = express.Router();
const controller = require('../../controllers/client/clientcontroller');

// Public/client PIN + OTP endpoints mounted at /api/clients/…
router.post('/pin/request-otp', controller.requestPinOtp);
router.post('/pin/verify-otp', controller.verifyPinOtp);
router.post('/pin/set', controller.setPinWithOtp);

// Public/client profile endpoints. Admin-side client management remains under /api/admin/clients.
router.get('/', controller.getClients);
router.get('/all', controller.getClients);
router.post('/', controller.createClient);
router.patch('/:id', controller.updateClient);
router.put('/:id', controller.updateClient);
router.post('/login', controller.loginClient);
router.get('/:id/family', controller.getFamilyMembers);
router.get('/:id/family/overview', controller.getFamilyOverview);
router.post('/:id/family', controller.addFamilyMember);
router.patch('/:id/family/:memberId', controller.updateFamilyMember);
router.delete('/:id/family/:memberId', controller.unlinkFamilyMember);

module.exports = router;
