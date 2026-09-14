const crypto = require('crypto');
const twilio = require('twilio');
const Appointment = require('../models/appointment');
const AdminNotification = require('../models/adminnotification');
const sendSMS = require('./sendSMS');
const { normalizeUSPhone } = require('./phone');
const { getRuntimeString, getRuntimeBoolean } = require('./runtimeSettings');

const DEFAULT_TTL_SECONDS = 24 * 60 * 60;

function base64url(value) {
  return Buffer.from(value).toString('base64url');
}

function fromBase64url(value) {
  return Buffer.from(String(value || ''), 'base64url').toString('utf8');
}

function approvalSecret() {
  const secret = String(process.env.PENDING_BOOKING_APPROVAL_SECRET || process.env.JWT_SECRET || '').trim();
  if (!secret) throw new Error('PENDING_BOOKING_APPROVAL_SECRET or JWT_SECRET is required');
  return secret;
}

function signPayload(encodedPayload) {
  return crypto.createHmac('sha256', approvalSecret()).update(encodedPayload).digest('base64url');
}

function createApprovalToken(appointmentId, ttlSeconds = DEFAULT_TTL_SECONDS) {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    v: 1,
    purpose: 'pending-booking-confirm',
    appointmentId: String(appointmentId),
    iat: now,
    exp: now + Math.max(300, Number(ttlSeconds) || DEFAULT_TTL_SECONDS),
  };
  const encoded = base64url(JSON.stringify(payload));
  return `${encoded}.${signPayload(encoded)}`;
}

function verifyApprovalToken(token) {
  const [encoded, suppliedSignature] = String(token || '').split('.');
  if (!encoded || !suppliedSignature) {
    const err = new Error('Invalid approval link.');
    err.status = 400;
    err.code = 'APPROVAL_TOKEN_INVALID';
    throw err;
  }

  const expected = signPayload(encoded);
  const a = Buffer.from(suppliedSignature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    const err = new Error('Invalid approval link.');
    err.status = 400;
    err.code = 'APPROVAL_TOKEN_INVALID';
    throw err;
  }

  let payload;
  try {
    payload = JSON.parse(fromBase64url(encoded));
  } catch (_) {
    const err = new Error('Invalid approval link.');
    err.status = 400;
    err.code = 'APPROVAL_TOKEN_INVALID';
    throw err;
  }

  if (payload?.purpose !== 'pending-booking-confirm' || !payload?.appointmentId) {
    const err = new Error('Invalid approval link.');
    err.status = 400;
    err.code = 'APPROVAL_TOKEN_INVALID';
    throw err;
  }
  if (Number(payload.exp || 0) <= Math.floor(Date.now() / 1000)) {
    const err = new Error('This approval link has expired.');
    err.status = 410;
    err.code = 'APPROVAL_TOKEN_EXPIRED';
    throw err;
  }
  return payload;
}

function splitPhones(value) {
  return Array.from(new Set(
    String(value || '')
      .split(/[;,\s]+/)
      .map((phone) => normalizeUSPhone(phone))
      .filter(Boolean)
  ));
}

async function configuredAdminPhones() {
  const configured = await getRuntimeString(
    'booking.pendingAdminSms.recipients',
    process.env.PENDING_BOOKING_ADMIN_PHONES || ''
  );
  return splitPhones(configured);
}

function publicBookingAppBase() {
  const configured = String(process.env.PUBLIC_BOOKING_APP_URL || '').trim();
  if (configured) return configured.replace(/\/$/, '');
  return 'https://rakiesalon.com/booking';
}

function formatDate(dateValue) {
  const raw = String(dateValue || '').trim();
  const dt = new Date(`${raw}T12:00:00`);
  if (Number.isNaN(dt.getTime())) return raw;
  return new Intl.DateTimeFormat('en-US', {
    month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/New_York',
  }).format(dt);
}

