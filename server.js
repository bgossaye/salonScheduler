require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();
const cron = require('node-cron');
const sendSMS = require('./utils/sendSMS');
const Appointment = require('./models/appointment');
const Client = require('./models/client');
const giftCardRoutes = require('./routes/admin/giftcard');
const path = require('path'); 
const helmet = require("helmet");
const { googleReviewsHandler } = require('./routes/google'); 
cron.schedule('0 8 * * *', async () => {
    await sendDailyReminders();
});
const inbound = require('./routes/twilioInbound');

async function sendDailyReminders() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    const formattedDate = `${yyyy}-${mm}-${dd}`;

    const appointments = await Appointment
      .find({ date: formattedDate })
      .populate('clientId serviceId');

    for (const appt of appointments) {
        if (!appt.clientId) continue;
        if (appt.status !== 'booked') continue;
      // Use DB template (NotificationSettings.reminder); no hard-coded message:
        await sendSMS('reminder', appt);
    }
}


// at top
mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');
    // now continue with the rest of your startup (e.g., app.listen)
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));

// ✅ Middleware

function toOriginArray(val) {
  if (!val) return [];
  if (Array.isArray(val)) return val.filter(Boolean).map(String);

  // Accept JSON array in env: ["http://localhost:3001","https://rakiesalon.com"]
  if (typeof val === 'string' && val.trim().startsWith('[')) {
    try {
      const parsed = JSON.parse(val);
      if (Array.isArray(parsed)) return parsed.filter(Boolean).map(String);
    } catch (_) { /* fall through */ }
  }

  // Comma/whitespace-separated string: a,b c
  if (typeof val === 'string') {
    return val
      .split(/[,\s]+/)
      .map(s => s.trim())
      .filter(Boolean);
  }

  // Object (e.g., {DEV:"http://...", PROD:"https://..."})
  if (typeof val === 'object') {
    return Object.values(val)
      .flat()
      .filter(Boolean)
      .map(String);
  }

  // Fallback: single value
  return [String(val)];
}

const allowedOrigins = toOriginArray(process.env.ALLOWED_ORIGINS || [
  "https://rakiesalon.com",
  "https://www.rakiesalon.com",
  "http://localhost:3000",
  "http://localhost:3001"
]);
const allowedOriginSet = new Set(allowedOrigins);

// Handy local checks
const isLocal = (o) =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(o || '');

console.log('[CORS] allowedOrigins:', allowedOrigins);

app.use(cors({
  origin(origin, cb) {
    // allow non-browser tools (curl/cron) with no Origin header
    if (!origin) return cb(null, true);

    // allow localhost always
    if (isLocal(origin)) return cb(null, true);

    // allow exact matches from env/default list
    if (allowedOriginSet.has(origin)) return cb(null, true);

    return cb(new Error(`CORS blocked for origin: ${origin}`));
  },
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  credentials: true,
  maxAge: 86400,
}));

app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use('/uploads', express.static('uploads'));

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
}));

 // Health (Mongo-backed awake marker)
 //app.use('/api', require('./routes/health'));

// ─────────────────────────────────────────────────────────────
// Lightweight health endpoint (NO DB check; safe for cron/wake)
// Supports GET (fetch) and POST (sendBeacon)
// ─────────────────────────────────────────────────────────────
app.get('/api/healthz', (req, res) => {
  res.set('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, ts: Date.now() });
});

app.post('/api/healthz', (req, res) => {
  // sendBeacon uses POST; keep it ultra-light
  return res.status(204).end();
});

// Compatibility shim for old monitors:
app.get('/healthz', (req, res) => res.redirect(307, '/api/healthz'));

// ─────────────────────────────────────────────────────────────
// Cron wake (token-protected; NO DB; safe under repeated calls)
// ─────────────────────────────────────────────────────────────
app.get('/api/cron-wake', (req, res) => {
  const token = String(req.query.token || '');
  const expected = String(process.env.CRON_WAKE_TOKEN || '');

  // If token is configured, require it
  if (expected && token !== expected) {
    return res.status(401).json({ ok: false });
  }

  res.set('Cache-Control', 'no-store');
  return res.status(200).json({ ok: true, ts: Date.now() });
});


// Vanity redirects
app.get(['/admin', '/admin/', '/booking/admin', '/booking/admin/'], (req, res) => {
  res.redirect(301, '/booking/admin/login');
});

// booking build is in ../frontend/build
const bookingBuild = path.join(__dirname, '..', 'frontend', 'build');

// site build is in ../../site/build
const siteBuild = path.join(__dirname, '..', '..', 'site', 'build');

app.get('/api/google-reviews', googleReviewsHandler); 

// ✅ Public Routes
const clientRoutes =      require('./routes/client/clients');
const appointmentRoutes = require('./routes/client/appointments');
const serviceRoutes =     require('./routes/client/services');
const availabilityRoutes = require('./routes/shared/availability');
const schedulingRoutes = require('./routes/schedulingroutes');

// Use the route
app.use('/api/clients', clientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/schedule', schedulingRoutes);


// ✅ Admin Routes
const adminAppointments = require('./routes/admin/appointments');
const adminClients = require('./routes/admin/clients');
const adminServices = require('./routes/admin/services');
const adminStoreHours = require('./routes/admin/storehours');
const adminAuth = require('./routes/admin/auth');
const adminReports = require('./routes/admin/reports');
const adminExport = require('./routes/admin/export');
const notificationtemplate = require('./routes/admin/notificationtemplate');

app.use('/api/admin/appointments', adminAppointments);
app.use('/api/admin/clients', adminClients);
app.use('/api/admin/services', adminServices);
app.use('/api/admin/store-hours', adminStoreHours);
app.use('/api/admin/login', adminAuth);
app.use('/api/admin/reports', adminReports);
app.use('/api/admin/export', adminExport);
app.use('/api/twilio', require('./routes/external/twilio'));
app.use('/api/admin/status-logs', require('./routes/admin/statuslogs'));
app.use('/api/giftcards', giftCardRoutes);
app.use('/api/admin/notificationsettings', notificationtemplate);

// Serve booking at /booking
 app.use('/booking', express.static(bookingBuild, { index: false }));
 app.use(express.static(siteBuild, { index: false }));

app.get('/booking/*', (_, res) => res.sendFile(path.join(bookingBuild, 'index.html')));
app.get('*', (_, res) => res.sendFile(path.join(siteBuild, 'index.html')));

app.use('/api/sms', inbound);

// ✅ Server start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
 /* 
setTimeout(async () => {
  try {
    await sendDailyReminders();
  } catch (err) {
    console.error('❌ Failed to run daily reminders:', err);
  }
}, 5000);
*/
});
