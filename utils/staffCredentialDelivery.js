require('dotenv').config();
const crypto = require('crypto');
const nodemailer = require('nodemailer');
const twilio = require('twilio');
const { normalizeUSPhone } = require('./phone');
const { getRuntimeString } = require('./runtimeSettings');

function makeToken() {
  return crypto.randomBytes(32).toString('base64url');
}

function tokenHash(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function addMinutes(date, minutes) {
  return new Date(date.getTime() + Number(minutes || 0) * 60 * 1000);
}

function trimTrailingSlash(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

async function getStaffBaseUrl() {
  const runtime = await getRuntimeString('staff.portalBaseUrl', process.env.STAFF_PORTAL_BASE_URL || '');
  const env = runtime || process.env.PUBLIC_STAFF_BASE_URL || process.env.FRONTEND_BASE_URL || process.env.PUBLIC_BOOKING_URL || '';
  let base = trimTrailingSlash(env);

  if (!base) base = 'https://rakiesalon.com/booking';
  if (/rakiesalon\.com\/?$/i.test(base)) base = `${base}/booking`;
  if (!/\/booking$/i.test(base) && !/localhost:\d+$/i.test(base)) {
    // Production staff routes live under the booking React app.
    base = `${base}/booking`;
  }
  return trimTrailingSlash(base);
}

async function makeCredentialUrl(kind, token) {
  const base = await getStaffBaseUrl();
  const route = kind === 'invite' ? '/admin/set-password' : '/admin/reset-password';
  return `${base}${route}?token=${encodeURIComponent(token)}`;
}

function makeTransporter() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.EMAIL_USER || process.env.SMTP_USER;
  const pass = process.env.EMAIL_PASS || process.env.SMTP_PASS;
  if (!user || !pass) return null;

  if (host) {
    return nodemailer.createTransport({
      host,
      port,
      secure: String(process.env.SMTP_SECURE || '').toLowerCase() === 'true' || port === 465,
      auth: { user, pass },
    });
  }

  return nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: { user, pass },
  });
}

function emailFrom() {
  const user = process.env.EMAIL_USER || process.env.SMTP_USER || 'no-reply@rakiesalon.com';
  return process.env.EMAIL_FROM || `"Rakie Salon" <${user}>`;
}

function staffDisplayName(worker, admin) {
  return worker?.displayName || [worker?.firstName, worker?.lastName].filter(Boolean).join(' ').trim() || admin?.email || 'there';
}