function formatTime(timeValue) {
  const raw = String(timeValue || '').trim();
  const match = raw.match(/^(\d{1,2}):(\d{2})/);
  if (!match) return raw;
  let hour = Number(match[1]);
  const minute = match[2];
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${suffix}`;
}

async function loadApprovalAppointment(id) {
  return Appointment.findById(id)
    .populate('clientId', 'firstName lastName phone')
    .populate('serviceId', 'name')
    .populate('workerId', 'displayName firstName lastName')
    .lean();
}

function approvalSummary(appointment) {
  if (!appointment) return null;
  const clientName = [appointment?.clientId?.firstName, appointment?.clientId?.lastName].filter(Boolean).join(' ').trim() || 'Client';
  const serviceName = appointment?.serviceId?.name || appointment?.service || 'Service';
  const workerName = appointment?.workerName || appointment?.workerId?.displayName || [appointment?.workerId?.firstName, appointment?.workerId?.lastName].filter(Boolean).join(' ').trim() || '';
  return {
    appointmentId: String(appointment._id || ''),
    status: String(appointment.status || ''),
    clientName,
    serviceName,
    workerName,
    date: appointment.date || '',
    dateLabel: formatDate(appointment.date),
    time: appointment.time || '',
    timeLabel: formatTime(appointment.time),
  };
}

async function sendRawSms(to, body) {
  const sid = process.env.TWILIO_SID || process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH || process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE || process.env.TWILIO_FROM;
  if (!sid || !auth || !from) throw new Error('Twilio credentials are not configured');
  const client = twilio(sid, auth);
  return client.messages.create({ to, from, body });
}

async function createAdminNotification(appointment, approvalUrl) {
  const summary = approvalSummary(appointment);
  if (!summary) return null;
  return AdminNotification.create({
    type: 'pending_booking_request',
    severity: 'warning',
    title: 'New online booking awaiting confirmation',
    message: `${summary.clientName} requested ${summary.serviceName} for ${summary.dateLabel} at ${summary.timeLabel}.`,
    clientId: appointment?.clientId?._id || appointment?.clientId || null,
    toWorkerId: appointment?.workerId?._id || appointment?.workerId || null,
    metadata: {
      appointmentId: summary.appointmentId,
      approvalUrl,
      date: summary.date,
      time: summary.time,
      serviceName: summary.serviceName,
      clientName: summary.clientName,
    },
  });
}

async function notifyPendingBookingAdmins(appointmentDoc) {
  const enabled = await getRuntimeBoolean('booking.pendingAdminSms.enabled', true);
  const appointmentId = appointmentDoc?._id || appointmentDoc;
  if (!appointmentId) return { sent: 0, skipped: 'missing_appointment' };

  const appointment = await loadApprovalAppointment(appointmentId);
  if (!appointment || String(appointment.status || '').toLowerCase() !== 'pending') {
    return { sent: 0, skipped: 'not_pending' };
  }

  const ttlHours = Number(await getRuntimeString('booking.pendingAdminSms.tokenHours', '24')) || 24;
  const token = createApprovalToken(appointment._id, ttlHours * 60 * 60);
  const approvalUrl = `${publicBookingAppBase()}/approve/${encodeURIComponent(token)}`;
  const summary = approvalSummary(appointment);

  await createAdminNotification(appointment, approvalUrl).catch((err) => {
    console.error('[pending-booking] admin notification create failed:', err?.message || err);
  });

  if (!enabled) return { sent: 0, skipped: 'disabled', approvalUrl };
  const recipients = await configuredAdminPhones();
  if (!recipients.length) {
    console.warn('[pending-booking] No admin SMS recipients configured. Set PENDING_BOOKING_ADMIN_PHONES or booking.pendingAdminSms.recipients.');
    return { sent: 0, skipped: 'no_recipients', approvalUrl };
  }

  const body = [
    'New Booking Request',
    summary.clientName,
    summary.serviceName,
    `${summary.dateLabel} at ${summary.timeLabel}`,
    summary.workerName ? `Stylist: ${summary.workerName}` : '',
    `Review & Confirm: ${approvalUrl}`,
  ].filter(Boolean).join('\n');

  const results = await Promise.allSettled(recipients.map((phone) => sendRawSms(phone, body)));
  const sent = results.filter((result) => result.status === 'fulfilled').length;
  results.forEach((result, index) => {
    if (result.status === 'rejected') {
      console.error(`[pending-booking] admin SMS failed for recipient ${index + 1}:`, result.reason?.message || result.reason);
    }
  });
  return { sent, recipients: recipients.length, approvalUrl };
}

async function getAppointmentForApprovalToken(token) {
  const payload = verifyApprovalToken(token);
  const appointment = await loadApprovalAppointment(payload.appointmentId);
  if (!appointment) {
    const err = new Error('Appointment not found.');
    err.status = 404;
    err.code = 'APPOINTMENT_NOT_FOUND';
    throw err;
  }
  return { appointment, summary: approvalSummary(appointment), payload };
}

async function confirmAppointmentWithToken(token) {
  const payload = verifyApprovalToken(token);
  const updated = await Appointment.findOneAndUpdate(
    { _id: payload.appointmentId, status: 'pending' },
    {
      $set: {
        status: 'booked',
        requiresReceivingStylistConfirmation: false,
        receivingStylistConfirmationStatus: 'accepted',
      },
      $addToSet: { bookingFlags: 'confirmed_from_admin_sms_link' },
    },
    { new: true }
  )
    .populate('clientId')
    .populate('serviceId')
    .populate('workerId');

  if (!updated) {
    const current = await Appointment.findById(payload.appointmentId)
      .populate('clientId', 'firstName lastName phone')
      .populate('serviceId', 'name')
      .populate('workerId', 'displayName firstName lastName')
      .lean();
    if (!current) {
      const err = new Error('Appointment not found.');
      err.status = 404;
      err.code = 'APPOINTMENT_NOT_FOUND';
      throw err;
    }
    const err = new Error(String(current.status || '').toLowerCase() === 'booked'
      ? 'This appointment has already been confirmed.'
      : `This appointment is already ${current.status || 'no longer pending'}.`);
    err.status = 409;
    err.code = 'APPOINTMENT_ALREADY_RESOLVED';
    err.currentStatus = current.status;
    throw err;
  }

  const startTime = new Date(`${updated.date}T${updated.time}`);
  setImmediate(() => {
    sendSMS('confirmation', {
      phone: updated?.clientId?.phone,
      client: { firstName: updated?.clientId?.firstName, lastName: updated?.clientId?.lastName },
      service: updated?.serviceId?.name || updated?.service,
      workerName: updated?.workerName || updated?.workerId?.displayName || '',
      startTime,
      ...(updated.toObject?.() || updated),
    }).catch((err) => console.error('[pending-booking] client confirmation SMS failed:', err?.message || err));
  });

  AdminNotification.create({
    type: 'pending_booking_confirmed_from_sms',
    severity: 'success',
    title: 'Booking confirmed from SMS approval link',
    message: `${[updated?.clientId?.firstName, updated?.clientId?.lastName].filter(Boolean).join(' ').trim() || 'Client'} appointment confirmed.`,
    clientId: updated?.clientId?._id || updated?.clientId || null,
    toWorkerId: updated?.workerId?._id || updated?.workerId || null,
    metadata: { appointmentId: String(updated._id), source: 'admin_sms_approval' },
  }).catch((err) => console.error('[pending-booking] confirmation admin notification failed:', err?.message || err));

  return { appointment: updated, summary: approvalSummary(updated.toObject?.() || updated) };
}

module.exports = {
  createApprovalToken,
  verifyApprovalToken,
  notifyPendingBookingAdmins,
  getAppointmentForApprovalToken,
  confirmAppointmentWithToken,
};
