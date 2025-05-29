const express = require('express'); const router = express.Router(); const controller = require('../../controllers/admin/serviceadmincontroller');

router.get('/', controller.getServices);
router.post('/', controller.addService);
router.patch('/:id', controller.updateService);
router.delete('/:id', controller.deleteService);

module.exports = router;