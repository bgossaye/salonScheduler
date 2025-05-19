require('dotenv').config();
const mongoose = require('mongoose');
const StoreHours = require('../models/Storehours');

const storeHours = [
  { day: 'Sunday', open: '10:00', close: '16:00' },
  { day: 'Monday', open: '09:00', close: '18:00' },
  { day: 'Tuesday', open: '09:00', close: '18:00' },
  { day: 'Wednesday', open: '09:00', close: '18:00' },
  { day: 'Thursday', open: '09:00', close: '18:00' },
  { day: 'Friday', open: '09:00', close: '18:00' },
  { day: 'Saturday', open: '10:00', close: '17:00' }
];

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
  .then(async () => {
    await StoreHours.deleteMany();
    await StoreHours.insertMany(storeHours);
    process.exit();
  })
  .catch(err => {
    console.error('❌ Error seeding store hours:', err);
    process.exit(1);
  });
