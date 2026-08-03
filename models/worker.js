const mongoose = require('mongoose');

const TIERS = ['assistant', 'junior', 'regular', 'senior', 'master', 'elite', 'owner', 'custom'];

const serviceAssignmentSchema = new mongoose.Schema({
  serviceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Service', required: true },
  enabled: { type: Boolean, default: true },
  allowOnlineBooking: { type: Boolean, default: true },
  price: { type: Number, min: 0, default: null },
  duration: { type: Number, min: 0, default: null },
  commissionPercent: { type: Number, min: 0, max: 100, default: null },
  notes: { type: String, default: '' },
}, { _id: false });

const weeklyScheduleSchema = new mongoose.Schema({
  day: { type: String, default: '' },
  enabled: { type: Boolean, default: true },
  start: { type: String, default: '' },
  end: { type: String, default: '' },
  breaks: [{
    start: { type: String, default: '' },
    end: { type: String, default: '' },
    label: { type: String, default: '' },
  }],
}, { _id: false });

const blockedTimeSchema = new mongoose.Schema({
  blockId: { type: String, default: '' },
  type: { type: String, enum: ['time_off', 'break', 'personal', 'vacation', 'sick', 'training', 'other'], default: 'time_off' },
  status: { type: String, enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'approved' },
  requestedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  decidedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  decidedAt: { type: Date, default: null },
  requestNote: { type: String, default: '' },
  adminNote: { type: String, default: '' },
  label: { type: String, default: '' },
  startDate: { type: String, default: '' },
  endDate: { type: String, default: '' },
  startTime: { type: String, default: '' },
  endTime: { type: String, default: '' },
  allDay: { type: Boolean, default: true },
  active: { type: Boolean, default: true },
}, { _id: false });

const portfolioImageSchema = new mongoose.Schema({
  url: { type: String, default: '' },
  caption: { type: String, default: '' },
}, { _id: false });

const workerSchema = new mongoose.Schema({
  systemKey: { type: String, default: '', trim: true, index: true },
  firstName: { type: String, required: true, trim: true },
  lastName: { type: String, default: '', trim: true },
  displayName: { type: String, default: '', trim: true },
  email: { type: String, default: '', trim: true, lowercase: true },
  phone: { type: String, default: '', trim: true },

  roleId: { type: mongoose.Schema.Types.ObjectId, ref: 'StaffRole', default: null },
  roleKey: { type: String, default: 'stylist', trim: true, lowercase: true },
  tierKey: { type: String, enum: TIERS, default: 'regular', index: true },
  title: { type: String, default: 'Stylist', trim: true },

  photoUrl: { type: String, default: '' },
  profilePhoto: { type: String, default: '' },
  shortBio: { type: String, default: '' },
  bio: { type: String, default: '' },
  experienceYears: { type: Number, min: 0, default: null },
  specialties: [{ type: String, trim: true }],
  languages: [{ type: String, trim: true }],
  certifications: [{ type: String, trim: true }],
  portfolioImages: [portfolioImageSchema],

  active: { type: Boolean, default: true, index: true },
  showOnline: { type: Boolean, default: true, index: true },
  onlineBookable: { type: Boolean, default: true, index: true },
  canUseChemicals: { type: Boolean, default: true },
  canTakeWalkIns: { type: Boolean, default: true },
  isDefault: { type: Boolean, default: false, index: true },
  protectedWorker: { type: Boolean, default: false },

  color: { type: String, default: '' },
  bookingOrder: { type: Number, default: 100 },
  weeklySchedule: [weeklyScheduleSchema],
  blockedTimes: [blockedTimeSchema],
  serviceAssignments: [serviceAssignmentSchema],
  notes: { type: String, default: '' },
}, { timestamps: true });

workerSchema.virtual('fullName').get(function fullName() {
  return [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
});

workerSchema.pre('validate', function normalizeWorker(next) {
  if (!this.displayName) this.displayName = [this.firstName, this.lastName].filter(Boolean).join(' ').trim();
  if (!this.photoUrl && this.profilePhoto) this.photoUrl = this.profilePhoto;
  if (!this.profilePhoto && this.photoUrl) this.profilePhoto = this.photoUrl;
  this.roleKey = String(this.roleKey || 'stylist').trim().toLowerCase();
  this.onlineBookable = this.showOnline !== false && this.onlineBookable !== false;
  next();
});

workerSchema.index({ active: 1, showOnline: 1, onlineBookable: 1, bookingOrder: 1 });
workerSchema.index({ 'serviceAssignments.serviceId': 1 });
workerSchema.index({ systemKey: 1 }, { unique: true, sparse: true, partialFilterExpression: { systemKey: { $type: 'string', $ne: '' } } });
workerSchema.index({ email: 1 }, { unique: true, sparse: true, partialFilterExpression: { email: { $type: 'string', $ne: '' } } });

module.exports = mongoose.models.Worker || mongoose.model('Worker', workerSchema);
