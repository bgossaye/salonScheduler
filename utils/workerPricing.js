const mongoose = require('mongoose');
const Service = require('../models/service');
const Worker = require('../models/worker');
const StaffRole = require('../models/staffrole');
const Client = require('../models/client');
const Appointment = require('../models/appointment');
let Admin = null;
try { Admin = require('../models/admin'); } catch (_) { Admin = null; }

const RAKEB_SYSTEM_KEY = 'default-rakeb-g';

function toId(value) {
  if (!value) return '';
  if (value._id) return String(value._id);
  return String(value);
}

function assignmentFor(worker, serviceId) {
  const id = toId(serviceId);
  return (worker?.serviceAssignments || []).find((item) => toId(item.serviceId) === id) || null;
}

function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function ensureArray(value) {
  return Array.isArray(value) ? value : [];
}

async function ensureDefaultRoles() {
  const fullPermissions = Object.fromEntries(Object.keys(StaffRole.defaultPermissions()).map((key) => [key, true]));
  const defaults = [
    {
      key: 'owner',
      name: 'Owner',
      description: 'Full business control, including roles, permissions, workers, settings, prices, and reports.',
      permissions: fullPermissions,
      protectedRole: true,
    },
    {
      key: 'admin',
      name: 'Admin',
      description: 'Can manage daily salon operations, workers, clients, services, appointments, deals, and settings.',
      permissions: {
        ...fullPermissions,
        permissionsManage: false,
        auditLogView: true,
        systemErrorsView: true,
      },
      protectedRole: true,
    },
    {
      key: 'manager',
      name: 'Manager',
      description: 'Can manage appointments, clients, worker schedules, deals, and most operations without owner-level controls.',
      permissions: {
        ...StaffRole.defaultPermissions(),
        dashboardView: true,
        appointmentsViewAll: true,
        appointmentsViewOwn: true,
        appointmentsCreate: true,
        appointmentsEdit: true,
        appointmentsCreateOwn: true,
        appointmentsEditOwn: true,
        appointmentsCreateForOthers: true,
        appointmentsEditForOthers: true,
        appointmentsCancel: true,
        appointmentsComplete: true,
        appointmentsOverrideConflict: true,
        clientsViewAll: true,
        clientsEditProfile: true,
        clientsAddNotes: true,
        clientsAssignStylist: true,
        servicesView: true,
        workersView: true,
        workersManageSchedule: true,
        dealsView: true,
        dealsManage: true,
        giftCardsManage: true,
        reportsView: true,
      },
      protectedRole: true,
    },
    {
      key: 'stylist',
      name: 'Stylist',
      description: 'Can view own appointments, view assigned clients, update status, and add service notes.',
      permissions: {
        ...StaffRole.defaultPermissions(),
        appointmentsViewAll: false,
        appointmentsViewOwn: true,
        appointmentsCreateOwn: true,
        appointmentsEditOwn: true,
        appointmentsCreateForOthers: false,
        appointmentsEditForOthers: false,
        appointmentsComplete: true,
        clientsViewAssigned: true,
        clientsAddNotes: true,
        servicesView: true,
      },
      protectedRole: true,
    },
    {
      key: 'frontdesk',
      name: 'Front Desk',
      description: 'Can create/edit appointments and help clients, but cannot change prices, workers, or system settings.',
      permissions: {
        ...StaffRole.defaultPermissions(),
        appointmentsViewAll: true,
        appointmentsCreate: true,
        appointmentsEdit: true,
        appointmentsCreateOwn: true,
        appointmentsEditOwn: true,
        appointmentsCreateForOthers: true,
        appointmentsEditForOthers: true,
        appointmentsCancel: true,
        clientsViewAll: true,
        clientsEditProfile: true,
        clientsAddNotes: true,
        clientsAssignStylist: true,
        servicesView: true,
        giftCardsManage: true,
      },
      protectedRole: true,
    },
    {
      key: 'assistant',
      name: 'Assistant',
      description: 'Limited internal access for helpers who may not be independently bookable.',
      permissions: {
        ...StaffRole.defaultPermissions(),
        appointmentsViewOwn: true,
        servicesView: true,
      },
      protectedRole: true,
    },
  ];

  for (const role of defaults) {
    await StaffRole.updateOne(
      { key: role.key },
      {
        $setOnInsert: {
          ...role,
          isSystem: true,
          active: true,
        },
      },
      { upsert: true }
    );
  }

  // Add newly introduced permissions to existing protected roles without wiping unrelated custom settings.
  await StaffRole.updateOne({ key: 'owner' }, { $set: {
    'permissions.dashboardView': true,
    'permissions.systemErrorsView': true,
    'permissions.appointmentsCreateOwn': true,
    'permissions.appointmentsEditOwn': true,
    'permissions.appointmentsCreateForOthers': true,
    'permissions.appointmentsEditForOthers': true,
  } });
  await StaffRole.updateOne({ key: 'admin' }, { $set: {
    'permissions.dashboardView': true,
    'permissions.systemErrorsView': true,
    'permissions.appointmentsCreateOwn': true,
    'permissions.appointmentsEditOwn': true,
    'permissions.appointmentsCreateForOthers': true,
    'permissions.appointmentsEditForOthers': true,
  } });
  await StaffRole.updateOne({ key: 'manager' }, { $set: {
    'permissions.dashboardView': true,
    'permissions.appointmentsCreateOwn': true,
    'permissions.appointmentsEditOwn': true,
    'permissions.appointmentsCreateForOthers': true,
    'permissions.appointmentsEditForOthers': true,
  } });
  await StaffRole.updateOne({ key: 'frontdesk' }, { $set: {
    'permissions.dashboardView': false,
    'permissions.appointmentsCreateOwn': true,
    'permissions.appointmentsEditOwn': true,
    'permissions.appointmentsCreateForOthers': true,
    'permissions.appointmentsEditForOthers': true,
  } });
  await StaffRole.updateOne({ key: 'stylist' }, { $set: {
    'permissions.dashboardView': false,
    'permissions.appointmentsCreateOwn': true,
    'permissions.appointmentsEditOwn': true,
    'permissions.appointmentsCreateForOthers': false,
    'permissions.appointmentsEditForOthers': false,
  } });
  await StaffRole.updateOne({ key: 'assistant' }, { $set: {
    'permissions.dashboardView': false,
  } });
}

