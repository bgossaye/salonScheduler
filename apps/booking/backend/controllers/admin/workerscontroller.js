const crypto = require('crypto');
const bcrypt = require('bcrypt');
const Worker = require('../../models/worker');
const StaffRole = require('../../models/staffrole');
const Admin = require('../../models/admin');
const Service = require('../../models/service');
const Appointment = require('../../models/appointment');
const { ensureDefaultRoles, ensureRakebWorkerAndMigrate, assignmentFor, RAKEB_SYSTEM_KEY } = require('../../utils/workerPricing');
const { makeToken, tokenHash, addMinutes, makeCredentialUrl, deliverCredentialLink } = require('../../utils/staffCredentialDelivery');
const auth = require('../../middleware/authmiddleware');



function can(req, permissionKey) {
  return auth.hasPermission(req, permissionKey);
}

function tokenWorkerId(req) {
  return req.admin?.workerId ? String(req.admin.workerId) : '';
}

function makeTemporaryPassword() {
  // Easy enough to type, still random. Admin should share once and worker should change it.
  return `Rakie-${crypto.randomBytes(4).toString('hex')}-${new Date().getFullYear()}`;
}

function accountSummary(admin) {
  if (!admin) return { exists: false, status: 'none' };
  return {
    exists: true,
    id: String(admin._id),
    email: admin.email,
    username: admin.username || admin.email,
    status: admin.status || 'active',
    roleKey: admin.roleKey || 'staff',
    mustChangePassword: admin.mustChangePassword === true,
    inviteExpiresAt: admin.inviteExpiresAt || null,
    inviteSentAt: admin.inviteSentAt || null,
    passwordResetExpiresAt: admin.passwordResetExpiresAt || null,
    passwordResetSentAt: admin.passwordResetSentAt || null,
    credentialLastDeliveryStatus: admin.credentialLastDeliveryStatus || '',
    credentialLastDeliveryChannel: admin.credentialLastDeliveryChannel || '',
    credentialLastDeliveryError: admin.credentialLastDeliveryError || '',
    lastLoginAt: admin.lastLoginAt || null,
  };
}

async function staffAccountForWorker(workerId) {
  if (!workerId) return null;
  return Admin.findOne({ workerId }).lean();
}

async function ensureStaffAccountForWorker(worker, { resetPassword = false, status = 'active' } = {}) {
  if (!worker) {
    const err = new Error('Worker not found.');
    err.status = 404;
    throw err;
  }
  const email = String(worker.email || '').trim().toLowerCase();
  if (!email) {
    const err = new Error('Worker email is required before app access can be created.');
    err.status = 400;
    throw err;
  }

  const roleId = worker.roleId || null;
  const roleKey = worker.roleKey || await roleKeyFromRoleId(roleId, 'stylist');
  let admin = await Admin.findOne({ $or: [{ workerId: worker._id }, { email }] });
  const temporaryPassword = resetPassword || !admin ? makeTemporaryPassword() : '';

  if (!admin) {
    admin = new Admin({
      email,
      username: email,
      password: await bcrypt.hash(temporaryPassword, 10),
      workerId: worker._id,
      roleId,
      roleKey,
      status,
      mustChangePassword: true,
    });
  } else {
    admin.email = email;
    admin.username = email;
    admin.workerId = worker._id;
    admin.roleId = roleId;
    admin.roleKey = roleKey;
    admin.status = status || admin.status || 'active';
    if (temporaryPassword) {
      admin.password = await bcrypt.hash(temporaryPassword, 10);
      admin.mustChangePassword = true;
    }
  }


  await admin.save();
  return { admin, temporaryPassword };
}

