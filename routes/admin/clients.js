const express = require('express'); 
const router = express.Router(); 
const controller = require('../../controllers/admin/clientadmincontroller');
const multer = require('multer');
const path = require('path');

// ✅ JWT auth middleware (verifies token and sets req.admin)
const auth = require('../../middleware/authmiddleware');

// Optional: enforce actual admin role on top of JWT being valid
const requireAdmin = (req, res, next) => {
  if (req.admin?.role !== 'admin') return res.status(403).json({ error: 'Forbidden' });
  next();
};

// ─── CRUD ──────────────────────────────
router.post('/', controller.createClient);
router.get('/', controller.getClients);
router.get('/:id/details', controller.getClientDetails);
router.patch('/:id', controller.updateClient);
router.delete('/:id', controller.deleteClient);


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

// ✅ Admin PIN management (now protected)
router.post('/:id/pin/unlock',       auth, requireAdmin, controller.adminUnlockPin);
router.patch('/:id/pin/reset',        auth, requireAdmin, controller.adminResetPin);
router.post('/:id/pin/send-reset-otp',auth, requireAdmin, controller.adminSendResetOtp);

module.exports = router;