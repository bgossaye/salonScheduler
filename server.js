require('dotenv').config();
console.log("ENV VARS (DEBUG):", process.env);
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

async function sendDailyReminders() {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yyyy = tomorrow.getFullYear();
    const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
    const dd = String(tomorrow.getDate()).padStart(2, '0');
    const formattedDate = `${yyyy}-${mm}-${dd}`;

    const appointments = await Appointment.find({ date: formattedDate }).populate('clientId');

    for (const appt of appointments) {
        if (!appt.clientId) continue;
        if (appt.status !== 'booked') continue;
        await sendSMS('reminder', appt, {
            message: `Reminder: You have an appointment tomorrow at ${appt.time} with Rakie Salon.`
        });
    }
}

// ✅ MongoDB connection using env variable or local fallback
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/salon', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// ✅ Middleware
app.use(cors());
app.use(express.urlencoded({ extended: false }));
app.use(express.json());

app.use('/uploads', express.static('uploads'));

app.use(helmet());

// Ultra-light health endpoint: zero response body, optional DB ping, optional key
// --- in server.js (additions/edits near your existing health handler) ---
const KEEPALIVE_KEY = process.env.KEEPALIVE_KEY || '';

async function healthHandler(req, res) {
  try {
    // Optional shared-secret gate
    if (KEEPALIVE_KEY && req.query?.k !== KEEPALIVE_KEY && req.body?.k !== KEEPALIVE_KEY) {
      return res.status(204).set('Cache-Control', 'no-store').end();
    }
    // Optional DB ping if asked (heavier)
    if ((req.query?.db === '1' || req.body?.db === '1') && mongoose?.connection?.db?.admin) {
      try { await mongoose.connection.db.admin().ping(); } catch {}
    }
    return res.status(204).set('Cache-Control', 'no-store').end();
  } catch {
    return res.status(204).set('Cache-Control', 'no-store').end();
  }
}
app.use(express.json()); // ensure JSON body parsed before routes

app.get('/healthz', healthHandler);
app.head('/healthz', healthHandler);
app.post('/healthz', healthHandler);

app.get('/api/healthz', healthHandler);
app.head('/api/healthz', healthHandler);
app.post('/api/healthz', healthHandler);

// (Optional) short alias if you want: /ping → /healthz
app.all('/ping', healthHandler);
app.all('/api/ping', healthHandler);


// Vanity redirects
app.get(['/admin', '/admin/', '/booking/admin', '/booking/admin/'], (req, res) => {
  res.redirect(301, '/booking/admin/login');
});

// booking build is in ../frontend/build
const bookingBuild = path.join(__dirname, '..', 'frontend', 'build');

// site build is in ../../site/build
const siteBuild = path.join(__dirname, '..', '..', 'site', 'build');

// Serve site at /
app.use(express.static(siteBuild));

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
const adminReminders = require('./routes/admin/reminders');
const adminAuth = require('./routes/admin/auth');
const adminReports = require('./routes/admin/reports');
const adminExport = require('./routes/admin/export');
const adminNotificationSettings = require('./routes/admin/notificationsettings');

app.use('/api/admin/appointments', adminAppointments);
app.use('/api/admin/clients', adminClients);
app.use('/api/admin/services', adminServices);
app.use('/api/admin/store-hours', adminStoreHours);
app.use('/api/admin/reminders', adminReminders);
app.use('/api/admin/login', adminAuth);
app.use('/api/admin/reports', adminReports);
app.use('/api/admin/export', adminExport);
app.use('/api/twilio', require('./routes/external/twilio'));
app.use('/api/admin/status-logs', require('./routes/admin/statuslogs'));
app.use('/api/giftcards', giftCardRoutes);
app.use('/api/admin/notificationsettings', adminNotificationSettings);

// Serve booking at /booking
app.use('/booking', express.static(bookingBuild));
app.get('/booking/*', (_, res) => res.sendFile(path.join(bookingBuild, 'index.html')));

app.get('*', (_, res) => res.sendFile(path.join(siteBuild, 'index.html')));

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