async function ensureStaffLoginAccount(worker, { status = 'invited' } = {}) {
  if (!worker) {
    const err = new Error('Worker not found.');
    err.status = 404;
    throw err;
  }
  const email = String(worker.email || '').trim().toLowerCase();
  if (!email) {
    const err = new Error('Worker email is required before app access can be created.');
    err.status = 400;
    throw err;
  }

  const roleId = worker.roleId || null;
  const roleKey = worker.roleKey || await roleKeyFromRoleId(roleId, 'stylist');
  let admin = await Admin.findOne({ $or: [{ workerId: worker._id }, { email }] });

  if (!admin) {
    // Random unusable placeholder; worker sets their real password from invite link.
    admin = new Admin({
      email,
      username: email,
      password: await bcrypt.hash(makeTemporaryPassword(), 10),
      workerId: worker._id,
      roleId,
      roleKey,
      status,
      mustChangePassword: true,
    });
  } else {
    admin.email = email;
    admin.username = email;
    admin.workerId = worker._id;
    admin.roleId = roleId;
    admin.roleKey = roleKey;
    if (admin.status !== 'disabled') admin.status = status || admin.status || 'invited';
    admin.mustChangePassword = true;
  }

  return admin;
}

function summarizeDelivery(delivery = []) {
  return delivery.map((item) => `${item.channel}:${item.status}`).join(', ');
}

async function issueWorkerInvite(worker, { channel = 'email' } = {}) {
  const admin = await ensureStaffLoginAccount(worker, { status: 'invited' });
  if (admin.status === 'disabled') {
    const err = new Error('This staff account is disabled. Enable login before sending an invite.');
    err.status = 400;
    throw err;
  }

  const token = makeToken();
  const expiresHours = Number(process.env.STAFF_INVITE_EXPIRES_HOURS || 48);
  const url = await makeCredentialUrl('invite', token);
  admin.inviteTokenHash = tokenHash(token);
  admin.inviteExpiresAt = addMinutes(new Date(), expiresHours * 60);
  admin.inviteSentAt = new Date();
  admin.passwordResetTokenHash = '';
  admin.passwordResetExpiresAt = null;
  admin.mustChangePassword = true;
  await admin.save();

  const delivery = await deliverCredentialLink({ kind: 'invite', worker, admin, url, channel, expiresHours });
  admin.credentialLastDeliveryStatus = summarizeDelivery(delivery);
  admin.credentialLastDeliveryChannel = String(channel || 'email');
  admin.credentialLastDeliveryError = delivery.find((item) => item.error)?.error || '';
  await admin.save();

  return { admin, inviteUrl: url, expiresAt: admin.inviteExpiresAt, delivery };
}

async function issueWorkerPasswordReset(worker, { channel = 'email' } = {}) {
  const admin = await Admin.findOne({ workerId: worker._id });
  if (!admin) {
    const err = new Error('This worker does not have app access yet. Send an invite first.');
    err.status = 404;
    throw err;
  }
  if (admin.status === 'disabled') {
    const err = new Error('This staff account is disabled. Enable login before sending a reset link.');
    err.status = 400;
    throw err;
  }

  const token = makeToken();
  const expiresMinutes = Number(process.env.STAFF_RESET_EXPIRES_MINUTES || 60);
  const url = await makeCredentialUrl('reset', token);
  admin.email = String(worker.email || admin.email || '').trim().toLowerCase();
  admin.username = admin.email;
  admin.passwordResetTokenHash = tokenHash(token);
  admin.passwordResetExpiresAt = addMinutes(new Date(), expiresMinutes);
  admin.passwordResetSentAt = new Date();
  admin.mustChangePassword = true;
  await admin.save();

  const delivery = await deliverCredentialLink({ kind: 'reset', worker, admin, url, channel, expiresMinutes });
  admin.credentialLastDeliveryStatus = summarizeDelivery(delivery);
  admin.credentialLastDeliveryChannel = String(channel || 'email');
  admin.credentialLastDeliveryError = delivery.find((item) => item.error)?.error || '';
  await admin.save();

  return { admin, resetUrl: url, expiresAt: admin.passwordResetExpiresAt, delivery };
}