async function getDefaultWorker() {
  let worker = await Worker.findOne({ systemKey: RAKEB_SYSTEM_KEY }).populate('roleId');
  if (!worker) worker = await Worker.findOne({ isDefault: true, active: true }).populate('roleId');
  return worker;
}

async function ensureRakebWorkerAndMigrate({ verbose = false } = {}) {
  await ensureDefaultRoles();
  const adminRole = await StaffRole.findOne({ key: 'admin' });
  const services = await Service.find({}).sort({ category: 1, name: 1 });

  let worker = await Worker.findOne({ systemKey: RAKEB_SYSTEM_KEY });
  if (!worker) {
    worker = await Worker.create({
      systemKey: RAKEB_SYSTEM_KEY,
      firstName: 'Rakeb',
      lastName: 'G',
      displayName: 'Rakeb G',
      title: 'Master Stylist',
      tierKey: 'master',
      roleId: adminRole?._id || null,
      roleKey: 'admin',
      shortBio: 'Master stylist at Rakie Salon.',
      bio: 'Rakeb G is the default master stylist for existing Rakie Salon clients and appointments.',
      specialties: ['Haircut', 'Color', 'Styling', 'Treatment'],
      active: true,
      showOnline: true,
      onlineBookable: true,
      canUseChemicals: true,
      canTakeWalkIns: true,
      isDefault: true,
      protectedWorker: true,
      bookingOrder: 1,
      color: '#d4a017',
      serviceAssignments: [],
    });
  }

  worker.firstName = worker.firstName || 'Rakeb';
  worker.lastName = worker.lastName || 'G';
  worker.displayName = worker.displayName || 'Rakeb G';
  worker.title = worker.title || 'Master Stylist';
  worker.tierKey = 'master';
  worker.roleId = worker.roleId || adminRole?._id || null;
  worker.roleKey = worker.roleKey || 'admin';
  worker.active = true;
  worker.showOnline = true;
  worker.onlineBookable = true;
  worker.canUseChemicals = true;
  worker.isDefault = true;
  worker.protectedWorker = true;
  worker.bookingOrder = Number.isFinite(Number(worker.bookingOrder)) ? Math.min(Number(worker.bookingOrder), 1) : 1;

  const assignments = ensureArray(worker.serviceAssignments).map((item) => ({
    serviceId: item.serviceId,
    enabled: item.enabled !== false,
    allowOnlineBooking: item.allowOnlineBooking !== false,
    price: numberOrNull(item.price),
    duration: numberOrNull(item.duration),
    commissionPercent: numberOrNull(item.commissionPercent),
    notes: item.notes || '',
  }));

  for (const service of services) {
    const existing = assignments.find((item) => toId(item.serviceId) === String(service._id));
    const servicePrice = numberOrNull(service.price);
    const serviceDuration = numberOrNull(service.duration);
    if (existing) {
      existing.enabled = true;
      existing.allowOnlineBooking = existing.allowOnlineBooking !== false;
      if (existing.price === null) existing.price = servicePrice ?? 0;
      if (existing.duration === null) existing.duration = serviceDuration ?? 60;
    } else {
      assignments.push({
        serviceId: service._id,
        enabled: true,
        allowOnlineBooking: true,
        price: servicePrice ?? 0,
        duration: serviceDuration ?? 60,
        commissionPercent: null,
        notes: 'Seeded from the existing service price/duration for Rakeb G.',
      });
    }
  }

  worker.serviceAssignments = assignments;
  await worker.save();

  // Make Rakeb the only default worker unless another default is explicitly created later.
  await Worker.updateMany({ _id: { $ne: worker._id }, systemKey: { $ne: RAKEB_SYSTEM_KEY } }, { $set: { isDefault: false } });

  const clientResult = await Client.updateMany(
    { $or: [{ assignedStylistId: null }, { assignedStylistId: { $exists: false } }] },
    { $set: { assignedStylistId: worker._id } }
  );

  const appts = await Appointment.find({
    $or: [{ workerId: null }, { workerId: { $exists: false } }]
  });
  const serviceMap = new Map(services.map((s) => [String(s._id), s]));
  let appointmentMigrated = 0;
  for (const appt of appts) {
    const service = appt.serviceId ? serviceMap.get(String(appt.serviceId)) : null;
    const assignment = service ? assignmentFor(worker, service._id) : null;
    const servicePrice = numberOrNull(assignment?.price) ?? numberOrNull(service?.price) ?? 0;
    const serviceDuration = numberOrNull(assignment?.duration) ?? numberOrNull(service?.duration) ?? numberOrNull(appt.duration) ?? 60;

    appt.workerId = worker._id;
    appt.workerName = 'Rakeb G';
    appt.workerTierKey = 'master';
    appt.workerTitle = 'Master Stylist';
    if (!appt.duration) appt.duration = serviceDuration;
    if (!appt.priceSnapshot) {
      appt.priceSnapshot = {
        serviceId: service ? String(service._id) : String(appt.serviceId || ''),
        serviceName: service?.name || appt.service || '',
        workerId: String(worker._id),
        workerName: 'Rakeb G',
        workerTierKey: 'master',
        workerTitle: 'Master Stylist',
        servicePrice,
        addOnPrice: 0,
        discountAmount: 0,
        finalPrice: servicePrice,
        currency: 'USD',
        capturedAt: new Date(),
      };
    }
    await appt.save();
    appointmentMigrated += 1;
  }

  if (Admin) {
    await Admin.updateMany(
      { $or: [{ workerId: null }, { workerId: { $exists: false } }] },
      { $set: { workerId: worker._id, roleId: adminRole?._id || null, roleKey: 'admin' } }
    ).catch(() => {});
  }

  if (verbose) {
    console.log('[staff-seed] Rakeb worker ready', {
      workerId: String(worker._id),
      servicesAssigned: assignments.length,
      clientsAssigned: clientResult.modifiedCount || 0,
      appointmentsAssigned: appointmentMigrated,
    });
  }

  return { worker, servicesAssigned: assignments.length, clientsAssigned: clientResult.modifiedCount || 0, appointmentsAssigned: appointmentMigrated };
}

