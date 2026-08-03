const mongoose = require('mongoose');

const DEFAULT_PERMISSIONS = {
  dashboardView: false,
  appointmentsViewAll: true,
  appointmentsViewOwn: true,
  // Legacy/global permissions kept for backward compatibility. Prefer the scoped permissions below.
  appointmentsCreate: false,
  appointmentsEdit: false,
  appointmentsCreateOwn: false,
  appointmentsEditOwn: false,
  appointmentsCreateForOthers: false,
  appointmentsEditForOthers: false,
  appointmentsDelete: false,
  appointmentsCancel: false,
  appointmentsComplete: false,
  appointmentsOverrideConflict: false,
  appointmentsOverridePrice: false,

  clientsViewAll: false,
  clientsViewAssigned: true,
  clientsEditProfile: false,
  clientsDelete: false,
  clientsAddNotes: false,
  clientsViewPrivateNotes: false,
  clientsAssignStylist: false,

  servicesView: true,
  servicesManage: false,
  servicesChangePrices: false,
  servicesAssignWorkers: false,
  addOnsManage: false,

  workersView: false,
  workersManage: false,
  workersDeactivate: false,
  workersAssignRoles: false,
  workersManageSchedule: false,
  workersManagePrices: false,

  dealsView: false,
  dealsManage: false,
  dealsApplyManualDiscount: false,

  giftCardsManage: false,
  reportsView: false,
  settingsManage: false,
  smsSettingsManage: false,
  permissionsManage: false,
  auditLogView: false,
  systemErrorsView: false,
};

const staffRoleSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, unique: true },
  key: { type: String, required: true, trim: true, lowercase: true, unique: true },
  description: { type: String, default: '' },
  permissions: { type: Map, of: Boolean, default: () => ({ ...DEFAULT_PERMISSIONS }) },
  isSystem: { type: Boolean, default: false },
  protectedRole: { type: Boolean, default: false },
  active: { type: Boolean, default: true },
}, { timestamps: true });

staffRoleSchema.pre('validate', function normalizeRole(next) {
  if (!this.key && this.name) this.key = this.name;
  this.key = String(this.key || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  next();
});

staffRoleSchema.statics.defaultPermissions = () => ({ ...DEFAULT_PERMISSIONS });

module.exports = mongoose.models.StaffRole || mongoose.model('StaffRole', staffRoleSchema);