function cleanBlockedTime(value = {}, fallbackStatus = 'approved', adminId = null) {
  const allDay = asBool(value.allDay, true);
  return {
    blockId: String(value.blockId || crypto.randomUUID()),
    type: ['time_off', 'break', 'personal', 'vacation', 'sick', 'training', 'other'].includes(value.type) ? value.type : 'time_off',
    status: ['pending', 'approved', 'rejected', 'cancelled'].includes(value.status) ? value.status : fallbackStatus,
    requestedByAdminId: value.requestedByAdminId || adminId || null,
    decidedByAdminId: value.decidedByAdminId || (fallbackStatus === 'approved' ? adminId : null) || null,
    decidedAt: value.decidedAt || (fallbackStatus === 'approved' ? new Date() : null),
    requestNote: String(value.requestNote || '').trim(),
    adminNote: String(value.adminNote || '').trim(),
    label: String(value.label || value.type || 'Unavailable').trim(),
    startDate: String(value.startDate || '').trim(),
    endDate: String(value.endDate || value.startDate || '').trim(),
    startTime: String(value.startTime || '').trim(),
    endTime: String(value.endTime || '').trim(),
    allDay,
    active: value.active !== false,
  };
}

function asBool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return value === true || value === 'true' || value === 1 || value === '1';
}

