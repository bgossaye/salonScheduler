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

cron.schedule('0 8 * * *', async () => {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  const yyyy = tomorrow.getFullYear();
  const mm = String(tomorrow.getMonth() + 1).padStart(2, '0');
  const dd = String(tomorrow.getDate()).padStart(2, '0');
  const formattedDate = `${yyyy}-${mm}-${dd}`;

  const appointments = await Appointment.find({ date: formattedDate });

  for (const appt of appointments) {
    const client = await Client.findById(appt.clientId);
    if (client?.phone) {
      await sendSMS(client.phone, `Reminder: You have an appointment tomorrow at ${appt.time} with Rakie Salon.`);
    }
  }
});

// ✅ MongoDB connection using env variable or local fallback
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/salon', {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('✅ MongoDB connected'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// ✅ Middleware
app.use(cors());
app.use(express.json());

app.use('/uploads', express.static('uploads'));
app.get('/api/ping', (req, res) => {
  res.status(200).send('pong');
});

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


// ✅ Server start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
