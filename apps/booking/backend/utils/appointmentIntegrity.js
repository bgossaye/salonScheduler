const mongoose = require('mongoose');
const Appointment = require('../models/appointment');
const { incrementCouponUsage } = require('./promotions');

const ACTIVE_STATUSES = ['booked', 'pending', 'confirmed'];
const CANCELED_STATUSES = ['canceled', 'cancelled', 'cancelation', 'cancellation'];

function parseTimeToMinutes(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;

  const twelveHour = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*([ap]m)$/i);
  if (twelveHour) {
    let hour = Number(twelveHour[1]);
    const minute = Number(twelveHour[2] || 0);
    const suffix = twelveHour[3].toLowerCase();
    if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;
    if (suffix === 'pm' && hour !== 12) hour += 12;
    if (suffix === 'am' && hour === 12) hour = 0;
    return hour * 60 + minute;
  }

  const twentyFourHour = raw.match(/^(\d{1,2}):(\d{2})$/);
  if (twentyFourHour) {
    const hour = Number(twentyFourHour[1]);
    const minute = Number(twentyFourHour[2]);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    return hour * 60 + minute;
  }

  return null;
}

function rowWindow(row = {}) {
  const start = parseTimeToMinutes(row.time);
  const duration = Number(row.duration || 0);
  if (start === null || !Number.isFinite(duration) || duration <= 0) {
    const err = new Error('Appointment time or duration is invalid. Please refresh availability and try again.');
    err.status = 400;
    err.code = 'INVALID_APPOINTMENT_TIME_WINDOW';
    throw err;
  }
  return { start, end: start + duration };
}

function overlaps(a, b) {
  return a.start < b.end && b.start < a.end;
}

function normalizeAppointmentStatus(value) {
  return String(value || 'booked').trim().toLowerCase();
}

function isActiveAppointmentStatus(value) {
  return ACTIVE_STATUSES.includes(normalizeAppointmentStatus(value));
}

function activeStatusFilter() {
  return { $in: ACTIVE_STATUSES };
}

function publicConflictMessage() {
  return 'That time is no longer available. Please choose another time.';
}

async function assertNoSlotConflicts(payloads = [], options = {}) {
  const rows = (Array.isArray(payloads) ? payloads : [payloads]).filter(Boolean);
  const ignoreAppointmentIds = new Set((options.ignoreAppointmentIds || []).map(String).filter(Boolean));
  const session = options.session;

  for (let i = 0; i < rows.length; i += 1) {
    const current = rows[i];
    const currentWorkerId = String(current.workerId || '').trim();
    if (!currentWorkerId || !current.date) continue;
    const currentWindow = rowWindow(current);

    for (let j = i + 1; j < rows.length; j += 1) {
      const other = rows[j];
      if (String(other.workerId || '').trim() !== currentWorkerId || String(other.date || '') !== String(current.date || '')) continue;
      if (overlaps(currentWindow, rowWindow(other))) {
        const err = new Error('Two selected services overlap on the same stylist schedule. Please choose sequential times or call Rakie Salon.');
        err.status = 409;
        err.code = 'INTERNAL_BATCH_SLOT_OVERLAP';
        err.row = j + 1;
        throw err;
      }
    }
  }

  for (let i = 0; i < rows.length; i += 1) {
    const row = rows[i];
    const workerId = String(row.workerId || '').trim();
    if (!workerId || !row.date) continue;
    const candidate = rowWindow(row);

    const query = {
      workerId,
      date: row.date,
      status: activeStatusFilter(),
    };
    if (ignoreAppointmentIds.size) {
      query._id = { $nin: Array.from(ignoreAppointmentIds).filter((id) => mongoose.Types.ObjectId.isValid(id)) };
    }

    const existingRows = await Appointment.find(query)
      .select('_id time duration status clientId service workerId date')
      .session(session || null)
      .lean();

    const conflicting = existingRows.find((existing) => overlaps(candidate, rowWindow(existing)));
    if (conflicting) {
      const err = new Error(options.publicMessage ? publicConflictMessage() : 'This stylist already has an appointment during that time. Please choose another time.');
      err.status = 409;
      err.code = 'APPOINTMENT_SLOT_CONFLICT';
      err.row = i + 1;
      err.conflictingAppointmentId = String(conflicting._id || '');
      throw err;
    }
  }
}

async function saveAppointmentsWithIntegrity(preparedPayloads = [], options = {}) {
  const rows = Array.isArray(preparedPayloads) ? preparedPayloads : [preparedPayloads];
  const session = await mongoose.startSession();
  let saved = [];

  try {
    await session.withTransaction(async () => {
      await assertNoSlotConflicts(rows, { ...options, session });
      saved = [];
      for (const payload of rows) {
        const docs = await Appointment.create([payload], { session });
        if (docs[0]?.appliedPromotion?.source === 'coupon') {
          await incrementCouponUsage(docs[0].appliedPromotion, { session });
        }
        saved.push(docs[0]);
      }
    });
    return saved;
  } catch (err) {
    if (!/Transaction numbers are only allowed|replica set|Transaction.*not supported/i.test(String(err?.message || err))) {
      throw err;
    }

    const createdIds = [];
    const incrementedPromotions = [];
    try {
      await assertNoSlotConflicts(rows, options);
      saved = [];
      for (const payload of rows) {
        const doc = await new Appointment(payload).save();
        createdIds.push(doc._id);
        if (doc.appliedPromotion?.source === 'coupon') {
          await incrementCouponUsage(doc.appliedPromotion);
          incrementedPromotions.push(doc.appliedPromotion);
        }
        saved.push(doc);
      }
      return saved;
    } catch (fallbackErr) {
      if (createdIds.length) await Appointment.deleteMany({ _id: { $in: createdIds } }).catch(() => {});
      // Best effort only: on standalone MongoDB, appointment rollback is stronger than coupon-count rollback.
      throw fallbackErr;
    }
  } finally {
    session.endSession();
  }
}

module.exports = {
  ACTIVE_STATUSES,
  CANCELED_STATUSES,
  parseTimeToMinutes,
  isActiveAppointmentStatus,
  assertNoSlotConflicts,
  saveAppointmentsWithIntegrity,
};
