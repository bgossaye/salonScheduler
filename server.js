require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();

// ✅ Define CORS whitelist
const allowedOrigins = ['https://rakiesalon.com', 'https://www.rakiesalon.com'];

// ✅ Mongoose setup
mongoose.set('bufferCommands', false);
mongoose.connection.on('error', err => {
  console.error('❗ Mongoose connection error:', err);
});

// ✅ Async startup block
(async () => {
  try {
    console.log("ENV VARS (DEBUG):", process.env);
    console.log("Connecting to MongoDB...");

    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/salon', {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });

    console.log('✅ MongoDB connected');

    // ✅ Middleware
    app.use(cors({
      origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
          return callback(null, true);
        }
        return callback(new Error('Not allowed by CORS'));
      },
      credentials: true
    }));

    app.use(express.json());
    app.use('/uploads', express.static('uploads'));

    // ✅ Public Routes
    app.use('/api/clients', require('./routes/client/clients'));
    app.use('/api/appointments', require('./routes/client/appointments'));
    app.use('/api/services', require('./routes/client/services'));
    app.use('/api/availability', require('./routes/shared/availability'));
    app.use('/api/schedule', require('./routes/schedulingroutes'));

    // ✅ Admin Routes
    app.use('/api/admin/appointments', require('./routes/admin/appointments'));
    app.use('/api/admin/clients', require('./routes/admin/clients'));
    app.use('/api/admin/services', require('./routes/admin/services'));
    app.use('/api/admin/store-hours', require('./routes/admin/storehours'));
    app.use('/api/admin/reminders', require('./routes/admin/reminders'));
    app.use('/api/admin/login', require('./routes/admin/auth'));
    app.use('/api/admin/reports', require('./routes/admin/reports'));
    app.use('/api/admin/export', require('./routes/admin/export'));

    // ✅ Friendly root message
    app.get('/', (req, res) => {
      res.send('👋 Welcome to the Rakie Salon API. The server is running!');
    });

    // ✅ Start server only after DB connection
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });

  } catch (err) {
    console.error('❌ Server startup failed:', err);
    process.exit(1);
  }
})();
