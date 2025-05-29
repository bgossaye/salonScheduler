const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  category: { type: String, required: true },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  duration: { type: Number, required: true },
  steps: [
    {
      name: { type: String, required: true },
      duration: { type: Number, required: true }
    }
  ],
  suggestedAddOns: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }]
});

module.exports = mongoose.model('Service', serviceSchema);
