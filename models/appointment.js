const mongoose = require('mongoose');

const appointmentSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  service: { type: String, required: true }, // Name of main service (snapshot)
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' }, // Reference to service
  date: { type: String, required: true },
  time: { type: String, required: true },
  duration: { type: Number, required: true },
  status: { type: String, default: 'Booked' },
  addOns: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }] // ✅ selected by client at booking
});

module.exports = mongoose.model('Appointment', appointmentSchema);