async function resolveWorkerService({ workerId, serviceId, requireOnline = false, allowDefaultWorker = true }) {
  const service = serviceId ? await Service.findById(serviceId).lean() : null;
  if (!service) {
    const err = new Error('Service not found.');
    err.status = 404;
    throw err;
  }

  let worker = null;
  if (workerId) {
    if (!mongoose.Types.ObjectId.isValid(String(workerId))) {
      const err = new Error('Invalid worker/stylist.');
      err.status = 400;
      throw err;
    }
    worker = await Worker.findById(workerId).populate('roleId').lean();
  } else if (allowDefaultWorker) {
    worker = await getDefaultWorker();
    worker = worker?.toObject ? worker.toObject() : worker;
  }

  if (!worker || worker.active === false) {
    const err = new Error('Select an active stylist/worker for this service.');
    err.status = 400;
    err.code = 'WORKER_REQUIRED';
    throw err;
  }

  if (requireOnline && (worker.showOnline === false || worker.onlineBookable === false)) {
    const err = new Error('This stylist is not available for online booking.');
    err.status = 400;
    err.code = 'WORKER_NOT_ONLINE';
    throw err;
  }

  if (service.requiresChemicalPermission && worker.canUseChemicals === false) {
    const err = new Error(`${worker.displayName || worker.firstName} cannot be booked for chemical services.`);
    err.status = 400;
    err.code = 'CHEMICAL_PERMISSION_REQUIRED';
    throw err;
  }

  const assignment = assignmentFor(worker, service._id);
  if (!assignment || assignment.enabled === false) {
    const err = new Error(`${worker.displayName || worker.firstName} is not assigned to this service.`);
    err.status = 400;
    err.code = 'WORKER_SERVICE_NOT_ALLOWED';
    throw err;
  }

  if (requireOnline && assignment.allowOnlineBooking === false) {
    const err = new Error(`${worker.displayName || worker.firstName} is not available online for this service.`);
    err.status = 400;
    err.code = 'WORKER_SERVICE_OFFLINE_ONLY';
    throw err;
  }

  const price = numberOrNull(assignment.price);
  const duration = numberOrNull(assignment.duration);
  if (price === null || duration === null) {
    const err = new Error(`${worker.displayName || worker.firstName} needs a service price and duration before this service can be booked.`);
    err.status = 400;
    err.code = 'WORKER_SERVICE_PRICE_REQUIRED';
    throw err;
  }

  return {
    service,
    worker,
    assignment,
    price,
    duration,
    workerSnapshot: {
      workerId: String(worker._id),
      displayName: worker.displayName || [worker.firstName, worker.lastName].filter(Boolean).join(' ').trim(),
      roleKey: worker.roleKey || worker.roleId?.key || '',
      roleName: worker.roleId?.name || '',
      tierKey: worker.tierKey || '',
      title: worker.title || '',
      photoUrl: worker.photoUrl || worker.profilePhoto || '',
      canUseChemicals: worker.canUseChemicals !== false,
    },
  };
}

