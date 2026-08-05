const Appointment = require('../../models/appointment');
const Client = require('../../models/client');
const sendSMS = require('../../utils/sendSMS');
const { getRuntimeBoolean, getRuntimeString, getRuntimeNumber } = require('../../utils/runtimeSettings');
const { resolveStoreCalendarStatus } = require('../../utils/storeCalendar');
const { resolvePromotionForAppointment } = require('../../utils/promotions');
const { applyWorkerPricingToPayload, applyPromotionDiscountToPriceSnapshot } = require('../../utils/workerPricing');
const { assertNoSlotConflicts, saveAppointmentsWithIntegrity } = require('../../utils/appointmentIntegrity');
const { restoreWelcomeOfferForCanceledAppointment } = require('../../utils/welcomeOffer');

function onlyDigits(value = '') {
  return String(value || '').replace(/\D/g, '');
}

function phone10(value = '') {
  const digits = onlyDigits(value);
  return digits.length >= 10 ? digits.slice(-10) : digits;
}

function allowedPublicUpdate(body = {}) {
  const allowed = [
    'clientId',
    'serviceId',
    'service',
    'workerId',
    'workerTierKey',
    'date',
    'time',
    'duration',
    'addOns',
    'couponCode',
    'status',
  ];
  return Object.fromEntries(
    allowed
      .filter((key) => Object.prototype.hasOwnProperty.call(body, key))
      .map((key) => [key, body[key]])
  );
}

function normalizePublicStatus(status, fallback = 'pending') {
  const value = String(status || '').trim().toLowerCase();
  if (value === 'canceled' || value === 'cancelled' || value === 'cancelation') return 'canceled';
  if (value === 'pending') return 'pending';
  if (value === 'booked') return 'booked';
  return fallback;
}

function publicSafeAppointmentQuery(base = {}) {
  return {
    ...base,
  };
}

async function appointmentClientMatches(existing, body = {}) {
  const submittedClientId = String(body.clientId || body.client || '').trim();
  const submittedPhone = phone10(body.phone || body.clientPhone || body.clientPhoneNumber || '');
  if (!submittedClientId && !submittedPhone) return false;

  const existingClientId = String(existing?.clientId?._id || existing?.clientId || '').trim();
  if (submittedClientId && existingClientId && existingClientId === submittedClientId) return true;

  if (submittedPhone && existingClientId) {
    const client = await Client.findById(existingClientId).select('phone').lean();
    return phone10(client?.phone || '') === submittedPhone;
  }
  return false;
}

async function applyPublicStylistBookingRules(rawPayload = {}) {
  if (!rawPayload?.clientId) return rawPayload;

  const client = await Client.findById(rawPayload.clientId)
    .select('assignedStylistId')
    .populate('assignedStylistId', 'tierKey')
    .lean();

  const defaultStylistId = client?.assignedStylistId ? String(client.assignedStylistId._id || client.assignedStylistId) : '';
  const selectedWorkerId = String(rawPayload.workerId || defaultStylistId || '').trim();
  const oneTimeNonDefaultStylist = !!defaultStylistId && !!selectedWorkerId && selectedWorkerId !== defaultStylistId;
  const flags = Array.from(new Set([
    ...(rawPayload.bookingFlags || rawPayload.flags || []),
    !defaultStylistId ? 'client_has_no_default_stylist' : '',
    oneTimeNonDefaultStylist ? 'one_time_non_default_stylist' : '',
    oneTimeNonDefaultStylist ? 'client_selected_one_time_non_default_stylist' : '',
  ].filter(Boolean)));

  return {
    ...rawPayload,
    workerId: selectedWorkerId || rawPayload.workerId,
    workerTierKey: (selectedWorkerId === defaultStylistId ? client?.assignedStylistId?.tierKey : rawPayload.workerTierKey) || rawPayload.workerTierKey || '',
    bookingFlags: flags,
    clientDefaultStylistAtBooking: defaultStylistId || null,
    oneTimeStylistChange: oneTimeNonDefaultStylist,
  };
}


async function assignDefaultStylistFromFirstClientBooking({ clientId, workerId }) {
  const selectedWorkerId = String(workerId || '').trim();
  if (!clientId || !selectedWorkerId) return false;

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
        defaultStylistAssignedBy: 'client_first_specific_booking',
        defaultStylistAssignedAt: new Date(),
      },
    },
    { new: true }
  ).select('_id assignedStylistId').lean();

  return !!updated;
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