function asNumberOrNull(value) {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function cleanStringArray(value) {
  if (Array.isArray(value)) return value.map(String).map((x) => x.trim()).filter(Boolean);
  if (typeof value === 'string') return value.split(',').map((x) => x.trim()).filter(Boolean);
  return [];
}

function cleanAssignments(value = []) {
  if (!Array.isArray(value)) return [];
  const seen = new Set();
  return value
    .filter((item) => item && item.serviceId)
    .map((item) => ({
      serviceId: String(item.serviceId),
      enabled: item.enabled !== false,
      allowOnlineBooking: item.allowOnlineBooking !== false,
      price: asNumberOrNull(item.price),
      duration: asNumberOrNull(item.duration),
      commissionPercent: asNumberOrNull(item.commissionPercent),
      notes: String(item.notes || '').trim(),
    }))
    .filter((item) => {
      if (seen.has(item.serviceId)) return false;
      seen.add(item.serviceId);
      return true;
    });
}

async function roleKeyFromRoleId(roleId, fallback = 'stylist') {
  if (!roleId) return fallback;
  const role = await StaffRole.findById(roleId).lean();
  return role?.key || fallback;
}

function normalizeWorkerPayload(body = {}, existing = null) {
  return {
    firstName: String(body.firstName || '').trim(),
    lastName: String(body.lastName || '').trim(),
    displayName: String(body.displayName || '').trim(),
    email: String(body.email || '').trim().toLowerCase(),
    phone: String(body.phone || '').trim(),
    roleId: body.roleId || null,
    tierKey: ['assistant', 'junior', 'regular', 'senior', 'master', 'elite', 'owner', 'custom'].includes(body.tierKey) ? body.tierKey : 'regular',
    title: String(body.title || 'Stylist').trim(),
    photoUrl: String(body.photoUrl || body.profilePhoto || '').trim(),
    profilePhoto: String(body.profilePhoto || body.photoUrl || '').trim(),
    shortBio: String(body.shortBio || '').trim(),
    bio: String(body.bio || '').trim(),
    experienceYears: asNumberOrNull(body.experienceYears),
    specialties: cleanStringArray(body.specialties),
    languages: cleanStringArray(body.languages),
    certifications: cleanStringArray(body.certifications),
    portfolioImages: Array.isArray(body.portfolioImages) ? body.portfolioImages.map((img) => ({ url: String(img.url || '').trim(), caption: String(img.caption || '').trim() })).filter((img) => img.url) : [],
    active: existing?.protectedWorker ? true : asBool(body.active, true),
    showOnline: asBool(body.showOnline ?? body.onlineBookable, true),
    onlineBookable: asBool(body.onlineBookable ?? body.showOnline, true),
    canUseChemicals: asBool(body.canUseChemicals, true),
    canTakeWalkIns: asBool(body.canTakeWalkIns, true),
    color: String(body.color || '').trim(),
    bookingOrder: Number.isFinite(Number(body.bookingOrder)) ? Number(body.bookingOrder) : 100,
    weeklySchedule: Array.isArray(body.weeklySchedule) ? body.weeklySchedule : [],
    blockedTimes: Array.isArray(body.blockedTimes) ? body.blockedTimes.map((item) => cleanBlockedTime(item, item?.status || 'approved')) : [],
    serviceAssignments: cleanAssignments(body.serviceAssignments),
    notes: String(body.notes || '').trim(),
  };
}

function validateEnabledAssignments(assignments = []) {
  const bad = assignments.find((item) => item.enabled !== false && (item.price === null || item.duration === null));
  if (bad) return 'Every enabled worker-service assignment needs its own price and duration.';
  return '';
}

exports.listRoles = async (req, res) => {
  try {
    await ensureDefaultRoles();
    const roles = await StaffRole.find({}).sort({ isSystem: -1, name: 1 }).lean();
    const normalized = roles.map((role) => ({
      ...role,
      permissions: { ...StaffRole.defaultPermissions(), ...(role.permissions instanceof Map ? Object.fromEntries(role.permissions) : (role.permissions || {})) },
    }));
    res.json({ roles: normalized, defaultPermissions: StaffRole.defaultPermissions() });
  } catch (err) {
    console.error('❌ listRoles failed:', err);
    res.status(500).json({ error: 'Failed to load staff roles.' });
  }
};

exports.createRole = async (req, res) => {
  try {
    const payload = {
      name: String(req.body?.name || '').trim(),
      key: String(req.body?.key || req.body?.name || '').trim(),
      description: String(req.body?.description || '').trim(),
      permissions: { ...StaffRole.defaultPermissions(), ...(req.body?.permissions || {}) },
      active: req.body?.active !== false,
      isSystem: false,
      protectedRole: false,
    };
    if (!payload.name) return res.status(400).json({ error: 'Role name is required.' });
    const role = await StaffRole.create(payload);
    res.status(201).json({ role });
  } catch (err) {
    console.error('❌ createRole failed:', err);
    if (err?.code === 11000) return res.status(409).json({ error: 'A role with that name/key already exists.' });
    res.status(500).json({ error: err.message || 'Failed to create role.' });
  }
};

exports.updateRole = async (req, res) => {
  try {
    const existing = await StaffRole.findById(req.params.id);
    if (!existing) return res.status(404).json({ error: 'Role not found.' });

    existing.name = String(req.body?.name || existing.name).trim();
    if (!existing.isSystem && req.body?.key !== undefined) existing.key = String(req.body.key || existing.key).trim();
    existing.description = String(req.body?.description || '').trim();
    existing.permissions = { ...StaffRole.defaultPermissions(), ...(req.body?.permissions || {}) };
    existing.active = req.body?.active !== false;

    await existing.save();
    res.json({ role: existing });
  } catch (err) {
    console.error('❌ updateRole failed:', err);
    if (err?.code === 11000) return res.status(409).json({ error: 'A role with that name/key already exists.' });
    res.status(500).json({ error: err.message || 'Failed to update role.' });
  }
};

exports.deleteRole = async (req, res) => {
  try {
    const role = await StaffRole.findById(req.params.id);
    if (!role) return res.status(404).json({ error: 'Role not found.' });
    if (role.isSystem || role.protectedRole) return res.status(400).json({ error: 'Protected/system roles cannot be deleted. Disable them instead.' });

    const workerCount = await Worker.countDocuments({ roleId: role._id });
    if (workerCount > 0) return res.status(409).json({ error: 'Cannot delete a role that is assigned to workers.' });

    await role.deleteOne();
    res.json({ success: true });
  } catch (err) {
    console.error('❌ deleteRole failed:', err);
    res.status(500).json({ error: 'Failed to delete role.' });
  }
};

exports.runStaffMigration = async (req, res) => {
  try {
    const result = await ensureRakebWorkerAndMigrate({ verbose: true });
    res.json({
      success: true,
      workerId: String(result.worker._id),
      servicesAssigned: result.servicesAssigned,
      clientsAssigned: result.clientsAssigned,
      appointmentsAssigned: result.appointmentsAssigned,
    });
  } catch (err) {
    console.error('❌ runStaffMigration failed:', err);
    res.status(500).json({ error: err.message || 'Failed to run staff migration.' });
  }
};

exports.listWorkers = async (req, res) => {
  try {
    await ensureDefaultRoles();
    const query = {};
    if (req.query.active !== undefined) query.active = String(req.query.active) === 'true';
    if (req.query.showOnline !== undefined) query.showOnline = String(req.query.showOnline) === 'true';

    const serviceId = req.query.serviceId ? String(req.query.serviceId) : '';
    if (serviceId) query['serviceAssignments.serviceId'] = serviceId;

    const selfLimited = !can(req, 'workersView')
      && !can(req, 'appointmentsViewAll')
      && !can(req, 'appointmentsCreate')
      && !can(req, 'appointmentsCreateOwn')
      && !can(req, 'appointmentsCreateForOthers')
      && !can(req, 'clientsAssignStylist');
    if (selfLimited) {
      const mine = tokenWorkerId(req);
      if (!mine) return res.json({ workers: [] });
      query._id = mine;
    }

    const workers = await Worker.find(query)
      .populate('roleId')
      .populate('serviceAssignments.serviceId')
      .sort({ active: -1, isDefault: -1, bookingOrder: 1, displayName: 1, firstName: 1 })
      .lean({ virtuals: true });

    const filtered = serviceId
      ? workers.filter((worker) => {
          const assignment = assignmentFor(worker, serviceId);
          return assignment && assignment.enabled !== false;
        })
      : workers;

    const accounts = await Admin.find({ workerId: { $in: filtered.map((worker) => worker._id) } }).lean();
    const accountByWorkerId = new Map(accounts.map((account) => [String(account.workerId), accountSummary(account)]));
    const withAccess = filtered.map((worker) => ({
      ...worker,
      staffAccount: accountByWorkerId.get(String(worker._id)) || { exists: false, status: 'none' },
    }));

    res.json({ workers: withAccess });
  } catch (err) {
    console.error('❌ listWorkers failed:', err);
    res.status(500).json({ error: 'Failed to load workers.' });
  }
};

exports.listPublicWorkers = async (req, res) => {
  try {
    const serviceId = req.query.serviceId ? String(req.query.serviceId) : '';
    const service = serviceId ? await Service.findById(serviceId).lean() : null;
    const query = { active: true, showOnline: true, onlineBookable: { $ne: false } };
    if (serviceId) query['serviceAssignments.serviceId'] = serviceId;

    const workers = await Worker.find(query)
      .populate('serviceAssignments.serviceId')
      .sort({ isDefault: -1, bookingOrder: 1, displayName: 1, firstName: 1 })
      .lean();

    const publicWorkers = workers
      .map((worker) => {
        const assignment = serviceId ? assignmentFor(worker, serviceId) : null;
        if (serviceId && (!assignment || assignment.enabled === false || assignment.allowOnlineBooking === false)) return null;
        if (service?.requiresChemicalPermission && worker.canUseChemicals === false) return null;
        const price = asNumberOrNull(assignment?.price);
        const duration = asNumberOrNull(assignment?.duration);
        if (serviceId && (price === null || duration === null)) return null;
        return {
          _id: worker._id,
          displayName: worker.displayName || [worker.firstName, worker.lastName].filter(Boolean).join(' ').trim(),
          title: worker.title || 'Stylist',
          tierKey: worker.tierKey || 'regular',
          shortBio: worker.shortBio || '',
          bio: worker.bio || '',
          photoUrl: worker.photoUrl || worker.profilePhoto || '',
          profilePhoto: worker.profilePhoto || worker.photoUrl || '',
          experienceYears: worker.experienceYears ?? null,
          specialties: worker.specialties || [],
          languages: worker.languages || [],
          certifications: worker.certifications || [],
          portfolioImages: worker.portfolioImages || [],
          canUseChemicals: worker.canUseChemicals !== false,
          isDefault: worker.isDefault === true,
          color: worker.color || '',
          price,
          duration,
        };
      })
      .filter(Boolean);

    res.json({ workers: publicWorkers });
  } catch (err) {
    console.error('❌ listPublicWorkers failed:', err);
    res.status(500).json({ error: 'Failed to load workers.' });
  }
};

exports.createWorker = async (req, res) => {
  try {
    const payload = normalizeWorkerPayload(req.body);
    if (!payload.firstName) return res.status(400).json({ error: 'First name is required.' });
    const validation = validateEnabledAssignments(payload.serviceAssignments);
    if (validation) return res.status(400).json({ error: validation });
    if ((req.body?.createStaffAccess === true || req.body?.createStaffAccess === 'true') && !payload.email) {
      return res.status(400).json({ error: 'Worker email is required to create app login access.' });
    }
    payload.roleKey = await roleKeyFromRoleId(payload.roleId, req.body?.roleKey || 'stylist');
    const worker = await Worker.create(payload);
    let access = null;
    if (req.body?.createStaffAccess === true || req.body?.createStaffAccess === 'true') {
      const created = await issueWorkerInvite(worker, { channel: req.body?.credentialChannel || 'email' });
      access = {
        account: accountSummary(created.admin),
        inviteUrl: created.inviteUrl,
        expiresAt: created.expiresAt,
        delivery: created.delivery,
      };
    }
    const full = await Worker.findById(worker._id).populate('roleId').populate('serviceAssignments.serviceId').lean();
    res.status(201).json({ worker: { ...full, staffAccount: access?.account || { exists: false, status: 'none' } }, access });
  } catch (err) {
    console.error('❌ createWorker failed:', err);
    if (err?.code === 11000) return res.status(409).json({ error: 'A worker with this email or system key already exists.' });
    res.status(500).json({ error: err.message || 'Failed to create worker.' });
  }
};

exports.updateWorker = async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ error: 'Worker not found.' });
    const payload = normalizeWorkerPayload(req.body, worker);
    if (!payload.firstName) return res.status(400).json({ error: 'First name is required.' });
    const validation = validateEnabledAssignments(payload.serviceAssignments);
    if (validation) return res.status(400).json({ error: validation });
    payload.roleKey = await roleKeyFromRoleId(payload.roleId, req.body?.roleKey || worker.roleKey || 'stylist');

    if (worker.systemKey === RAKEB_SYSTEM_KEY || worker.protectedWorker) {
      payload.active = true;
      payload.isDefault = true;
      payload.protectedWorker = true;
    }

    Object.assign(worker, payload);
    await worker.save();

    const existingAccount = await Admin.findOne({ workerId: worker._id });
    if (existingAccount) {
      if (worker.email) {
        existingAccount.email = String(worker.email).trim().toLowerCase();
        existingAccount.username = existingAccount.email;
      } else {
        existingAccount.username = existingAccount.email;
      }
      existingAccount.roleId = worker.roleId || null;
      existingAccount.roleKey = worker.roleKey || existingAccount.roleKey || 'stylist';
      if (worker.active === false) existingAccount.status = 'disabled';
      await existingAccount.save();
    }

    const full = await Worker.findById(worker._id).populate('roleId').populate('serviceAssignments.serviceId').lean();
    res.json({ worker: { ...full, staffAccount: accountSummary(existingAccount) } });
  } catch (err) {
    console.error('❌ updateWorker failed:', err);
    if (err?.code === 11000) return res.status(409).json({ error: 'A worker with this email already exists.' });
    res.status(500).json({ error: err.message || 'Failed to update worker.' });
  }
};