function inviteEmail({ worker, admin, url, expiresHours }) {
  const name = staffDisplayName(worker, admin);
  const username = admin.email;
  const subject = 'Create your Rakie Salon staff password';
  const text = [
    `Hi ${name},`,
    '',
    'You have been invited to the Rakie Salon Staff Portal.',
    '',
    `Username: ${username}`,
    '',
    `Create your password using this secure link: ${url}`,
    '',
    `This link expires in ${expiresHours} hours.`,
    '',
    'If you did not expect this invitation, please contact Rakie Salon.',
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#222">
      <h2>Welcome to Rakie Salon Staff Portal</h2>
      <p>Hi ${name},</p>
      <p>You have been invited to the Rakie Salon Staff Portal.</p>
      <p><strong>Username:</strong> ${username}</p>
      <p><a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 14px;border-radius:6px;text-decoration:none">Create Password</a></p>
      <p>This link expires in ${expiresHours} hours.</p>
      <p style="font-size:12px;color:#666">If the button does not work, copy and paste this link into your browser:<br/>${url}</p>
    </div>`;
  return { subject, text, html };
}

function resetEmail({ worker, admin, url, expiresMinutes }) {
  const name = staffDisplayName(worker, admin);
  const username = admin.email;
  const subject = 'Reset your Rakie Salon staff password';
  const text = [
    `Hi ${name},`,
    '',
    'A password reset was requested for your Rakie Salon Staff Portal account.',
    '',
    `Username: ${username}`,
    '',
    `Reset your password using this secure link: ${url}`,
    '',
    `This link expires in ${expiresMinutes} minutes.`,
    '',
    'If you did not request this, you can ignore this message or contact Rakie Salon.',
  ].join('\n');
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#222">
      <h2>Reset your Rakie Salon staff password</h2>
      <p>Hi ${name},</p>
      <p>A password reset was requested for your Rakie Salon Staff Portal account.</p>
      <p><strong>Username:</strong> ${username}</p>
      <p><a href="${url}" style="display:inline-block;background:#2563eb;color:#fff;padding:10px 14px;border-radius:6px;text-decoration:none">Reset Password</a></p>
      <p>This link expires in ${expiresMinutes} minutes.</p>
      <p style="font-size:12px;color:#666">If the button does not work, copy and paste this link into your browser:<br/>${url}</p>
    </div>`;
  return { subject, text, html };
}

async function sendCredentialEmail({ kind, worker, admin, url, expiresHours = 48, expiresMinutes = 60 }) {
  const transporter = makeTransporter();
  const to = admin?.email;
  if (!to) return { channel: 'email', status: 'skipped', reason: 'missing_email' };

  const mail = kind === 'invite'
    ? inviteEmail({ worker, admin, url, expiresHours })
    : resetEmail({ worker, admin, url, expiresMinutes });

  if (!transporter) {
    console.log(`[staffCredentialDelivery] ${kind} email dev_logged for ${to}: ${url}`);
    return { channel: 'email', status: 'dev_logged', to, url };
  }

  try {
    await transporter.sendMail({ from: emailFrom(), to, ...mail });
    return { channel: 'email', status: 'sent', to };
  } catch (err) {
    console.error(`[staffCredentialDelivery] ${kind} email failed:`, err?.message || err);
    return { channel: 'email', status: 'failed', to, error: err?.message || String(err) };
  }
}

function credentialSmsText({ kind, admin, url }) {
  const username = admin?.email || 'your email';
  if (kind === 'invite') {
    return `Rakie Salon staff access: username ${username}. Create your password: ${url}`;
  }
  return `Rakie Salon staff password reset: username ${username}. Reset your password: ${url}`;
}

async function sendCredentialSms({ kind, worker, admin, url }) {
  const to = normalizeUSPhone(worker?.phone || '');
  if (!to) return { channel: 'sms', status: 'skipped', reason: 'missing_phone' };

  const sid = process.env.TWILIO_SID || process.env.TWILIO_ACCOUNT_SID;
  const auth = process.env.TWILIO_AUTH || process.env.TWILIO_AUTH_TOKEN;
  const from = process.env.TWILIO_PHONE || process.env.TWILIO_FROM;
  if (!sid || !auth || !from) return { channel: 'sms', status: 'skipped', reason: 'twilio_not_configured', to };

  try {
    const client = twilio(sid, auth);
    await client.messages.create({ from, to, body: credentialSmsText({ kind, admin, url }) });
    return { channel: 'sms', status: 'sent', to };
  } catch (err) {
    console.error(`[staffCredentialDelivery] ${kind} SMS failed:`, err?.message || err);
    return { channel: 'sms', status: 'failed', to, error: err?.message || String(err) };
  }
}

async function deliverCredentialLink({ kind, worker, admin, url, channel = 'email', expiresHours = 48, expiresMinutes = 60 }) {
  const normalized = String(channel || 'email').toLowerCase();
  const results = [];
  if (normalized === 'email' || normalized === 'both') {
    results.push(await sendCredentialEmail({ kind, worker, admin, url, expiresHours, expiresMinutes }));
  }
  if (normalized === 'sms' || normalized === 'both') {
    results.push(await sendCredentialSms({ kind, worker, admin, url }));
  }
  if (normalized === 'none' || results.length === 0) {
    results.push({ channel: normalized || 'none', status: 'not_sent' });
  }
  return results;
}

module.exports = {
  makeToken,
  tokenHash,
  addMinutes,
  makeCredentialUrl,
  deliverCredentialLink,
};
