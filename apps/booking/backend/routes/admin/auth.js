const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/authadmincontroller');
const auth = require('../../middleware/authmiddleware');

router.post('/', controller.login);
router.get('/token-status', controller.tokenStatus);
router.post('/accept-invite', controller.acceptInvite);
router.post('/request-password-reset', controller.requestPasswordReset);
router.post('/reset-password', controller.resetPasswordWithToken);
router.get('/me', auth, controller.me);
router.post('/change-password', auth, controller.changePassword);
// router.post('/register', controller.register); // Optional

module.exports = router;
