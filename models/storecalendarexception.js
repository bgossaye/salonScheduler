const mongoose = require('mongoose');

const StoreCalendarExceptionSchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  reason: {
    type: String,
    enum: ['holiday', 'maintenance', 'emergency', 'staff_event', 'weather', 'online_off', 'custom'],
    default: 'custom',
    index: true,
  },
  startDate: { type: String, required: true, index: true }, // YYYY-MM-DD local business date
  endDate: { type: String, required: true, index: true },   // YYYY-MM-DD local business date

  // Store-closed affects the physical business and availability.
  storeClosed: { type: Boolean, default: false },

  // Online-booking-off affects customers only. Staff/admin can still book manually.
  onlineBookingOff: { type: Boolean, default: false },
  phoneCallRequired: { type: Boolean, default: false },

  // Optional special hours for dates where the store is open but not using normal weekly hours.
  open: { type: String, default: '' },
  close: { type: String, default: '' },

  customerMessage: { type: String, default: '' },
  internalNote: { type: String, default: '' },
  active: { type: Boolean, default: true, index: true },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin' },
}, { timestamps: true });

StoreCalendarExceptionSchema.index({ active: 1, startDate: 1, endDate: 1 });

module.exports = mongoose.model('StoreCalendarException', StoreCalendarExceptionSchema);