exports.deleteWorker = async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ error: 'Worker not found.' });
    if (worker.systemKey === RAKEB_SYSTEM_KEY || worker.protectedWorker || worker.isDefault) {
      return res.status(400).json({ error: 'The default Rakeb G worker cannot be removed. Choose another default worker first.' });
    }

    const appointmentCount = await Appointment.countDocuments({ workerId: worker._id, status: { $nin: ['canceled', 'cancelled'] } });
    if (appointmentCount > 0) {
      worker.active = false;
      worker.showOnline = false;
      worker.onlineBookable = false;
      await worker.save();
      return res.json({ success: true, archived: true, message: 'Worker has appointments, so they were deactivated instead of deleted.' });
    }

    await worker.deleteOne();
    res.json({ success: true, deleted: true });
  } catch (err) {
    console.error('❌ deleteWorker failed:', err);
    res.status(500).json({ error: 'Failed to delete worker.' });
  }
};


exports.createOrResetStaffAccess = async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ error: 'Worker not found.' });

    // Backward-compatible endpoint: old UI called this for temp passwords.
    // New behavior sends a secure invite/setup link instead.
    const result = await issueWorkerInvite(worker, { channel: req.body?.channel || req.body?.credentialChannel || 'email' });
    res.json({
      success: true,
      account: accountSummary(result.admin),
      inviteUrl: result.inviteUrl,
      expiresAt: result.expiresAt,
      delivery: result.delivery,
      message: 'Staff invite link created. Send status is shown below; the worker must create their own password from the link.',
    });
  } catch (err) {
    console.error('❌ createOrResetStaffAccess failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to create staff access.' });
  }
};

