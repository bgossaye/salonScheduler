const Appointment = require('../../models/appointment');
const AdminNotification = require('../../models/adminnotification');
const Client = require('../../models/client');
const Worker = require('../../models/worker');
const sendSMS = require('../../utils/sendSMS');
const { getRuntimeBoolean, getRuntimeString } = require('../../utils/runtimeSettings');
const { resolveStoreCalendarStatus } = require('../../utils/storeCalendar');
const { resolvePromotionForAppointment } = require('../../utils/promotions');
const { applyWorkerPricingToPayload, applyPromotionDiscountToPriceSnapshot } = require('../../utils/workerPricing');
const { assertNoSlotConflicts, saveAppointmentsWithIntegrity } = require('../../utils/appointmentIntegrity');
const { restoreWelcomeOfferForCanceledAppointment } = require('../../utils/welcomeOffer');
const auth = require('../../middleware/authmiddleware');


function can(req, permissionKey) {
  return auth.hasPermission(req, permissionKey);
}

function tokenWorkerId(req) {
  return req.admin?.workerId ? String(req.admin.workerId) : '';
}

function workerDisplayName(worker) {
  return worker?.displayName || [worker?.firstName, worker?.lastName].filter(Boolean).join(' ').trim() || 'that stylist';
}

function clientDisplayName(client) {
  return [client?.firstName, client?.lastName].filter(Boolean).join(' ').trim() || 'This client';
}

function roleKey(req) {
  return String(req.admin?.roleKey || req.admin?.role || '').toLowerCase();
}

function hasSchedulingAuthority(req) {
  const role = roleKey(req);
  const permissions = req.admin?.permissions || {};
  return ['owner', 'admin', 'manager', 'frontdesk'].includes(role)
    || permissions.appointmentsCreateForOthers === true
    || permissions.appointmentsCreate === true;
}

function uniqueFlags(flags = []) {
  return Array.from(new Set((flags || []).filter(Boolean)));
}


