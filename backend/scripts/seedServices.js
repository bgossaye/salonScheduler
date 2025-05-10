require('dotenv').config();
const mongoose = require('mongoose');
const Service = require('../models/Service');

const services = [
  { category: 'Hair', name: 'Braids', price: 85, duration: 120 },
  { category: 'Hair', name: 'Twists', price: 70, duration: 90 },
  { category: 'Nails', name: 'Manicure', price: 40, duration: 45 },
  { category: 'Nails', name: 'Pedicure', price: 50, duration: 50 },
  { category: 'Skin', name: 'Facial', price: 60, duration: 60 },
  { category: 'Skin', name: 'Acne Treatment', price: 75, duration: 60 }
];

mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(async () => {
  await Service.deleteMany();
  await Service.insertMany(services);
  console.log('✅ Services successfully seeded with categories.');
  process.exit();
})
.catch(err => {
  console.error('❌ Error seeding services:', err);
  process.exit(1);
});