function calculateDiscountAmount(servicePrice, promotion) {
  if (!promotion) return 0;
  const price = Number(servicePrice || 0);
  if (!Number.isFinite(price) || price <= 0) return 0;
  if (promotion.discountType === 'fixed') return Math.min(price, Number(promotion.discountValue || 0));
  return Math.min(price, price * (Number(promotion.discountPercent || promotion.discountValue || 0) / 100));
}

async function addOnDurationAndPrice(addOnIds = []) {
  const ids = ensureArray(addOnIds).filter(Boolean);
  if (!ids.length) return { duration: 0, price: 0 };
  const addOns = await Service.find({ _id: { $in: ids } }).lean();
  return addOns.reduce((acc, item) => {
    acc.duration += Number(item.duration || 0);
    acc.price += Number(item.price || 0);
    return acc;
  }, { duration: 0, price: 0 });
}

async function applyWorkerPricingToPayload(payload, { requireOnline = false } = {}) {
  if (!payload?.serviceId) return payload;

  const resolved = await resolveWorkerService({
    workerId: payload.workerId,
    serviceId: payload.serviceId,
    requireOnline,
  });
  const addOns = await addOnDurationAndPrice(payload.addOns || []);
  const totalDuration = resolved.duration + addOns.duration;

  return {
    ...payload,
    service: payload.service || resolved.service.name,
    duration: totalDuration,
    workerId: resolved.worker._id,
    workerName: resolved.workerSnapshot.displayName,
    workerTierKey: resolved.workerSnapshot.tierKey,
    workerTitle: resolved.workerSnapshot.title,
    priceSnapshot: {
      serviceId: String(resolved.service._id),
      serviceName: resolved.service.name,
      workerId: resolved.workerSnapshot.workerId,
      workerName: resolved.workerSnapshot.displayName,
      workerTierKey: resolved.workerSnapshot.tierKey,
      workerTitle: resolved.workerSnapshot.title,
      servicePrice: resolved.price,
      addOnPrice: addOns.price,
      discountAmount: 0,
      finalPrice: resolved.price + addOns.price,
      currency: 'USD',
      capturedAt: new Date(),
    },
  };
}

function applyPromotionDiscountToPriceSnapshot(payload, appliedPromotion) {
  if (!payload?.priceSnapshot) return payload;
  const serviceAndAddOnPrice = Number(payload.priceSnapshot.servicePrice || 0) + Number(payload.priceSnapshot.addOnPrice || 0);
  const discountAmount = calculateDiscountAmount(serviceAndAddOnPrice, appliedPromotion);
  return {
    ...payload,
    priceSnapshot: {
      ...payload.priceSnapshot,
      discountAmount,
      finalPrice: Math.max(0, serviceAndAddOnPrice - discountAmount),
      capturedAt: new Date(),
    },
  };
}

module.exports = {
  RAKEB_SYSTEM_KEY,
  assignmentFor,
  ensureDefaultRoles,
  ensureRakebWorkerAndMigrate,
  getDefaultWorker,
  resolveWorkerService,
  applyWorkerPricingToPayload,
  applyPromotionDiscountToPriceSnapshot,
};
