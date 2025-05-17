const mongoose = require('mongoose');
const BookingSchema = new mongoose.Schema({
  date: { type: String, required: true },
  time: { type: String, required: true },
  service: { type: String, required: true },
  duration: { type: Number, required: true }
});
module.exports = mongoose.model('Booking', BookingSchema);