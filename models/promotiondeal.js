const mongoose = require('mongoose');

const promotionDealSchema = new mongoose.Schema({
  systemKey: { type: String, default: '', trim: true, index: true },
  title: { type: String, required: true, trim: true },
  description: { type: String, default: '' },
  status: {
    type: String,
    enum: ['active', 'paused', 'scheduled', 'expired', 'archived'],
    default: 'active',
    index: true,
  },
  type: {
    type: String,
    enum: ['auto', 'coupon'],
    default: 'auto',
    index: true,
  },
  couponCode: {
    type: String,
    default: '',
    trim: true,
    uppercase: true,
    index: true,
  },
  discountType: {
    type: String,
    enum: ['percent', 'fixed'],
    default: 'percent',
  },
  discountValue: { type: Number, required: true, min: 0 },
  discountPercent: { type: Number, min: 0, max: 100 },
  shortLabel: { type: String, default: '' },
  menuLabel: { type: String, default: '' },
  appointmentLabel: { type: String, default: '' },
  serviceOnlyLabel: { type: String, default: '' },
  details: { type: String, default: '' },
  validDays: [{ type: Number, min: 0, max: 6 }],
  startsOn: { type: String, default: '' },
  endsOn: { type: String, default: '' },
  eligibleServiceIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Service' }],
  eligibleServiceNames: [{ type: String }],
  eligibleWorkerIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Worker' }],
  eligibleTierKeys: [{ type: String }],
  showClientBadge: { type: Boolean, default: true },
  showWorkerBadge: { type: Boolean, default: true },
  warnWrongDay: { type: Boolean, default: true },
  usageLimit: { type: Number, default: null, min: 0 },
  perClientLimit: { type: Number, default: null, min: 0 },
  usageCount: { type: Number, default: 0, min: 0 },
  archivedAt: { type: Date, default: null },
  archivedBy: { type: String, default: '' },
  createdBy: { type: String, default: '' },
  updatedBy: { type: String, default: '' },
}, { timestamps: true });

promotionDealSchema.pre('validate', function normalizeCoupon(next) {
  if (this.couponCode) this.couponCode = String(this.couponCode).trim().toUpperCase();
  if (this.type === 'coupon' && !this.couponCode) {
    this.invalidate('couponCode', 'Coupon deals require a coupon code.');
  }
  if (this.type !== 'coupon') this.couponCode = '';

  if (this.discountType === 'percent') {
    this.discountPercent = Number(this.discountValue || 0);
  }

  if (!Array.isArray(this.validDays) || this.validDays.length === 0) {
    this.validDays = [0, 1, 2, 3, 4, 5, 6];
  }

  this.validDays = [...new Set(
    this.validDays
      .map((d) => Number(d))
      .filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
  )].sort((a, b) => a - b);

  next();
});

promotionDealSchema.index(
  { couponCode: 1 },
  { unique: true, partialFilterExpression: { type: 'coupon', couponCode: { $type: 'string', $ne: '' } } }
);
promotionDealSchema.index({ status: 1, type: 1, startsOn: 1, endsOn: 1 });
promotionDealSchema.index({ systemKey: 1 }, { unique: true, partialFilterExpression: { systemKey: { $type: 'string', $ne: '' } } });

module.exports = mongoose.model('PromotionDeal', promotionDealSchema);
