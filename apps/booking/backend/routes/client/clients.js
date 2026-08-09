const express = require('express');
const router = express.Router();
const controller = require('../../controllers/client/clientcontroller');
const authenticateClient = require('../../middleware/clientauthmiddleware');
const { requireClientSelfParam, optionalClientAuth } = authenticateClient;
const { noStoreInvitation, publicInvitationReadLimiter, publicInvitationActionLimiter, familyInviteSendLimiter } = require('../../middleware/familyInvitationSecurity');

// Public/client PIN + OTP endpoints mounted at /api/clients/…
router.post('/pin/request-otp', controller.requestPinOtp);
router.post('/pin/verify-otp', controller.verifyPinOtp);
router.post('/pin/set', controller.setPinWithOtp);

// Public, single-purpose family invitation links. The secure token grants access
// only to viewing/responding to that one pending invitation; it is not a client login.
router.get('/family-invitations/:token', noStoreInvitation, publicInvitationReadLimiter, controller.getPublicFamilyInvitation);
router.post('/family-invitations/:token/request-accept-otp', noStoreInvitation, publicInvitationActionLimiter, controller.requestPublicFamilyInvitationAcceptOtp);
router.post('/family-invitations/:token/respond', noStoreInvitation, publicInvitationActionLimiter, controller.respondPublicFamilyInvitation);

// Public/client profile endpoints. Admin-side client management remains under /api/admin/clients.
router.get('/', optionalClientAuth, controller.getClients);
router.get('/all', optionalClientAuth, controller.getClients);
router.post('/', controller.createClient);
router.patch('/:id', authenticateClient, requireClientSelfParam('id'), controller.updateClient);
router.put('/:id', authenticateClient, requireClientSelfParam('id'), controller.updateClient);
router.post('/login', controller.loginClient);
router.get('/:id/family', authenticateClient, requireClientSelfParam('id'), controller.getFamilyMembers);
router.get('/:id/family/overview', authenticateClient, requireClientSelfParam('id'), controller.getFamilyOverview);
router.post('/:id/family', authenticateClient, requireClientSelfParam('id'), familyInviteSendLimiter, controller.addFamilyMember);
router.post('/:id/family/invitations/:requesterId/request-accept-otp', authenticateClient, requireClientSelfParam('id'), controller.requestFamilyInvitationAcceptOtp);
router.post('/:id/family/invitations/:requesterId/respond', authenticateClient, requireClientSelfParam('id'), controller.respondFamilyInvitation);
router.patch('/:id/family/:memberId', authenticateClient, requireClientSelfParam('id'), controller.updateFamilyMember);
router.delete('/:id/family/:memberId', authenticateClient, requireClientSelfParam('id'), controller.unlinkFamilyMember);

module.exports = router;