async function preparePublicAppointmentPayload(rawPayload) {
  const withWorkerPricing = await applyWorkerPricingToPayload(
    { ...rawPayload, couponCode: rawPayload?.couponCode || '' },
    { requireOnline: true }
  );
  return applyPromotionToPayload(withWorkerPricing);
}

async function claimAndApplyWelcomeOffer(appointmentDoc) {
  const clientId = appointmentDoc?.clientId?._id || appointmentDoc?.clientId;
  if (!clientId || !appointmentDoc?._id) return appointmentDoc;

  const client = await Client.findOneAndUpdate(
    {
      _id: clientId,
      'welcomeOffer.code': 'NEWCLIENT10',
      'welcomeOffer.status': 'available',
      'welcomeOffer.amount': { $gt: 0 },
    },
    {
      $set: {
        'welcomeOffer.status': 'redeemed',
        'welcomeOffer.redeemedAt': new Date(),
        'welcomeOffer.appointmentId': appointmentDoc._id,
      },
    },
    { new: true }
  ).select('welcomeOffer').lean();

  if (!client?.welcomeOffer) return appointmentDoc;

  const subtotal = Number(appointmentDoc.priceSnapshot?.servicePrice || 0)
    + Number(appointmentDoc.priceSnapshot?.addOnPrice || 0);
  const amount = Math.min(subtotal, Number(client.welcomeOffer.amount || 0));
  if (!(amount > 0)) return appointmentDoc;

  appointmentDoc.couponCode = 'NEWCLIENT10';
  appointmentDoc.appliedPromotion = {
    dealId: 'WELCOME_NEWCLIENT10',
    title: 'New Client $10 Credit',
    type: 'coupon',
    source: 'coupon',
    couponCode: 'NEWCLIENT10',
    discountType: 'fixed',
    discountValue: amount,
    discountPercent: 0,
    appointmentLabel: '$10 new-client credit',
    shortLabel: '$10 off',
    appliedAt: new Date(),
  };
  appointmentDoc.priceSnapshot = {
    ...(appointmentDoc.priceSnapshot?.toObject?.() || appointmentDoc.priceSnapshot || {}),
    discountAmount: amount,
    finalPrice: Math.max(0, subtotal - amount),
    capturedAt: new Date(),
  };
  appointmentDoc.bookingFlags = Array.from(new Set([
    ...(appointmentDoc.bookingFlags || []),
    'new_client_welcome_credit_applied',
  ]));
  return appointmentDoc.save();
}


async function assertOnlineBookingAllowedForDate(date) {
  const onlineBookingEnabled = await getRuntimeBoolean('booking.online.enabled', true);
  if (!onlineBookingEnabled) {
    const disabledMessage = await getRuntimeString(
      'booking.online.disabledMessage',
      'Online booking is temporarily unavailable. Please call Rakie Salon to schedule.'
    );
    const err = new Error(disabledMessage);
    err.status = 403;
    err.code = 'ONLINE_BOOKING_DISABLED';
    throw err;
  }

  const calendarStatus = await resolveStoreCalendarStatus(date);
  if (calendarStatus.storeClosed) {
    const err = new Error(calendarStatus.customerMessage || 'Rakie Salon is closed on this date. Please choose another date.');
    err.status = 403;
    err.code = 'STORE_CLOSED_DATE';
    throw err;
  }
  if (calendarStatus.onlineBookingOff) {
    const err = new Error(calendarStatus.customerMessage || 'Online booking is not available for this date. Please call Rakie Salon to schedule.');
    err.status = 403;
    err.code = 'ONLINE_BOOKING_OFF_DATE';
    throw err;
  }
}

function getOnlineServiceLimit(value) {
  const n = Number(value);
  return [1, 2, 3, 4].includes(n) ? n : 2;
}

function validatePublicAppointmentRow(row = {}, rowNumber = 1) {
  const { clientId, serviceId, service, date, time } = row || {};
  if (!clientId || !serviceId || !service || !date || !time) {
    const err = new Error(`Appointment row ${rowNumber} is missing client, service, date, or time.`);
    err.status = 400;
    err.code = 'APPOINTMENT_ROW_INCOMPLETE';
    err.row = rowNumber;
    throw err;
  }
}