function makeGroupBookingId() {
  return `grp_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function sanitizeGroupBookingInput(group = {}) {
  const allowedTypes = ['family', 'caregiver', 'nursing_home', 'wedding', 'event', 'other'];
  const groupType = allowedTypes.includes(String(group.groupType || '').trim()) ? String(group.groupType).trim() : 'other';
  return {
    groupBookingId: String(group.groupBookingId || '').trim() || makeGroupBookingId(),
    groupType,
    groupLabel: String(group.groupLabel || group.label || '').trim(),
    bookedByContactName: String(group.bookedByContactName || group.contactName || '').trim(),
    bookedByContactPhone: phone10(group.bookedByContactPhone || group.contactPhone || ''),
    coordinationNotes: String(group.coordinationNotes || group.notes || '').trim(),
  };
}


function sanitizeEventParticipantInput(item = {}) {
  const raw = item.participant || item.eventParticipant || item.guestClient || item.guest || {};
  const participantRole = String(raw.participantRole || raw.role || item.participantRole || '').trim();
  const participantNotes = String(raw.participantNotes || raw.notes || item.participantNotes || '').trim();
  return { participantRole, participantNotes };
}

function makeEventGuestPhone() {
  // Keep Client.phone unique/required while making clear this is not a real SMS contact.
  // Prefix with 000 and use the final seven digits from time/random.
  const tail = `${Date.now()}${Math.floor(Math.random() * 1000000)}`.replace(/\D/g, '').slice(-7).padStart(7, '0');
  return `000${tail}`;
}

async function resolveGroupAppointmentClient(item = {}, group = {}) {
  if (item.clientId) {
    return {
      clientId: item.clientId,
      participantStatus: item.participantStatus || 'existing_client',
      participantRole: sanitizeEventParticipantInput(item).participantRole,
      participantNotes: sanitizeEventParticipantInput(item).participantNotes,
    };
  }

  const guest = item.guestClient || item.guest || item.eventGuest || null;
  if (!guest || typeof guest !== 'object') {
    const err = new Error('Each group row needs an existing client or a quick-added event guest.');
    err.status = 400;
    err.code = 'GROUP_ROW_CLIENT_REQUIRED';
    throw err;
  }

  const firstName = String(guest.firstName || '').trim();
  const lastName = String(guest.lastName || '').trim() || 'Event Guest';
  if (!firstName) {
    const err = new Error('Quick-added event guest needs at least a first name.');
    err.status = 400;
    err.code = 'EVENT_GUEST_NAME_REQUIRED';
    throw err;
  }

  const suppliedPhone = phone10(guest.phone || '');
  const phone = /^\d{10}$/.test(suppliedPhone) ? suppliedPhone : makeEventGuestPhone();
  const email = String(guest.email || '').trim().toLowerCase();

  let client = null;
  let createdNewGuest = false;
  if (/^\d{10}$/.test(suppliedPhone)) {
    client = await Client.findOne({ phone: suppliedPhone }).lean();
  }

  if (!client) {
    const eventLabel = group.groupLabel || group.groupType || 'Event group';
    client = await Client.create({
      firstName,
      lastName,
      phone,
      ...(email && { email }),
      clientType: 'event_guest',
      isEventGuest: true,
      requiresNamePinUpgrade: true,
      contactPreferences: {
        method: 'sms',
        optInPromotions: false,
        emailDisabled: !email,
      },
      eventGuestMeta: {
        source: 'admin_group_booking_quick_add',
        eventLabel,
        eventRole: String(guest.role || guest.participantRole || '').trim(),
        createdFromGroupBookingId: group.groupBookingId || '',
      },
      notes: {
        specialInstructions: String(guest.notes || '').trim(),
      },
    });
    createdNewGuest = true;
  }

  const participant = sanitizeEventParticipantInput(item);
  return {
    clientId: client._id,
    participantStatus: client.isEventGuest || client.clientType === 'event_guest' ? 'event_guest' : 'existing_client',
    participantRole: participant.participantRole || String(guest.role || guest.participantRole || '').trim(),
    participantNotes: participant.participantNotes || String(guest.notes || '').trim(),
    _resolvedGuestClient: client,
    _createdQuickGuestClientId: createdNewGuest ? client._id : null,
  };
}

async function applySeamlessStylistBookingRules(req, rawPayload = {}) {
  if (!rawPayload?.clientId) return rawPayload;

  const client = await Client.findById(rawPayload.clientId)
    .select('firstName lastName assignedStylistId')
    .populate('assignedStylistId', 'displayName firstName lastName title tierKey active serviceAssignments')
    .lean();

  if (!client) {
    const err = new Error('Client not found.');
    err.status = 404;
    err.code = 'CLIENT_NOT_FOUND';
    throw err;
  }

  const defaultStylistId = client.assignedStylistId ? String(client.assignedStylistId._id || client.assignedStylistId) : '';
  const bookerWorkerId = tokenWorkerId(req);
  const schedulingAuthority = hasSchedulingAuthority(req);
  const submittedWorkerId = String(rawPayload.workerId || '').trim();
  const selectedWorkerId = submittedWorkerId || defaultStylistId || bookerWorkerId || '';

  const bookingAnotherStylist = !!bookerWorkerId && !!selectedWorkerId && selectedWorkerId !== bookerWorkerId;
  const bookingOwnSchedule = !!bookerWorkerId && !!selectedWorkerId && selectedWorkerId === bookerWorkerId;
  // A stylist placing an appointment on another stylist's calendar always
  // creates a pending request. Owner/admin/manager/front-desk bookings remain
  // booked immediately, even when they select a different stylist.
  const stylistBookingAnotherStylist = bookingAnotherStylist && roleKey(req) === 'stylist';
  const nonAdminStylistBookingAnotherStylist = stylistBookingAnotherStylist;
  const oneTimeNonDefaultStylist = !!defaultStylistId && !!selectedWorkerId && selectedWorkerId !== defaultStylistId;
  const nonAdminNonOwnerBookedSelf = !!defaultStylistId
    && oneTimeNonDefaultStylist
    && bookingOwnSchedule
    && !schedulingAuthority;

  const flags = uniqueFlags([
    ...(rawPayload.bookingFlags || rawPayload.flags || []),
    !defaultStylistId ? 'client_has_no_default_stylist' : '',
    oneTimeNonDefaultStylist ? 'one_time_non_default_stylist' : '',
    nonAdminStylistBookingAnotherStylist ? 'booked_by_stylist_for_another_stylist' : '',
    nonAdminStylistBookingAnotherStylist ? 'requires_receiving_stylist_confirmation' : '',
    nonAdminNonOwnerBookedSelf ? 'booked_by_non_owner_stylist_under_self' : '',
    nonAdminNonOwnerBookedSelf ? 'client_owner_stylist_notification_required' : '',
    oneTimeNonDefaultStylist ? 'client_ownership_unchanged' : '',
    schedulingAuthority && oneTimeNonDefaultStylist ? `booked_by_${roleKey(req) || 'staff'}_one_time_override` : '',
  ]);

  return {
    ...rawPayload,
    workerId: selectedWorkerId || rawPayload.workerId,
    workerTierKey: (selectedWorkerId === defaultStylistId ? client.assignedStylistId?.tierKey : rawPayload.workerTierKey) || rawPayload.workerTierKey || '',
    // Creation status is determined by who is booking, not by a submitted
    // status value: salon-authorized staff bookings are booked immediately;
    // stylist-to-stylist bookings require confirmation.
    status: nonAdminStylistBookingAnotherStylist ? 'pending' : 'booked',
    bookingFlags: flags,
    clientDefaultStylistAtBooking: defaultStylistId || null,
    bookedByAdminId: req.admin?.id || req.admin?._id || null,
    bookedByWorkerId: bookerWorkerId || null,
    bookedByRole: roleKey(req) || '',
    bookedByName: req.admin?.name || req.admin?.displayName || req.admin?.email || '',
    requiresReceivingStylistConfirmation: nonAdminStylistBookingAnotherStylist,
    receivingStylistConfirmationStatus: nonAdminStylistBookingAnotherStylist ? 'pending' : 'not_required',
    oneTimeStylistChange: oneTimeNonDefaultStylist,
    clientOwnerStylistNotified: false,
    ownerStylistNotificationStatus: nonAdminNonOwnerBookedSelf ? 'pending' : 'not_required',
    _clientAssignedStylistName: defaultStylistId ? workerDisplayName(client.assignedStylistId) : '',
    _clientName: clientDisplayName(client),
    _notifyClientOwnerStylist: nonAdminNonOwnerBookedSelf,
  };
}

async function notifyClientOwnerStylistAboutOneTimeSelfBooking({ req, appointment, payload }) {
  if (!payload?._notifyClientOwnerStylist || !appointment?._id || !payload?.clientDefaultStylistAtBooking) return false;

  const [client, ownerWorker, bookingWorker] = await Promise.all([
    Client.findById(payload.clientId).select('firstName lastName phone assignedStylistId').lean(),
    Worker.findById(payload.clientDefaultStylistAtBooking).select('displayName firstName lastName title').lean(),
    payload.workerId ? Worker.findById(payload.workerId).select('displayName firstName lastName title').lean() : null,
  ]);

  const clientName = clientDisplayName(client);
  const ownerName = workerDisplayName(ownerWorker);
  const bookingName = workerDisplayName(bookingWorker) || payload.bookedByName || 'Another stylist';
  const serviceName = payload.service || 'an appointment';
  const when = [payload.date, payload.time].filter(Boolean).join(' at ');

  await AdminNotification.create({
    type: 'client_one_time_booked_by_non_owner',
    severity: 'warning',
    title: 'Client booked with non-owner stylist',
    message: `${bookingName} booked ${clientName}, who is assigned to ${ownerName}, for ${serviceName}${when ? ` on ${when}` : ''}. Client ownership was not changed.`,
    actorAdminId: req.admin?.id || req.admin?._id || null,
    actorName: payload.bookedByName || req.admin?.name || req.admin?.displayName || req.admin?.email || bookingName,
    actorEmail: req.admin?.email || '',
    clientId: payload.clientId || null,
    fromWorkerId: payload.workerId || null,
    toWorkerId: payload.clientDefaultStylistAtBooking || null,
    status: 'unread',
    metadata: {
      appointmentId: String(appointment._id),
      clientName,
      ownerStylistName: ownerName,
      bookedWithStylistName: bookingName,
      serviceName,
      date: payload.date || '',
      time: payload.time || '',
      bookingFlags: payload.bookingFlags || [],
      ownershipChanged: false,
    },
  });

  await Appointment.findByIdAndUpdate(appointment._id, {
    $set: {
      clientOwnerStylistNotified: true,
      ownerStylistNotificationStatus: 'pending',
    },
    $addToSet: {
      bookingFlags: 'client_owner_stylist_notified',
    },
  });

  return true;
}


async function assignDefaultStylistFromFirstStaffBooking(req, payload = {}) {
  const clientId = payload.clientId;
  const selectedWorkerId = String(payload.workerId || '').trim();
  if (!clientId || !selectedWorkerId || payload.clientDefaultStylistAtBooking) return false;
  if (payload.groupBooking?.participantStatus === 'event_guest') return false;

  // Do not assign permanent ownership when a non-admin stylist books another
  // stylist's schedule. That booking is pending and must stay one-time only.
  if (payload.requiresReceivingStylistConfirmation) return false;

  const bookerWorkerId = tokenWorkerId(req);
  const role = roleKey(req) || 'staff';
  const schedulingAuthority = hasSchedulingAuthority(req);
  const bookingOwnSchedule = !!bookerWorkerId && bookerWorkerId === selectedWorkerId;

  if (!schedulingAuthority && !bookingOwnSchedule) return false;

  const updated = await Client.findOneAndUpdate(
    {
      _id: clientId,
      $or: [
        { assignedStylistId: null },
        { assignedStylistId: { $exists: false } },
      ],
    },
    {
      $set: {
        assignedStylistId: selectedWorkerId,
        defaultStylistAssignedBy: schedulingAuthority
          ? `${role}_first_specific_booking`
          : 'stylist_self_first_specific_booking',
        defaultStylistAssignedAt: new Date(),
      },
    },
    { new: true }
  ).select('_id assignedStylistId').lean();

  return !!updated;
}

async function enforceWorkerCreatePermission(req, rawPayload = {}) {
  if (can(req, 'appointmentsCreate') || can(req, 'appointmentsCreateForOthers')) return rawPayload;

  if (!can(req, 'appointmentsCreateOwn')) {
    const err = new Error('You do not have permission to create appointments. Ask an owner/admin to enable appointment creation for your role.');
    err.status = 403;
    err.code = 'APPOINTMENT_CREATE_NOT_ALLOWED';
    throw err;
  }

  const mine = tokenWorkerId(req);
  if (!mine) {
    const err = new Error('Your staff account is not linked to a worker profile. Ask an owner/admin to fix your worker access.');
    err.status = 403;
    err.code = 'WORKER_PROFILE_REQUIRED';
    throw err;
  }

  // A stylist may create an appointment on another stylist's calendar, but that
  // appointment is automatically saved as pending and flagged by
  // applySeamlessStylistBookingRules. Client ownership is never changed here.
  return rawPayload;
}

async function enforceWorkerEditClientOwnership(req, rawPayload = {}) {
  const mine = tokenWorkerId(req);
  if (!mine) return rawPayload;

  const requestedWorkerId = String(rawPayload.workerId || mine || '').trim();
  if (requestedWorkerId && requestedWorkerId !== mine) {
    const err = new Error('Your role can only edit appointments on your own calendar. Ask front desk/admin to move this appointment to another stylist.');
    err.status = 403;
    err.code = 'WORKER_OWN_CALENDAR_ONLY';
    throw err;
  }

  if (rawPayload.clientId) {
    const client = await Client.findById(rawPayload.clientId).select('firstName lastName assignedStylistId').lean();
    if (!client) {
      const err = new Error('Client not found.');
      err.status = 404;
      err.code = 'CLIENT_NOT_FOUND';
      throw err;
    }
    const assignedId = client.assignedStylistId ? String(client.assignedStylistId) : '';
    if (assignedId && assignedId !== mine) {
      const assignedWorker = await Worker.findById(assignedId).select('displayName firstName lastName title').lean();
      const clientName = [client.firstName, client.lastName].filter(Boolean).join(' ').trim() || 'This client';
      const err = new Error(`${clientName} is assigned to ${workerDisplayName(assignedWorker)}. Only owner/admin can change the client’s default stylist. Continue by saving this as a one-time appointment without changing ownership.`);
      err.status = 409;
      err.code = 'CLIENT_ASSIGNED_TO_OTHER_STYLIST';
      throw err;
    }
  }

  return { ...rawPayload, workerId: mine };
}

async function enforceAppointmentUpdatePermission(req, existing, body = {}) {
  if (can(req, 'appointmentsEdit') || can(req, 'appointmentsEditForOthers')) return { scope: 'all' };

  const own = isOwnAppointment(req, existing);
  const submittedKeys = Object.keys(body || {});
  const hasOnlyStatus = submittedKeys.length > 0 && submittedKeys.every((key) => key === 'status');

  if (!own) {
    const err = new Error('You do not have permission to edit appointments for another stylist. Ask front desk/admin to make this change.');
    err.status = 403;
    err.code = 'APPOINTMENT_OTHER_STYLIST_EDIT_NOT_ALLOWED';
    throw err;
  }

  if (hasOnlyStatus) {
    const neededPermission = statusPermissionFor(body.status);
    if (can(req, neededPermission)) return { scope: 'own-status' };
  }

  if (can(req, 'appointmentsEditOwn')) {
    return { scope: 'own-edit' };
  }

  const err = new Error('You do not have permission to edit your own appointments. Ask an owner/admin to enable this for your role.');
  err.status = 403;
  err.code = 'APPOINTMENT_OWN_EDIT_NOT_ALLOWED';
  throw err;
}

function isOwnAppointment(req, appt) {
  const mine = tokenWorkerId(req);
  return !!mine && String(appt?.workerId || '') === mine;
}

function statusPermissionFor(status) {
  const normalized = String(status || '').toLowerCase();
  if (normalized === 'completed' || normalized === 'complete' || normalized === 'noshow') return 'appointmentsComplete';
  if (normalized === 'canceled' || normalized === 'cancelled' || normalized === 'cancelation') return 'appointmentsCancel';
  return 'appointmentsEdit';
}

function onlyDigits(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function phone10(value = '') {
  const digits = onlyDigits(value);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function isAdminAppointmentRoute(req) {
  return String(req.originalUrl || req.baseUrl || '').includes('/api/admin/appointments');
}

function shouldRecalculatePromotion(body = {}) {
  return ['couponCode', 'serviceId', 'service', 'date', 'workerId', 'workerTierKey'].some((key) => Object.prototype.hasOwnProperty.call(body, key));
}

async function applyPromotionToPayload(payload) {
  const appliedPromotion = await resolvePromotionForAppointment({
    couponCode: payload.couponCode,
    service: { _id: payload.serviceId, name: payload.service },
    serviceId: payload.serviceId,
    serviceName: payload.service,
    date: payload.date,
    clientId: payload.clientId,
    workerId: payload.workerId,
    workerTierKey: payload.workerTierKey,
  });

  return applyPromotionDiscountToPriceSnapshot({
    ...payload,
    couponCode: appliedPromotion?.couponCode || String(payload.couponCode || '').trim().toUpperCase(),
    appliedPromotion: appliedPromotion || null,
  }, appliedPromotion);
}

async function prepareAppointmentPayload(req, rawPayload) {
  const requireOnline = !isAdminAppointmentRoute(req);
  const withWorkerPricing = await applyWorkerPricingToPayload(
    { ...rawPayload, couponCode: rawPayload?.couponCode || '' },
    { requireOnline }
  );
  return applyPromotionToPayload(withWorkerPricing);
}

// GET /api/appointments/client/:id  (client dashboard: list this client's appts)
exports.getAppointmentsForClient = async (req, res) => {
  try {
    const list = await Appointment.find({ clientId: req.params.id })
      .populate('clientId')
      .populate('serviceId')
      .populate('workerId')
      .populate('addOns')
      .sort({ date: 1, time: 1 })
      .lean();

    res.json(list || []);
  } catch (err) {
    console.error('❌ getAppointmentsForClient failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.getAppointments = async (req, res) => {
  try {
    const { date, status, client, workerId } = req.query;
    const query = {};
    const archivedMode = String(req.query.archived || '').toLowerCase();
    query.archived = archivedMode === 'true' || archivedMode === '1' ? true : { $ne: true };
    const ownScopeRequested = ['own', 'my', 'myWork', 'true', '1'].includes(String(req.query.scope || req.query.view || req.query.own || '').trim());
    const mine = tokenWorkerId(req);

    if (date) query.date = date;
    if (status) query.status = status;

    if (ownScopeRequested) {
      if (!can(req, 'appointmentsViewOwn')) {
        return res.status(403).json({ error: 'Forbidden', permission: 'appointmentsViewOwn' });
      }
      if (!mine) {
        return res.json([]);
      }
      if (workerId && String(workerId) !== mine) {
        return res.status(403).json({ error: 'Workers can only view their own appointments.' });
      }
      query.workerId = mine;
    } else if (can(req, 'appointmentsViewAll')) {
      if (workerId) query.workerId = workerId;
    } else if (can(req, 'appointmentsViewOwn') && mine) {
      if (workerId && String(workerId) !== mine) {
        return res.status(403).json({ error: 'Workers can only view their own appointments.' });
      }
      query.workerId = mine;
    } else {
      return res.status(403).json({ error: 'Forbidden', permission: 'appointmentsViewAll' });
    }
    if (client) {
      const rawClientSearch = String(client || '').trim();
      const clientDigits = onlyDigits(rawClientSearch);
      query.$or = [
        { clientName: { $regex: rawClientSearch, $options: 'i' } },
        ...(clientDigits
          ? [
              ...(clientDigits.length >= 10 ? [{ clientPhone: phone10(clientDigits) }] : []),
              { clientPhone: { $regex: clientDigits } },
            ]
          : [{ clientPhone: { $regex: rawClientSearch, $options: 'i' } }]),
      ];
    }

    const appointments = await Appointment.find(query)
      .populate('clientId')
      .populate('serviceId')
      .populate('workerId')
      .populate('addOns')
      .sort({ date: 1, time: 1 });

    res.json(appointments);
  } catch (err) {
    console.error('❌ getAppointments failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createAppointment = async (req, res) => {
  try {
    if (!isAdminAppointmentRoute(req)) {
      const onlineBookingEnabled = await getRuntimeBoolean('booking.online.enabled', true);
      if (!onlineBookingEnabled) {
        const disabledMessage = await getRuntimeString(
          'booking.online.disabledMessage',
          'Online booking is temporarily unavailable. Please call Rakie Salon to schedule.'
        );
        return res.status(403).json({ error: disabledMessage, code: 'ONLINE_BOOKING_DISABLED' });
      }
    }

    const { clientId, serviceId, service, date, time } = req.body;

    if (!clientId || !serviceId || !service || !date || !time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!isAdminAppointmentRoute(req)) {
      const calendarStatus = await resolveStoreCalendarStatus(date);
      if (calendarStatus.storeClosed) {
        return res.status(403).json({
          error: calendarStatus.customerMessage || 'Rakie Salon is closed on this date. Please choose another date.',
          code: 'STORE_CLOSED_DATE',
        });
      }
      if (calendarStatus.onlineBookingOff) {
        return res.status(403).json({
          error: calendarStatus.customerMessage || 'Online booking is not available for this date. Please call Rakie Salon to schedule.',
          code: 'ONLINE_BOOKING_OFF_DATE',
        });
      }
    }

    const ownedPayload = await enforceWorkerCreatePermission(req, req.body);
    const relationshipPayload = await applySeamlessStylistBookingRules(req, ownedPayload);
    const payload = await prepareAppointmentPayload(req, relationshipPayload);
    const ownerNotificationPayload = {
      _notifyClientOwnerStylist: payload._notifyClientOwnerStylist,
      clientDefaultStylistAtBooking: payload.clientDefaultStylistAtBooking,
      workerId: payload.workerId,
      clientId: payload.clientId,
      service: payload.service,
      date: payload.date,
      time: payload.time,
      bookedByName: payload.bookedByName,
      bookingFlags: payload.bookingFlags || [],
    };
    delete payload._clientAssignedStylistName;
    delete payload._clientName;
    delete payload._notifyClientOwnerStylist;

    const [created] = await saveAppointmentsWithIntegrity([payload]);
    let saved = created;

    const assignedFromFirstStaffBooking = await assignDefaultStylistFromFirstStaffBooking(req, payload);
    if (assignedFromFirstStaffBooking) {
      saved.bookingFlags = uniqueFlags([
        ...(saved.bookingFlags || []),
        'default_stylist_assigned_from_first_staff_booking',
      ]);
      saved = await saved.save();
    }

    try {
      const ownerNotified = await notifyClientOwnerStylistAboutOneTimeSelfBooking({
        req,
        appointment: saved,
        payload: ownerNotificationPayload,
      });
      if (ownerNotified) {
        saved = await Appointment.findById(saved._id);
      }
    } catch (notifyErr) {
      console.error('[appointment-owner-notice] failed:', notifyErr?.message || notifyErr);
    }

    res.status(201).json(saved);

    setImmediate(async () => {
      try {
        const populated = await Appointment.findById(saved._id)
          .populate('clientId')
          .populate('serviceId')
          .populate('workerId');

        const startTime = new Date(`${populated.date}T${populated.time}`);
        const smsType = saved.status === 'pending' ? 'pending' : 'confirmation';

        await sendSMS(smsType, {
          phone: populated?.clientId?.phone,
          client: { firstName: populated?.clientId?.firstName, lastName: populated?.clientId?.lastName },
          service: populated?.serviceId?.name || populated?.service,
          workerName: populated?.workerName || populated?.workerId?.displayName || '',
          startTime,
          ...(populated.toObject?.() || populated),
        });
      } catch (e) {
        console.error('[notify] confirmation failed', e);
      }
    });
  } catch (err) {
    console.error('❌ Failed to create appointment:', err);
    res.status(err.status || 500).json({
      error: err.status && err.status < 500 ? err.message : 'Server error',
      code: err.code,
    });
  }
};



exports.createGroupAppointments = async (req, res) => {
  try {
    const appointments = Array.isArray(req.body?.appointments) ? req.body.appointments : [];
    if (appointments.length < 2) {
      return res.status(400).json({
        error: 'Group booking requires at least two appointment rows. Use normal booking for one client.',
        code: 'GROUP_BOOKING_MINIMUM_NOT_MET',
      });
    }

    if (!hasSchedulingAuthority(req) && !can(req, 'appointmentsCreateForOthers')) {
      return res.status(403).json({
        error: 'Only owner/admin/manager/front desk can create coordinated group bookings.',
        code: 'GROUP_BOOKING_STAFF_ONLY',
      });
    }

    const group = sanitizeGroupBookingInput(req.body?.group || {});
    const totalAppointments = appointments.length;

    for (let i = 0; i < appointments.length; i += 1) {
      const item = appointments[i] || {};
      const { clientId, serviceId, service, date, time } = item;
      const hasQuickGuest = !!(item.guestClient || item.guest || item.eventGuest);
      if ((!clientId && !hasQuickGuest) || !serviceId || !service || !date || !time) {
        return res.status(400).json({
          error: `Group appointment row ${i + 1} is missing client/guest, service, date, or time.`,
          code: 'GROUP_APPOINTMENT_ROW_INCOMPLETE',
          row: i + 1,
        });
      }
    }

    const preparedRows = [];
    const createdQuickGuestClientIds = [];

    // Stage every row first. Nothing is saved until all rows pass ownership,
    // stylist, price, promotion, and relationship checks. This prevents a half-created group.
    try {
    for (let i = 0; i < appointments.length; i += 1) {
      const item = appointments[i] || {};
      const resolvedClient = await resolveGroupAppointmentClient(item, group);
      if (resolvedClient._createdQuickGuestClientId) createdQuickGuestClientIds.push(resolvedClient._createdQuickGuestClientId);

      const rawRow = {
        ...item,
        clientId: resolvedClient.clientId,
        status: item.status || 'booked',
        bookingFlags: uniqueFlags([
          ...(item.bookingFlags || item.flags || []),
          'staff_coordinated_group_booking',
          'phone_or_desk_group_booking',
          resolvedClient.participantStatus === 'event_guest' ? 'event_guest_quick_added' : '',
        ]),
        groupBooking: {
          ...group,
          participantStatus: resolvedClient.participantStatus || 'existing_client',
          participantRole: resolvedClient.participantRole || '',
          participantNotes: resolvedClient.participantNotes || '',
          sequence: i + 1,
          totalAppointments,
        },
      };
      delete rawRow.guestClient;
      delete rawRow.guest;
      delete rawRow.eventGuest;
      delete rawRow.participant;

      const ownedPayload = await enforceWorkerCreatePermission(req, rawRow);
      const relationshipPayload = await applySeamlessStylistBookingRules(req, ownedPayload);
      const payload = await prepareAppointmentPayload(req, relationshipPayload);
      const ownerNotificationPayload = {
        _notifyClientOwnerStylist: payload._notifyClientOwnerStylist,
        clientDefaultStylistAtBooking: payload.clientDefaultStylistAtBooking,
        workerId: payload.workerId,
        clientId: payload.clientId,
        service: payload.service,
        date: payload.date,
        time: payload.time,
        bookedByName: payload.bookedByName,
        bookingFlags: payload.bookingFlags || [],
      };
      delete payload._clientAssignedStylistName;
      delete payload._clientName;
      delete payload._notifyClientOwnerStylist;

      preparedRows.push({ payload, ownerNotificationPayload });
    }
    } catch (stageErr) {
      if (createdQuickGuestClientIds.length) {
        await Client.deleteMany({ _id: { $in: createdQuickGuestClientIds } }).catch((cleanupErr) => {
          console.error('[group-booking] quick guest staging cleanup failed:', cleanupErr?.message || cleanupErr);
        });
      }
      throw stageErr;
    }

    let savedAppointments;
    try {
      savedAppointments = await saveAppointmentsWithIntegrity(preparedRows.map((row) => row.payload));
    } catch (saveErr) {
      if (createdQuickGuestClientIds.length) {
        await Client.deleteMany({ _id: { $in: createdQuickGuestClientIds } }).catch((cleanupErr) => {
          console.error('[group-booking] quick guest save cleanup failed:', cleanupErr?.message || cleanupErr);
        });
      }
      throw saveErr;
    }

    for (let i = 0; i < savedAppointments.length; i += 1) {
      let saved = savedAppointments[i];
      const payload = preparedRows[i].payload;

      const assignedFromFirstStaffBooking = await assignDefaultStylistFromFirstStaffBooking(req, payload);
      if (assignedFromFirstStaffBooking) {
        saved.bookingFlags = uniqueFlags([
          ...(saved.bookingFlags || []),
          'default_stylist_assigned_from_first_staff_booking',
        ]);
        saved = await saved.save();
      }

      try {
        const ownerNotified = await notifyClientOwnerStylistAboutOneTimeSelfBooking({
          req,
          appointment: saved,
          payload: preparedRows[i].ownerNotificationPayload,
        });
        if (ownerNotified) saved = await Appointment.findById(saved._id);
      } catch (notifyErr) {
        console.error('[group-appointment-owner-notice] failed:', notifyErr?.message || notifyErr);
      }

      savedAppointments[i] = saved;
    }

    res.status(201).json({
      group,
      appointments: savedAppointments,
      count: savedAppointments.length,
    });

    setImmediate(async () => {
      for (const saved of savedAppointments) {
        try {
          const populated = await Appointment.findById(saved._id)
            .populate('clientId')
            .populate('serviceId')
            .populate('workerId');
          if (!populated) continue;
          if (String(populated?.clientId?.phone || '').startsWith('000')) continue;
          const startTime = new Date(`${populated.date}T${populated.time}`);
          const smsType = populated.status === 'pending' ? 'pending' : 'confirmation';
          await sendSMS(smsType, {
            phone: populated?.clientId?.phone,
            client: { firstName: populated?.clientId?.firstName, lastName: populated?.clientId?.lastName },
            service: populated?.serviceId?.name || populated?.service,
            workerName: populated?.workerName || populated?.workerId?.displayName || '',
            startTime,
            ...(populated.toObject?.() || populated),
          });
        } catch (e) {
          console.error('[notify] group confirmation failed', e?.message || e);
        }
      }
    });
  } catch (err) {
    console.error('❌ Failed to create group appointments:', err);
    res.status(err.status || 500).json({
      error: err.status && err.status < 500 ? err.message : 'Server error',
      code: err.code,
    });
  }
};

exports.updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, ...otherFields } = req.body;

    const existing = await Appointment.findById(id).lean();
    if (!existing) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const updateAccess = await enforceAppointmentUpdatePermission(req, existing, req.body || {});

    let mergedForUpdate = { ...existing, ...otherFields, status: status ?? existing.status };
    if (updateAccess.scope === 'own-edit') {
      mergedForUpdate = await enforceWorkerEditClientOwnership(req, mergedForUpdate);
    }

    // Reprice only when a pricing/promotion input actually changes. A status-only update
    // (especially cancellation) must preserve the stored price snapshot. Revalidating the
    // NEWCLIENT10 welcome-credit snapshot as a normal coupon would incorrectly reject it.
    const shouldReprice = shouldRecalculatePromotion(req.body || {})
      || ['addOns', 'duration', 'price', 'basePrice', 'workerPrice'].some(
        (key) => Object.prototype.hasOwnProperty.call(req.body || {}, key)
      );
    if (mergedForUpdate.serviceId && shouldReprice) {
      mergedForUpdate = await prepareAppointmentPayload(req, mergedForUpdate);
    }

    const updateFields = { ...mergedForUpdate };
    delete updateFields._id;
    delete updateFields.__v;
    if (status !== undefined) updateFields.status = status;

    // When the receiving stylist accepts a pending appointment by marking it
    // Booked, clear the temporary confirmation requirement so the appointment
    // no longer displays "Needs stylist confirmation". Keep other booking
    // context flags, such as one-time stylist/owner notification flags.
    if (String(status || '').toLowerCase() === 'booked' && existing.requiresReceivingStylistConfirmation) {
      updateFields.requiresReceivingStylistConfirmation = false;
      updateFields.receivingStylistConfirmationStatus = 'accepted';
      updateFields.bookingFlags = uniqueFlags(updateFields.bookingFlags || []).filter(
        (flag) => flag !== 'requires_receiving_stylist_confirmation'
      );
    }

    if (req.body?.date || req.body?.time || req.body?.duration || req.body?.workerId || req.body?.serviceId) {
      await assertNoSlotConflicts([updateFields], { ignoreAppointmentIds: [id] });
    }

    const updated = await Appointment.findByIdAndUpdate(id, updateFields, {
      new: true,
    })
      .populate('clientId')
      .populate('serviceId')
      .populate('workerId')
      .populate('addOns');

    if (!updated) {
      return res.status(404).json({ message: 'Appointment not found' });
    }

    const normalizedStatus = String(status || '').trim().toLowerCase();
    if (['canceled', 'cancelled', 'cancelation', 'cancellation'].includes(normalizedStatus)) {
      await restoreWelcomeOfferForCanceledAppointment(updated);
    }

    res.json(updated);

    if (status !== undefined) {
      setImmediate(() => {
        const startTime = new Date(`${updated.date}T${updated.time}`);
        sendSMS(status, {
          phone: updated?.clientId?.phone,
          client: { firstName: updated?.clientId?.firstName, lastName: updated?.clientId?.lastName },
          service: updated?.serviceId?.name || updated?.service,
          workerName: updated?.workerName || updated?.workerId?.displayName || '',
          startTime,
          ...(updated.toObject?.() || updated),
        }).catch(e => console.error('[notify] status update failed', e));
      });
    }
  } catch (err) {
    console.error('❌ Update failed:', err);
    if (!res.headersSent) {
      res.status(err.status || 500).json({
        message: err.status && err.status < 500 ? err.message : 'Failed to update appointment',
        error: err.status && err.status < 500 ? err.message : undefined,
        code: err.code,
      });
    }
  }
};

exports.deleteAppointment = async (req, res) => {
  try {
    const appt = await Appointment.findById(req.params.id).populate('clientId');
    if (!appt) return res.status(404).json({ error: 'Appointment not found' });
    if (!can(req, 'appointmentsDelete')) return res.status(403).json({ error: 'Forbidden', permission: 'appointmentsDelete' });
    await Appointment.findByIdAndDelete(req.params.id);

    res.json({ message: 'Appointment deleted and client notified (if opted in)' });
  } catch (err) {
    console.error('❌ Failed to delete appointment:', err);
    res.status(500).json({ error: 'Delete failed' });
  }
};
