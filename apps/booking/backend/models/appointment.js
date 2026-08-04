const mongoose = require('mongoose');

const appliedPromotionSchema = new mongoose.Schema({
  dealId: { type: String, default: '' },
  title: { type: String, default: '' },
  type: { type: String, enum: ['auto', 'coupon'], default: 'auto' },
  source: { type: String, enum: ['auto', 'coupon'], default: 'auto' },
  couponCode: { type: String, default: '' },
  discountType: { type: String, enum: ['percent', 'fixed'], default: 'percent' },
  discountValue: { type: Number, default: 0 },
  discountPercent: { type: Number, default: 0 },
  appointmentLabel: { type: String, default: '' },
  shortLabel: { type: String, default: '' },
  appliedAt: { type: Date, default: Date.now },
}, { _id: false });


const groupBookingSnapshotSchema = new mongoose.Schema({
  groupBookingId: { type: String, default: '' },
  groupType: { type: String, enum: ['family', 'caregiver', 'nursing_home', 'wedding', 'event', 'other'], default: 'other' },
  groupLabel: { type: String, default: '' },
  bookedByContactName: { type: String, default: '' },
  bookedByContactPhone: { type: String, default: '' },
  coordinationNotes: { type: String, default: '' },
  participantStatus: { type: String, enum: ['existing_client', 'event_guest', 'converted_client'], default: 'existing_client' },
  participantRole: { type: String, default: '' },
  participantNotes: { type: String, default: '' },
  sequence: { type: Number, default: 1 },
  totalAppointments: { type: Number, default: 1 },
}, { _id: false });

const priceSnapshotSchema = new mongoose.Schema({
  serviceId: { type: String, default: '' },
  serviceName: { type: String, default: '' },
  workerId: { type: String, default: '' },
  workerName: { type: String, default: '' },
  workerTierKey: { type: String, default: '' },
  workerTitle: { type: String, default: '' },
  servicePrice: { type: Number, default: 0 },
  addOnPrice: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  finalPrice: { type: Number, default: 0 },
  currency: { type: String, default: 'USD' },
  capturedAt: { type: Date, default: Date.now },
}, { _id: false });

const appointmentSchema = new mongoose.Schema({
  clientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true },
  service: { type: String, required: true },
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service' },
  workerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null, index: true },
  workerName: { type: String, default: '' },
  workerTierKey: { type: String, default: '' },
  workerTitle: { type: String, default: '' },
  date: { type: String, required: true, index: true },
  time: { type: String, required: true },
  duration: { type: Number, required: true },
  status: { type: String, default: 'booked', index: true },
  bookingFlags: [{ type: String }],
  clientDefaultStylistAtBooking: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },
  bookedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  bookedByWorkerId: { type: mongoose.Schema.Types.ObjectId, ref: 'Worker', default: null },
  bookedByRole: { type: String, default: '' },
  bookedByName: { type: String, default: '' },
  oneTimeStylistChange: { type: Boolean, default: false },
  clientOwnerStylistNotified: { type: Boolean, default: false },
  ownerStylistNotificationStatus: { type: String, enum: ['not_required', 'pending', 'reviewed'], default: 'not_required' },
  requiresReceivingStylistConfirmation: { type: Boolean, default: false },
  receivingStylistConfirmationStatus: { type: String, enum: ['not_required', 'pending', 'accepted', 'declined'], default: 'not_required' },
  addOns: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }],
  couponCode: { type: String, default: '' },
  appliedPromotion: { type: appliedPromotionSchema, default: null },
  priceSnapshot: { type: priceSnapshotSchema, default: null },
  groupBooking: { type: groupBookingSnapshotSchema, default: null },
  archived: { type: Boolean, default: false, index: true },
  archivedAt: { type: Date, default: null },
  archiveReason: { type: String, default: '' },
  retentionHold: { type: Boolean, default: false, index: true },
  retentionHoldReason: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.models.Appointment || mongoose.model('Appointment', appointmentSchema);