function sendAppointmentSMS(type, appointmentDoc) {
  setImmediate(async () => {
    try {
      const populated = await Appointment.findById(appointmentDoc._id)
        .populate('clientId')
        .populate('serviceId')
        .populate('workerId');

      if (!populated) return;
      const startTime = new Date(`${populated.date}T${populated.time}`);
      await sendSMS(type, {
        phone: populated?.clientId?.phone,
        client: { firstName: populated?.clientId?.firstName, lastName: populated?.clientId?.lastName },
        service: populated?.serviceId?.name || populated?.service,
        workerName: populated?.workerName || populated?.workerId?.displayName || '',
        startTime,
        ...(populated.toObject?.() || populated),
      });
    } catch (err) {
      console.error(`[notify] public appointment ${type} failed`, err?.message || err);
    }
  });
}

exports.getClientAppointments = async (req, res) => {
  try {
    const { clientId, phone, limit } = req.query || {};
    const query = publicSafeAppointmentQuery({});

    if (clientId) {
      query.clientId = clientId;
    } else if (phone) {
      const p10 = phone10(phone);
      if (!p10) return res.json([]);
      const client = await Client.findOne({ phone: p10 }).select('_id').lean();
      if (!client) return res.json([]);
      query.clientId = client._id;
    } else {
      return res.status(400).json({ error: 'clientId or phone is required' });
    }

    const max = Math.min(Math.max(Number(limit || 50), 1), 100);
    const appointments = await Appointment.find(query)
      .populate('clientId')
      .populate('serviceId')
      .populate('workerId')
      .populate('addOns')
      .sort({ date: 1, time: 1 })
      .limit(max)
      .lean();

    return res.json(appointments || []);
  } catch (err) {
    console.error('❌ public getClientAppointments failed:', err?.message || err);
    return res.status(500).json({ error: 'Server error' });
  }
};

exports.getAppointmentsForClient = async (req, res) => {
  req.query = { ...(req.query || {}), clientId: req.params.id };
  return exports.getClientAppointments(req, res);
};

exports.createAppointment = async (req, res) => {
  try {
    const onlineBookingEnabled = await getRuntimeBoolean('booking.online.enabled', true);
    if (!onlineBookingEnabled) {
      const disabledMessage = await getRuntimeString(
        'booking.online.disabledMessage',
        'Online booking is temporarily unavailable. Please call Rakie Salon to schedule.'
      );
      return res.status(403).json({ error: disabledMessage, code: 'ONLINE_BOOKING_DISABLED' });
    }

    if (Array.isArray(req.body?.appointments) || req.body?.groupBooking || req.body?.group) {
      return res.status(403).json({
        error: 'Multiple-client or group bookings require salon coordination. Please call Rakie Salon so we can schedule the right time and staff.',
        code: 'GROUP_BOOKING_CALL_SALON',
      });
    }

    const { clientId, serviceId, service, date, time } = req.body || {};
    if (!clientId || !serviceId || !service || !date || !time) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

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

    const payload = await preparePublicAppointmentPayload(await applyPublicStylistBookingRules({
      ...allowedPublicUpdate(req.body || {}),
      // Every client-created online appointment starts as pending so salon staff
      // can verify the requested service, stylist, date, and time before confirming.
      status: 'pending',
    }));

    const [created] = await saveAppointmentsWithIntegrity([payload], { publicMessage: true });
    let saved = await claimAndApplyWelcomeOffer(created);

    if (!payload.clientDefaultStylistAtBooking && payload.workerId) {
      const assignedFromFirstBooking = await assignDefaultStylistFromFirstClientBooking({
        clientId: payload.clientId,
        workerId: payload.workerId,
      });

      if (assignedFromFirstBooking) {
        const nextFlags = Array.from(new Set([
          ...(saved.bookingFlags || []),
          'default_stylist_assigned_from_first_client_booking',
        ]));
        saved.bookingFlags = nextFlags;
        saved = await saved.save();
      }
    }

    res.status(201).json(saved);
    sendAppointmentSMS(saved.status === 'pending' ? 'pending' : 'confirmation', saved);
  } catch (err) {
    console.error('❌ public createAppointment failed:', err?.message || err);
    return res.status(err.status || 500).json({
      error: err.status && err.status < 500 ? err.message : 'Server error',
      code: err.code,
    });
  }
};


