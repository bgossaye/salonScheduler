const mongoose = require('mongoose');

const familyInvitationAuditSchema = new mongoose.Schema({
  requesterClientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  inviteeClientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', required: true, index: true },
  action: { type: String, enum: ['invited', 'resent', 'accepted', 'declined', 'reported', 'canceled', 'decline_override', 'unblocked', 'admin_linked', 'admin_dependent_created', 'admin_unlinked'], required: true, index: true },
  actorType: { type: String, enum: ['client', 'public_link', 'admin', 'system'], required: true },
  actorClientId: { type: mongoose.Schema.Types.ObjectId, ref: 'Client', default: null },
  actorAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'Admin', default: null },
  reason: { type: String, default: '', trim: true },
  metadata: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

familyInvitationAuditSchema.index({ requesterClientId: 1, inviteeClientId: 1, createdAt: -1 });

module.exports = mongoose.models.FamilyInvitationAudit || mongoose.model('FamilyInvitationAudit', familyInvitationAuditSchema);
