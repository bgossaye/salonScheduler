const mongoose = require('mongoose');

const serviceSchema = new mongoose.Schema({
  category: { type: String, required: true }, // e.g., 'Color', 'Add-ons'
  name: { type: String, required: true },

  // Legacy/menu field kept so older admin/service screens do not break.
  // New booking price comes from Worker.serviceAssignments[].price.
  price: { type: Number, required: true },
  duration: { type: Number, required: true },

  startingPrice: { type: Number, min: 0, default: null },
  requiresChemicalPermission: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
  steps: [
    {
      name: { type: String, required: true },
      duration: { type: Number, required: true }
    }
  ],
  isAddOn: { type: Boolean, default: false },
  bookableAsSeparateOnline: { type: Boolean, default: true },
  suggestedAddOns: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }]
}, { timestamps: true });

module.exports = mongoose.models.Service || mongoose.model('Service', serviceSchema);
