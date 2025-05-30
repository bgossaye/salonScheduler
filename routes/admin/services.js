const express = require('express'); 
const router = express.Router(); 
const controller = require('../../controllers/admin/serviceadmincontroller');

router.get('/', controller.getServices);
router.post('/', controller.addService);
router.put('/:id', controller.updateService);
router.patch('/:id', controller.patchService);
router.delete('/:id', controller.deleteService);
router.get('/:id/addons', controller.getSuggestedAddOns);

module.exports = router;