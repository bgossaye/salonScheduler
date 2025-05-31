const express = require('express'); 
const router = express.Router(); 
const controller = require('../../controllers/admin/clientadmincontroller');

router.post('/', controller.createClient);
router.get('/', controller.getClients);
router.get('/:id', controller.getClientDetails);
router.patch('/:id', controller.updateClient);
router.delete('/:id', controller.deleteClient);
router.get('/:id/details', controller.getClientWithLastCompletedAppointment);

const multer = require('multer');
const path = require('path');

// Configure multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, 'uploads/'),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, `client-${req.params.id}${ext}`);
  },
});
const upload = multer({ storage });

router.post('/:id/upload-photo', upload.single('image'), controller.uploadClientPhoto);


module.exports = router;