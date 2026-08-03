const Appointment = require('../../models/appointment');
const Client = require('../../models/client');
const Service = require('../../models/service');
const Worker = require('../../models/worker');
const StatusLog = require('../../models/statusLog');
const SystemErrorLog = require('../../models/systemerrorlog');
const AdminNotification = require('../../models/adminnotification');
const { getAllRuntimeSettings } = require('../../utils/runtimeSettings');
const { pruneSystemErrorHistory } = require('../../utils/systemErrorLogger');
const { ensureDefaultRoles, RAKEB_SYSTEM_KEY } = require('../../utils/workerPricing');

const TIMEZONE = 'America/New_York';
const ACTIVE_APPOINTMENT_STATUSES = ['booked', 'pending'];
const CANCELED_STATUSES = ['canceled', 'cancelled', 'cancelation', 'cancellation'];
const FAILED_SMS_STATUSES = ['failed', 'undelivered', 'delivery_failed'];

function easternDateString(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addDays(yyyyMmDd, days) {
  const date = new Date(`${yyyyMmDd}T12:00:00`);
  date.setDate(date.getDate() + days);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfWeekSunday(yyyyMmDd) {
  const date = new Date(`${yyyyMmDd}T12:00:00`);
  date.setDate(date.getDate() - date.getDay());
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function startOfMonth(yyyyMmDd) {
  return `${String(yyyyMmDd).slice(0, 7)}-01`;
}

function clientName(client) {
  return [client?.firstName, client?.lastName].filter(Boolean).join(' ').trim() || 'Client';
}

function workerName(apptOrWorker) {
  return apptOrWorker?.workerName
    || apptOrWorker?.workerId?.displayName
    || apptOrWorker?.displayName
    || [apptOrWorker?.firstName, apptOrWorker?.lastName].filter(Boolean).join(' ').trim()
    || 'Rakeb G';
}

function serviceName(appt) {
  return appt?.serviceId?.name || appt?.service || appt?.priceSnapshot?.serviceName || 'Service';
}

function appointmentPrice(appt) {
  const value = appt?.priceSnapshot?.finalPrice
    ?? appt?.priceSnapshot?.servicePrice
    ?? appt?.finalPrice
    ?? appt?.price
    ?? appt?.serviceId?.price
    ?? 0;
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function publicAppointment(appt) {
  return {
    _id: String(appt._id),
    date: appt.date,
    time: appt.time,
    duration: appt.duration,
    status: appt.status,
    service: serviceName(appt),
    workerName: workerName(appt),
    workerId: appt.workerId?._id ? String(appt.workerId._id) : String(appt.workerId || ''),
    clientName: clientName(appt.clientId),
    clientPhone: appt.clientId?.phone || '',
    clientNickname: appt.clientId?.nickname || '',
    price: appointmentPrice(appt),
  };
}

function publicWorker(worker, counts = {}) {
  const assignments = Array.isArray(worker.serviceAssignments) ? worker.serviceAssignments : [];
  const enabledAssignments = assignments.filter((item) => item?.enabled !== false);
  const onlineAssignments = enabledAssignments.filter((item) => item?.allowOnlineBooking !== false);
  return {
    _id: String(worker._id),
    displayName: worker.displayName || [worker.firstName, worker.lastName].filter(Boolean).join(' ').trim(),
    title: worker.title || 'Stylist',
    tierKey: worker.tierKey || '',
    roleKey: worker.roleKey || '',
    photoUrl: worker.photoUrl || worker.profilePhoto || '',
    color: worker.color || '',
    active: worker.active !== false,
    showOnline: worker.showOnline !== false,
    onlineBookable: worker.onlineBookable !== false,
    canUseChemicals: worker.canUseChemicals !== false,
    protectedWorker: !!worker.protectedWorker,
    isDefault: !!worker.isDefault,
    assignedServicesCount: enabledAssignments.length,
    onlineServicesCount: onlineAssignments.length,
    todayAppointments: counts.todayAppointments || 0,
    todayRevenue: counts.todayRevenue || 0,
    upcomingAppointments: counts.upcomingAppointments || 0,
    assignedClients: counts.assignedClients || 0,
  };
}

function settingValue(settings, key, fallback = null) {
  const row = settings.find((item) => item.key === key);
  return row ? row.value : fallback;
}

function canViewSystemErrors(req) {
  const roleKey = String(req.admin?.roleKey || req.admin?.role || '').toLowerCase();
  const permissions = req.admin?.permissions || {};
  return roleKey === 'owner' || roleKey === 'admin' || permissions.systemErrorsView === true;
}

function canViewAllAdminNotifications(req) {
  const roleKey = String(req.admin?.roleKey || req.admin?.role || '').toLowerCase();
  const permissions = req.admin?.permissions || {};
  return ['owner', 'admin', 'manager', 'frontdesk'].includes(roleKey) || permissions.clientsAssignStylist === true;
}

function tokenWorkerId(req) {
  return req.admin?.workerId ? String(req.admin.workerId) : '';
}

function adminNotificationQuery(req) {
  if (canViewAllAdminNotifications(req)) return { status: 'unread' };
  const mine = tokenWorkerId(req);
  if (!mine) return { _id: null };
  return {
    status: 'unread',
    $or: [
      { toWorkerId: mine },
      { fromWorkerId: mine },
    ],
  };
}

function publicSystemError(log) {
  const firstOccurredAt = log.firstOccurredAt || log.occurredAt || log.createdAt;
  const lastOccurredAt = log.lastOccurredAt || log.occurredAt || log.updatedAt || log.createdAt;
  return {
    _id: String(log._id),
    level: 'error',
    source: log.source || '',
    message: log.message || '',
    name: log.name || '',
    route: log.route || '',
    method: log.method || '',
    adminEmail: log.adminEmail || '',
    occurrenceCount: Number(log.occurrenceCount || 1),
    firstOccurredAt,
    lastOccurredAt,
    occurredAt: lastOccurredAt,
    resolved: !!log.resolved,
    resolvedAt: log.resolvedAt || null,
    resolvedBy: log.resolvedBy || '',
  };
}

exports.getDashboard = async (req, res) => {
  try {
    await ensureDefaultRoles();

    const today = easternDateString();
    const tomorrow = addDays(today, 1);
    const weekStart = startOfWeekSunday(today);
    const weekEnd = addDays(weekStart, 6);
    const monthStart = startOfMonth(today);
    const next14Days = addDays(today, 14);
    const recentSmsSince = new Date(Date.now() - 24 * 60 * 60 * 1000);

    if (canViewSystemErrors(req)) {
      await pruneSystemErrorHistory({ force: true });
    }

    const unreadNotificationQuery = adminNotificationQuery(req);

    const [
      todayAppointments,
      upcomingAppointments,
      workers,
      services,
      recentClients,
      runtimeSettings,
      recentSmsLogs,
      failedSmsLast24h,
      messagesLast24h,
      unassignedClients,
      unassignedAppointments,
      totalClients,
      recentSystemErrors,
      systemErrorsLast24h,
      unresolvedSystemErrors,
      adminNotifications,
      unreadAdminNotifications,
    ] = await Promise.all([
      Appointment.find({ date: today })
        .populate('clientId', 'firstName lastName phone nickname profilePhoto assignedStylistId')
        .populate('serviceId', 'name price duration category')
        .populate('workerId', 'displayName firstName lastName title tierKey color photoUrl profilePhoto')
        .sort({ time: 1 })
        .lean(),
      Appointment.find({ date: { $gte: today, $lte: next14Days }, status: { $in: ACTIVE_APPOINTMENT_STATUSES } })
        .populate('clientId', 'firstName lastName phone nickname')
        .populate('serviceId', 'name price duration category')
        .populate('workerId', 'displayName firstName lastName title tierKey color photoUrl profilePhoto')
        .sort({ date: 1, time: 1 })
        .limit(10)
        .lean(),
      Worker.find({}).sort({ active: -1, isDefault: -1, bookingOrder: 1, displayName: 1 }).lean(),
      Service.find({}).sort({ category: 1, name: 1 }).lean(),
      Client.find({}).sort({ _id: -1 }).limit(6).populate('assignedStylistId', 'displayName firstName lastName title').lean(),
      getAllRuntimeSettings(),
      StatusLog.find({ timestamp: { $gte: recentSmsSince } }).sort({ timestamp: -1 }).limit(12).lean(),
      StatusLog.countDocuments({ timestamp: { $gte: recentSmsSince }, status: { $in: FAILED_SMS_STATUSES } }),
      StatusLog.countDocuments({ timestamp: { $gte: recentSmsSince } }),
      Client.countDocuments({ $or: [{ assignedStylistId: null }, { assignedStylistId: { $exists: false } }] }),
      Appointment.countDocuments({ $or: [{ workerId: null }, { workerId: { $exists: false } }] }),
      Client.countDocuments({}),
      canViewSystemErrors(req)
        ? SystemErrorLog.find({ level: 'error', resolved: false }).sort({ lastOccurredAt: -1, occurredAt: -1, createdAt: -1 }).limit(5).lean()
        : Promise.resolve([]),
      canViewSystemErrors(req)
        ? SystemErrorLog.countDocuments({ level: 'error', resolved: false, lastOccurredAt: { $gte: recentSmsSince } })
        : Promise.resolve(0),
      canViewSystemErrors(req)
        ? SystemErrorLog.countDocuments({ level: 'error', resolved: false })
        : Promise.resolve(0),
      AdminNotification.find(unreadNotificationQuery)
        .sort({ createdAt: -1 })
        .limit(8)
        .lean(),
      AdminNotification.countDocuments(unreadNotificationQuery),
    ]);

    const appointmentsThisWeek = await Appointment.find({ date: { $gte: weekStart, $lte: weekEnd } })
      .populate('serviceId', 'price')
      .lean();
    const appointmentsThisMonth = await Appointment.find({ date: { $gte: monthStart, $lte: today } })
      .populate('serviceId', 'price')
      .lean();

    const notCanceled = (appt) => !CANCELED_STATUSES.includes(String(appt.status || '').toLowerCase());
    const todayActive = todayAppointments.filter((appt) => ACTIVE_APPOINTMENT_STATUSES.includes(appt.status));
    const todayCompleted = todayAppointments.filter((appt) => appt.status === 'completed');
    const todayCanceled = todayAppointments.filter((appt) => CANCELED_STATUSES.includes(String(appt.status || '').toLowerCase()));
    const todayPending = todayAppointments.filter((appt) => appt.status === 'pending');

    const todayRevenue = todayAppointments.filter(notCanceled).reduce((sum, appt) => sum + appointmentPrice(appt), 0);
    const weekRevenue = appointmentsThisWeek.filter(notCanceled).reduce((sum, appt) => sum + appointmentPrice(appt), 0);
    const monthRevenue = appointmentsThisMonth.filter(notCanceled).reduce((sum, appt) => sum + appointmentPrice(appt), 0);

    const workerStats = new Map();
    const bumpWorker = (workerId, patch) => {
      const key = String(workerId || '');
      if (!key) return;
      const current = workerStats.get(key) || { todayAppointments: 0, todayRevenue: 0, upcomingAppointments: 0, assignedClients: 0 };
      workerStats.set(key, { ...current, ...Object.keys(patch).reduce((acc, item) => ({ ...acc, [item]: (current[item] || 0) + patch[item] }), {}) });
    };

    todayAppointments.filter(notCanceled).forEach((appt) => {
      const id = appt.workerId?._id || appt.workerId;
      bumpWorker(id, { todayAppointments: 1, todayRevenue: appointmentPrice(appt) });
    });

    upcomingAppointments.forEach((appt) => {
      const id = appt.workerId?._id || appt.workerId;
      bumpWorker(id, { upcomingAppointments: 1 });
    });

    const clientAssignments = await Client.aggregate([
      { $match: { assignedStylistId: { $ne: null } } },
      { $group: { _id: '$assignedStylistId', count: { $sum: 1 } } },
    ]);
    clientAssignments.forEach((row) => {
      bumpWorker(row._id, { assignedClients: row.count || 0 });
    });

    const activeWorkers = workers.filter((worker) => worker.active !== false);
    const activeOnlineWorkers = activeWorkers.filter((worker) => worker.showOnline !== false && worker.onlineBookable !== false);
    const activeServices = services.filter((service) => service.active !== false);
    const activeWorkerServiceIds = new Set();

    activeWorkers.forEach((worker) => {
      (worker.serviceAssignments || []).forEach((assignment) => {
        if (assignment?.enabled !== false && assignment?.serviceId) {
          activeWorkerServiceIds.add(String(assignment.serviceId));
        }
      });
    });

    const onlineWorkersWithoutServices = activeOnlineWorkers.filter((worker) => {
      const enabledOnline = (worker.serviceAssignments || []).filter((assignment) => (
        assignment?.enabled !== false
        && assignment?.allowOnlineBooking !== false
        && assignment?.price !== null
        && assignment?.price !== undefined
        && assignment?.duration !== null
        && assignment?.duration !== undefined
      ));
      return enabledOnline.length === 0;
    });

    const activeServicesWithoutWorker = activeServices.filter((service) => !activeWorkerServiceIds.has(String(service._id)));
    const onlineWorkersMissingProfile = activeOnlineWorkers.filter((worker) => {
      const hasPhoto = Boolean(worker.photoUrl || worker.profilePhoto);
      const hasBio = Boolean(worker.shortBio || worker.bio);
      return !hasPhoto || !hasBio;
    });

    const rakebWorker = workers.find((worker) => worker.systemKey === RAKEB_SYSTEM_KEY || worker.isDefault);
    const rakebAssignments = rakebWorker?.serviceAssignments || [];
    const rakebServiceCount = rakebAssignments.filter((item) => item.enabled !== false).length;

    const attentionItems = [
      {
        key: 'staff-notifications',
        label: `${unreadAdminNotifications || 0} staff/client notification${Number(unreadAdminNotifications || 0) === 1 ? '' : 's'} need review`,
        severity: unreadAdminNotifications ? 'warning' : 'ok',
        count: unreadAdminNotifications || 0,
        path: '/admin/dashboard',
      },
      {
        key: 'pending-appointments',
        label: `${todayPending.length} pending appointment${todayPending.length === 1 ? '' : 's'} need confirmation`,
        severity: todayPending.length ? 'warning' : 'ok',
        count: todayPending.length,
        path: '/admin/appointments',
      },
      {
        key: 'sms-failed',
        label: `${failedSmsLast24h} failed or undelivered SMS event${failedSmsLast24h === 1 ? '' : 's'} in the last 24 hours`,
        severity: failedSmsLast24h ? 'danger' : 'ok',
        count: failedSmsLast24h,
        path: '/admin/notifications',
      },
      {
        key: 'unassigned-clients',
        label: `${unassignedClients} client${unassignedClients === 1 ? '' : 's'} without assigned stylist`,
        severity: unassignedClients ? 'warning' : 'ok',
        count: unassignedClients,
        path: '/admin/clients',
      },
      {
        key: 'unassigned-appointments',
        label: `${unassignedAppointments} appointment${unassignedAppointments === 1 ? '' : 's'} without stylist`,
        severity: unassignedAppointments ? 'danger' : 'ok',
        count: unassignedAppointments,
        path: '/admin/workers',
      },
      {
        key: 'workers-no-services',
        label: `${onlineWorkersWithoutServices.length} online stylist${onlineWorkersWithoutServices.length === 1 ? '' : 's'} with no bookable services`,
        severity: onlineWorkersWithoutServices.length ? 'warning' : 'ok',
        count: onlineWorkersWithoutServices.length,
        path: '/admin/workers',
      },
      {
        key: 'services-no-worker',
        label: `${activeServicesWithoutWorker.length} active service${activeServicesWithoutWorker.length === 1 ? '' : 's'} with no active stylist`,
        severity: activeServicesWithoutWorker.length ? 'danger' : 'ok',
        count: activeServicesWithoutWorker.length,
        path: '/admin/workers',
      },
      {
        key: 'worker-profile-missing',
        label: `${onlineWorkersMissingProfile.length} online stylist profile${onlineWorkersMissingProfile.length === 1 ? '' : 's'} missing photo or bio`,
        severity: onlineWorkersMissingProfile.length ? 'info' : 'ok',
        count: onlineWorkersMissingProfile.length,
        path: '/admin/workers',
      },
    ];

    const checklist = [
      {
        key: 'rakeb-worker',
        label: 'Rakeb G exists as default master stylist/admin',
        done: Boolean(rakebWorker && rakebWorker.active !== false && rakebWorker.isDefault),
        path: '/admin/workers',
      },
      {
        key: 'clients-assigned',
        label: 'All clients have an assigned stylist',
        done: unassignedClients === 0 && totalClients >= 0,
        detail: unassignedClients ? `${unassignedClients} remaining` : 'Complete',
        path: '/admin/clients',
      },
      {
        key: 'appointments-assigned',
        label: 'All appointments have an assigned stylist',
        done: unassignedAppointments === 0,
        detail: unassignedAppointments ? `${unassignedAppointments} remaining` : 'Complete',
        path: '/admin/appointments',
      },
      {
        key: 'rakeb-services',
        label: 'Current services are assigned to Rakeb G with worker prices',
        done: activeServices.length === 0 || rakebServiceCount >= activeServices.length,
        detail: `${rakebServiceCount}/${activeServices.length} active services`,
        path: '/admin/workers',
      },
      {
        key: 'worker-profiles',
        label: 'Online stylist photos and bios are complete',
        done: onlineWorkersMissingProfile.length === 0,
        detail: onlineWorkersMissingProfile.length ? `${onlineWorkersMissingProfile.length} needs profile work` : 'Complete',
        path: '/admin/workers',
      },
      {
        key: 'service-coverage',
        label: 'Every active service has at least one active stylist',
        done: activeServicesWithoutWorker.length === 0,
        detail: activeServicesWithoutWorker.length ? `${activeServicesWithoutWorker.length} missing coverage` : 'Complete',
        path: '/admin/workers',
      },
    ];

    const statusLogs = recentSmsLogs.map((log) => ({
      _id: String(log._id),
      to: log.to || '',
      status: log.status || '',
      errorCode: log.errorCode || '',
      errorMessage: log.errorMessage || '',
      timestamp: log.timestamp,
    }));

    res.json({
      generatedAt: new Date().toISOString(),
      timezone: TIMEZONE,
      dates: { today, tomorrow, weekStart, weekEnd, monthStart, next14Days },
      snapshot: {
        todayAppointments: todayAppointments.length,
        todayBookedOrPending: todayActive.length,
        pendingConfirmations: todayPending.length,
        completedToday: todayCompleted.length,
        canceledToday: todayCanceled.length,
        estimatedRevenueToday: todayRevenue,
        estimatedRevenueThisWeek: weekRevenue,
        estimatedRevenueThisMonth: monthRevenue,
      },
      todaySchedule: todayAppointments
        .filter((appt) => !CANCELED_STATUSES.includes(String(appt.status || '').toLowerCase()))
        .map(publicAppointment),
      upcomingAppointments: upcomingAppointments.map(publicAppointment),
      workers: activeWorkers.map((worker) => publicWorker(worker, workerStats.get(String(worker._id)) || {})),
      recentClients: recentClients.map((client) => ({
        _id: String(client._id),
        name: clientName(client),
        phone: client.phone || '',
        nickname: client.nickname || '',
        assignedStylist: workerName(client.assignedStylistId),
      })),
      attentionItems,
      setupChecklist: checklist,
      smsStatus: {
        messagesLast24h,
        failedLast24h: failedSmsLast24h,
        lastStatusAt: statusLogs[0]?.timestamp || null,
        auditCopyEnabled: settingValue(runtimeSettings, 'sms.auditCopy.enabled', false),
        auditCopyTo: settingValue(runtimeSettings, 'sms.auditCopy.to', ''),
        clientDeliveryEnabled: settingValue(runtimeSettings, 'sms.clientDelivery.enabled', true),
        clientNameEnabled: settingValue(runtimeSettings, 'sms.clientName.enabled', false),
        blockSixAmReminders: settingValue(runtimeSettings, 'sms.guard.blockSixAmReminders.enabled', false),
        blockInvalidDateTime: settingValue(runtimeSettings, 'sms.blockIfDateTimeInvalid.enabled', true),
        auditOnlyMode: settingValue(runtimeSettings, 'sms.auditOnlyMode.enabled', false),
        reminderStrictDateTimeValidation: settingValue(runtimeSettings, 'sms.reminder.strictDateTimeValidation.enabled', true),
        appendBookingLink: settingValue(runtimeSettings, 'sms.appendBookingLink.enabled', true),
        statusLogs,
      },
      adminNotifications: {
        unread: unreadAdminNotifications || 0,
        latest: (adminNotifications || []).map((item) => ({
          _id: String(item._id),
          type: item.type || '',
          severity: item.severity || 'info',
          title: item.title || 'Notification',
          message: item.message || '',
          actorName: item.actorName || '',
          actorEmail: item.actorEmail || '',
          createdAt: item.createdAt,
          clientId: item.clientId ? String(item.clientId) : '',
          fromWorkerId: item.fromWorkerId ? String(item.fromWorkerId) : '',
          toWorkerId: item.toWorkerId ? String(item.toWorkerId) : '',
          metadata: item.metadata || {},
        })),
      },
      systemErrors: {
        canView: canViewSystemErrors(req),
        last24h: systemErrorsLast24h || 0,
        unresolved: unresolvedSystemErrors || 0,
        latest: (recentSystemErrors || []).map(publicSystemError),
        retention: {
          dedupe: 'one unresolved row per fingerprint',
          activeLimit: Number(process.env.SYSTEM_ERROR_ACTIVE_LIMIT || 150),
          resolvedLimit: Number(process.env.SYSTEM_ERROR_RESOLVED_LIMIT || 40),
          resolvedRetentionDays: Number(process.env.SYSTEM_ERROR_RESOLVED_RETENTION_DAYS || 14),
        },
      },
    });
  } catch (err) {
    console.error('❌ getDashboard failed:', err);
    res.status(500).json({ error: err.message || 'Failed to load dashboard.' });
  }
};
