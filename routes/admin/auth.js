const express = require('express'); const router = express.Router(); const controller = require('../../controllers/admin/authadmincontroller');

router.post('/', controller.login);
// router.post('/register', controller.register); // Optional

module.exports = router;