exports.createAppointmentBatch = async (req, res) => {
  try {
    const rows = Array.isArray(req.body?.appointments) ? req.body.appointments : [];
    if (rows.length < 2) {
      return res.status(400).json({
        error: 'Multiple-service online booking requires at least two service rows. Use normal booking for one service.',
        code: 'MULTI_SERVICE_MINIMUM_NOT_MET',
      });
    }

    // The online limit is per person, not per family batch. Runtime settings may
    // lower the cap to one, but online clients can never exceed two services each.
    const configuredMax = getOnlineServiceLimit(await getRuntimeNumber('booking.online.maxServicesPerVisit', 2));
    const maxServicesPerClient = Math.min(configuredMax, 2);

    rows.forEach((row, index) => validatePublicAppointmentRow(row, index + 1));

    const distinctClientIds = Array.from(new Set(rows.map((row) => String(row.clientId || '').trim()).filter(Boolean)));
    const isFamilyBooking = distinctClientIds.length > 1;
    const rowsByClient = new Map();
    for (const row of rows) {
      const clientId = String(row.clientId || '').trim();
      const clientRows = rowsByClient.get(clientId) || [];
      clientRows.push(row);
      rowsByClient.set(clientId, clientRows);
    }

    for (const [clientId, clientRows] of rowsByClient.entries()) {
      if (clientRows.length > maxServicesPerClient) {
        return res.status(403).json({
          error: `Each client may book a maximum of ${maxServicesPerClient} service${maxServicesPerClient === 1 ? '' : 's'} online.`,
          code: 'ONLINE_SERVICE_LIMIT_EXCEEDED',
          clientId,
          maxOnlineServicesPerClient: maxServicesPerClient,
        });
      }
    }

    if (isFamilyBooking) {
      const ownerClientId = String(req.body?.bookingOwnerClientId || '').trim();
      const ownerPhone = phone10(req.body?.bookingOwnerPhone || '');
      const owner = ownerClientId
        ? await Client.findById(ownerClientId).select('phone familyLinks').lean()
        : null;
      const allowedIds = new Set([
        ownerClientId,
        ...((owner?.familyLinks || []).map((link) => String(link.clientId || '')).filter(Boolean)),
      ]);
      const verified = !!owner && ownerPhone.length === 10 && phone10(owner.phone) === ownerPhone;
      if (!verified || distinctClientIds.some((id) => !allowedIds.has(id))) {
        return res.status(403).json({
          error: 'Every person in this online family booking must be linked to the signed-in family account.',
          code: 'ONLINE_FAMILY_LINK_REQUIRED',
        });
      }
    }

    // Multiple services belonging to the same person form one continuous visit:
    // they must stay on one date and with one stylist. Different family members
    // may use different stylists, and independent family bookings may use different dates.
    for (const clientRows of rowsByClient.values()) {
      const clientDate = String(clientRows[0]?.date || '').trim();
      const clientWorkerId = String(clientRows[0]?.workerId || '').trim();
      for (const row of clientRows) {
        if (String(row.date || '').trim() !== clientDate) {
          return res.status(400).json({
            error: 'A client’s services in one online visit must use the same date.',
            code: 'ONLINE_CLIENT_ONE_DATE_REQUIRED',
          });
        }
        if (clientWorkerId && String(row.workerId || '').trim() && String(row.workerId || '').trim() !== clientWorkerId) {
          return res.status(400).json({
            error: 'A client’s services in one online visit must use the same stylist.',
            code: 'ONLINE_CLIENT_ONE_WORKER_REQUIRED',
          });
        }
      }
    }

    for (const date of new Set(rows.map((row) => String(row.date || '').trim()))) {
      await assertOnlineBookingAllowedForDate(date);
    }

    const preparedPayloads = [];
    for (let i = 0; i < rows.length; i += 1) {
      const payload = await preparePublicAppointmentPayload(await applyPublicStylistBookingRules({
        ...allowedPublicUpdate(rows[i] || {}),
        // Multi-service online requests follow the same approval workflow as
        // single-service online requests: staff must confirm them in Admin.
        status: 'pending',
        bookingFlags: Array.from(new Set([
          ...((rows[i]?.bookingFlags || rows[i]?.flags || []).filter(Boolean)),
          isFamilyBooking ? 'online_family_booking' : 'online_multi_service_visit',
        ])),
      }));
      preparedPayloads.push(payload);
    }

    const savedAppointments = await saveAppointmentsWithIntegrity(preparedPayloads, { publicMessage: true });
    if (savedAppointments[0]) {
      savedAppointments[0] = await claimAndApplyWelcomeOffer(savedAppointments[0]);
    }

    for (const saved of savedAppointments) {
      if (!saved.clientDefaultStylistAtBooking && saved.workerId) {
        const assignedFromFirstBooking = await assignDefaultStylistFromFirstClientBooking({
          clientId: saved.clientId,
          workerId: saved.workerId,
        });
        if (assignedFromFirstBooking) {
          saved.bookingFlags = Array.from(new Set([
            ...(saved.bookingFlags || []),
            'default_stylist_assigned_from_first_client_booking',
          ]));
          await saved.save();
        }
      }
    }

    const populated = await Appointment.find({ _id: { $in: savedAppointments.map((doc) => doc._id) } })
      .populate('clientId')
      .populate('serviceId')
      .populate('workerId')
      .populate('addOns')
      .sort({ date: 1, time: 1 });

    res.status(201).json({
      appointments: populated,
      count: populated.length,
      mode: isFamilyBooking ? 'online_family_booking' : 'online_multi_service_visit',
    });

    for (const saved of savedAppointments) {
      sendAppointmentSMS(saved.status === 'pending' ? 'pending' : 'confirmation', saved);
    }
  } catch (err) {
    console.error('❌ public createAppointmentBatch failed:', err?.message || err);
    return res.status(err.status || 500).json({
      error: err.status && err.status < 500 ? err.message : 'Server error',
      code: err.code,
      row: err.row,
    });
  }
};

