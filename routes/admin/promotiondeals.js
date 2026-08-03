const express = require('express');
const router = express.Router();
const auth = require('../../middleware/authmiddleware');
const ctl = require('../../controllers/admin/promotiondealscontroller');

router.use(auth);
router.get('/', auth.requirePermission('dealsView'), ctl.list);
router.post('/', auth.requirePermission('dealsManage'), ctl.create);
router.put('/:id', auth.requirePermission('dealsManage'), ctl.update);
router.patch('/:id/status', auth.requirePermission('dealsManage'), ctl.setStatus);
router.delete('/:id', auth.requirePermission('dealsManage'), ctl.remove);

module.exports = router;