exports.sendStaffInvite = async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ error: 'Worker not found.' });
    const result = await issueWorkerInvite(worker, { channel: req.body?.channel || 'email' });
    res.json({
      success: true,
      account: accountSummary(result.admin),
      inviteUrl: result.inviteUrl,
      expiresAt: result.expiresAt,
      delivery: result.delivery,
      message: 'Invite sent. The worker will create their password from the setup link.',
    });
  } catch (err) {
    console.error('❌ sendStaffInvite failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to send staff invite.' });
  }
};

exports.sendStaffPasswordReset = async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ error: 'Worker not found.' });
    const result = await issueWorkerPasswordReset(worker, { channel: req.body?.channel || 'email' });
    res.json({
      success: true,
      account: accountSummary(result.admin),
      resetUrl: result.resetUrl,
      expiresAt: result.expiresAt,
      delivery: result.delivery,
      message: 'Password reset link sent. The worker will choose a new password from the reset link.',
    });
  } catch (err) {
    console.error('❌ sendStaffPasswordReset failed:', err);
    res.status(err.status || 500).json({ error: err.message || 'Failed to send password reset.' });
  }
};

exports.updateStaffAccess = async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ error: 'Worker not found.' });
    const admin = await Admin.findOne({ workerId: worker._id });
    if (!admin) return res.status(404).json({ error: 'This worker does not have app access yet.' });

    if (req.body?.status) {
      const status = String(req.body.status || '').toLowerCase();
      if (!['active', 'disabled', 'invited'].includes(status)) return res.status(400).json({ error: 'Invalid staff account status.' });
      admin.status = status;
    }
    if (req.body?.roleId !== undefined) {
      admin.roleId = req.body.roleId || worker.roleId || null;
      admin.roleKey = await roleKeyFromRoleId(admin.roleId, worker.roleKey || 'stylist');
    }
    await admin.save();
    res.json({ success: true, account: accountSummary(admin) });
  } catch (err) {
    console.error('❌ updateStaffAccess failed:', err);
    res.status(500).json({ error: 'Failed to update staff access.' });
  }
};

