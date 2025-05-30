const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  category: { type: String, required: true }, // e.g., 'Color', 'Add-ons'
  name: { type: String, required: true },
  price: { type: Number, required: true },
  duration: { type: Number, required: true },
  steps: [
    {
      name: { type: String, required: true },
      duration: { type: Number, required: true }
    }
  ],
  isAddOn: { type: Boolean, default: false }, 
  suggestedAddOns: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }] 
});

module.exports = mongoose.model('Service', serviceSchema);