exports.updateAppointment = async (req, res) => {
  try {
    const { id } = req.params;
    const existing = await Appointment.findById(id).lean();
    if (!existing) return res.status(404).json({ message: 'Appointment not found' });

    if (!(await appointmentClientMatches(existing, req.body || {}))) {
      return res.status(403).json({ error: 'This appointment does not belong to the submitted client.' });
    }

    const patch = allowedPublicUpdate(req.body || {});
    if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
      patch.status = normalizePublicStatus(patch.status, existing.status || 'pending');
    }

    let merged = { ...existing, ...patch };
    if (merged.serviceId) {
      merged = await preparePublicAppointmentPayload(merged);
    }
    if (patch.date || patch.time || patch.duration || patch.workerId || patch.serviceId) {
      await assertNoSlotConflicts([merged], { ignoreAppointmentIds: [id], publicMessage: true });
    }

    const updateFields = { ...merged };
    delete updateFields._id;
    delete updateFields.__v;

    const updated = await Appointment.findByIdAndUpdate(id, updateFields, { new: true })
      .populate('clientId')
      .populate('serviceId')
      .populate('workerId')
      .populate('addOns');

    if (!updated) return res.status(404).json({ message: 'Appointment not found' });

    res.json(updated);

    if (Object.prototype.hasOwnProperty.call(patch, 'status')) {
      sendAppointmentSMS(patch.status === 'canceled' ? 'cancellation' : patch.status, updated);
    }
  } catch (err) {
    console.error('❌ public updateAppointment failed:', err?.message || err);
    return res.status(err.status || 500).json({
      error: err.status && err.status < 500 ? err.message : 'Failed to update appointment',
      message: err.status && err.status < 500 ? err.message : 'Failed to update appointment',
      code: err.code,
    });
  }
};

exports.updateAppointmentFromBody = async (req, res) => {
  const id = req.params.id || req.body?._id || req.body?.id;
  if (!id) return res.status(400).json({ error: 'Appointment id is required' });
  req.params.id = id;
  return exports.updateAppointment(req, res);
};

exports.cancelAppointment = async (req, res) => {
  try {
    const existing = await Appointment.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ error: 'Appointment not found' });

    if (!(await appointmentClientMatches(existing, req.body || {}))) {
      return res.status(403).json({ error: 'This appointment does not belong to the submitted client.' });
    }

    const updated = await Appointment.findByIdAndUpdate(
      req.params.id,
      { $set: { status: 'canceled' } },
      { new: true }
    )
      .populate('clientId')
      .populate('serviceId')
      .populate('workerId')
      .populate('addOns');

    if (updated) {
      await restoreWelcomeOfferForCanceledAppointment(updated);
    }

    res.json({ message: 'Appointment canceled', appointment: updated });
    if (updated) sendAppointmentSMS('cancellation', updated);
  } catch (err) {
    console.error('❌ public cancelAppointment failed:', err?.message || err);
    return res.status(500).json({ error: 'Cancel failed' });
  }
};
