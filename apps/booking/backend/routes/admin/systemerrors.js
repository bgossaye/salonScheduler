const express = require('express');
const router = express.Router();
const auth = require('../../middleware/authmiddleware');
const controller = require('../../controllers/admin/systemerrorscontroller');

router.use(auth);
router.get('/', auth.requirePermission('systemErrorsView'), controller.listErrors);
router.patch('/resolve-all', auth.requirePermission('systemErrorsView'), controller.markAllResolved);
router.patch('/:id/resolve', auth.requirePermission('systemErrorsView'), controller.markResolved);

module.exports = router;