exports.getMyWorkerProfile = async (req, res) => {
  try {
    if (!req.admin?.workerId) return res.status(404).json({ error: 'This account is not linked to a worker profile.' });
    const worker = await Worker.findById(req.admin.workerId).populate('roleId').lean();
    if (!worker) return res.status(404).json({ error: 'Worker profile not found.' });
    res.json({ worker, account: { email: req.admin.email, roleKey: req.admin.roleKey, permissions: req.admin.permissions || {} } });
  } catch (err) {
    console.error('❌ getMyWorkerProfile failed:', err);
    res.status(500).json({ error: 'Failed to load worker profile.' });
  }
};

exports.requestMyBlockedTime = async (req, res) => {
  try {
    if (!req.admin?.workerId) return res.status(404).json({ error: 'This account is not linked to a worker profile.' });
    const worker = await Worker.findById(req.admin.workerId);
    if (!worker) return res.status(404).json({ error: 'Worker profile not found.' });

    const block = cleanBlockedTime(req.body || {}, 'pending', req.admin.id || null);
    if (!block.startDate) return res.status(400).json({ error: 'Start date is required.' });
    if (!block.endDate) block.endDate = block.startDate;
    if (!block.allDay && (!block.startTime || !block.endTime)) {
      return res.status(400).json({ error: 'Start time and end time are required for partial-day blocks.' });
    }

    worker.blockedTimes = [...(worker.blockedTimes || []), block];
    await worker.save();
    res.status(201).json({ block, workerId: worker._id });
  } catch (err) {
    console.error('❌ requestMyBlockedTime failed:', err);
    res.status(500).json({ error: 'Failed to request time off.' });
  }
};

