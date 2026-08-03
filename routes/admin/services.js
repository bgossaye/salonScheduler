const express = require('express');
const router = express.Router();
const controller = require('../../controllers/admin/serviceadmincontroller');
const auth = require('../../middleware/authmiddleware');

const { requirePermission, requireAnyPermission } = auth;

router.use(auth);

router.get('/', requirePermission('servicesView'), controller.getServices);
router.post('/', requirePermission('servicesManage'), controller.addService);
router.put('/:id', requirePermission('servicesManage'), controller.updateService);
router.patch('/:id', requireAnyPermission(['servicesManage', 'servicesChangePrices', 'addOnsManage']), controller.patchService);
router.delete('/:id', requirePermission('servicesManage'), controller.deleteService);
router.get('/:id/addons', requirePermission('servicesView'), controller.getSuggestedAddOns);

module.exports = router;
