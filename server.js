require('dotenv').config();
console.log("ENV VARS (DEBUG):", process.env);
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const app = express();

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


// ✅ Public Routes
const clientRoutes =      require('./src/routes/client/clients');
const appointmentRoutes = require('./src/routes/client/appointments');
const serviceRoutes =     require('./src/routes/client/services');
const availabilityRoutes = require('./src/routes/shared/availability');
const schedulingRoutes = require('./src/routes/schedulingroutes');

// Use the route
app.use('/api/clients', clientRoutes);
app.use('/api/appointments', appointmentRoutes);
app.use('/api/services', serviceRoutes);
app.use('/api/availability', availabilityRoutes);
app.use('/api/schedule', schedulingRoutes);


// ✅ Admin Routes
const adminAppointments = require('./src/routes/admin/appointments');
const adminClients = require('./src/routes/admin/clients');
const adminServices = require('./src/routes/admin/services');
const adminStoreHours = require('./src/routes/admin/storehours');
const adminReminders = require('./src/routes/admin/reminders');
const adminAuth = require('./src/routes/admin/auth');
const adminReports = require('./src/routes/admin/reports');
const adminExport = require('./src/routes/admin/export');

app.use('/api/admin/appointments', adminAppointments);
app.use('/api/admin/clients', adminClients);
app.use('/api/admin/services', adminServices);
app.use('/api/admin/store-hours', adminStoreHours);
app.use('/api/admin/reminders', adminReminders);
app.use('/api/admin/login', adminAuth);
app.use('/api/admin/reports', adminReports);
app.use('/api/admin/export', adminExport);

// ✅ Friendly root message
app.get('/', (req, res) => {
  res.send('👋 Welcome to the Rakie Salon API. The server is running!');
});

// ✅ Server start
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