exports.cancelMyBlockedTime = async (req, res) => {
  try {
    if (!req.admin?.workerId) return res.status(404).json({ error: 'This account is not linked to a worker profile.' });
    const worker = await Worker.findById(req.admin.workerId);
    if (!worker) return res.status(404).json({ error: 'Worker profile not found.' });
    const blockId = String(req.params.blockId || '');
    const block = (worker.blockedTimes || []).find((item) => String(item.blockId || '') === blockId);
    if (!block) return res.status(404).json({ error: 'Time-off request not found.' });
    block.status = 'cancelled';
    block.active = false;
    worker.markModified('blockedTimes');
    await worker.save();
    res.json({ success: true, block });
  } catch (err) {
    console.error('❌ cancelMyBlockedTime failed:', err);
    res.status(500).json({ error: 'Failed to cancel time-off request.' });
  }
};

exports.addWorkerBlockedTime = async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ error: 'Worker not found.' });
    const block = cleanBlockedTime(req.body || {}, 'approved', req.admin?.id || null);
    if (!block.startDate) return res.status(400).json({ error: 'Start date is required.' });
    if (!block.endDate) block.endDate = block.startDate;
    worker.blockedTimes = [...(worker.blockedTimes || []), block];
    await worker.save();
    res.status(201).json({ block, workerId: worker._id });
  } catch (err) {
    console.error('❌ addWorkerBlockedTime failed:', err);
    res.status(500).json({ error: 'Failed to add blocked time.' });
  }
};

exports.updateWorkerBlockedTime = async (req, res) => {
  try {
    const worker = await Worker.findById(req.params.id);
    if (!worker) return res.status(404).json({ error: 'Worker not found.' });
    const blockId = String(req.params.blockId || '');
    const index = (worker.blockedTimes || []).findIndex((item) => String(item.blockId || '') === blockId);
    if (index < 0) return res.status(404).json({ error: 'Blocked time not found.' });
    const next = cleanBlockedTime({ ...(worker.blockedTimes[index].toObject?.() || worker.blockedTimes[index]), ...(req.body || {}), blockId }, req.body?.status || 'approved', req.admin?.id || null);
    worker.blockedTimes[index] = next;
    worker.markModified('blockedTimes');
    await worker.save();
    res.json({ success: true, block: next });
  } catch (err) {
    console.error('❌ updateWorkerBlockedTime failed:', err);
    res.status(500).json({ error: 'Failed to update blocked time.' });
  }
};
