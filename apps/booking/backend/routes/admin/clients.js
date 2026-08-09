const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/clientadmincontroller');
const multer = require('multer');
const path = require('path');
const auth = require('../../middleware/authmiddleware');

const { requirePermission, requireAnyPermission } = auth;

router.use(auth);

// ─── CRUD ──────────────────────────────
router.post('/', requireAnyPermission(['clientsEditProfile', 'appointmentsCreateOwn', 'appointmentsCreateForOthers', 'appointmentsCreate']), controller.createClient);
router.get('/', requireAnyPermission(['clientsViewAll', 'clientsViewAssigned']), controller.getClients);
router.post('/stylist-switch-request', requireAnyPermission(['clientsViewAssigned', 'clientsViewAll']), controller.requestStylistSwitch);
router.get('/:id/details', requireAnyPermission(['clientsViewAll', 'clientsViewAssigned']), controller.getClientDetails);
router.get('/:id/family/overview', requireAnyPermission(['clientsViewAll', 'clientsViewAssigned']), controller.getAdminFamilyOverview);
router.post('/:id/family/link', requirePermission('clientsEditProfile'), controller.linkExistingFamilyMember);
router.post('/:id/family/create-dependent', requirePermission('clientsEditProfile'), controller.createAdminFamilyDependent);
router.post('/:id/family/:memberId/resend-invitation', requirePermission('clientsEditProfile'), controller.resendPendingFamilyInvitation);
router.post('/:id/family/:memberId/cancel-invitation', requirePermission('clientsEditProfile'), controller.cancelPendingFamilyInvitation);
router.delete('/:id/family/:memberId', requirePermission('clientsEditProfile'), controller.unlinkAdminFamilyMember);
router.patch('/:id', requireAnyPermission(['clientsEditProfile', 'clientsAddNotes', 'clientsAssignStylist']), controller.updateClient);
router.post('/:id/family/:memberId/unblock-invitations', requirePermission('clientsEditProfile'), controller.unblockFamilyInvitations);
router.post('/:id/family/:memberId/clear-decline-cooldown', requirePermission('clientsEditProfile'), controller.clearFamilyInvitationDeclineCooldown);
router.delete('/:id', requirePermission('clientsDelete'), controller.deleteClient);

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `client-${req.params.id}${ext}`);
  },
});
const upload = multer({ storage });

router.post('/:id/upload-photo', requirePermission('clientsEditProfile'), upload.single('image'), controller.uploadClientPhoto);

router.post('/:id/pin/unlock', requirePermission('clientsEditProfile'), controller.adminUnlockPin);
router.patch('/:id/pin/reset', requirePermission('clientsEditProfile'), controller.adminResetPin);
router.post('/:id/pin/send-reset-otp', requirePermission('clientsEditProfile'), controller.adminSendResetOtp);

module.exports = router;
