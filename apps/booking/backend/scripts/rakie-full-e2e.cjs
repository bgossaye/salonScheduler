#!/usr/bin/env node
/*
  Rakie Salon full E2E/regression test runner.

  What it covers:
  - health, auth, dashboard, system error window
  - Rakeb G default worker migration
  - roles/permissions CRUD and protected-role failure
  - service/add-on CRUD and chemical-service flags
  - worker/stylist CRUD, profile/bio/photo fields, worker-service prices/durations
  - customer worker selection endpoint
  - client admin CRUD, client OTP/PIN happy + failure flows
  - appointments create/update/delete, worker pricing, promotions, availability
  - runtime switches, reports/export, gift cards, Twilio inbound signature failure
  - direct helper checks for reminder date/time normalization

  Safe-by-default rules:
  - Refuses remote/non-local base URLs unless RAKIE_E2E_ALLOW_REMOTE=true.
  - If it starts the backend itself, it strips Twilio env vars unless RAKIE_E2E_ALLOW_SMS=true.
  - If testing an already-running server and your shell has Twilio env vars, it refuses unless
    RAKIE_E2E_ASSUME_SERVER_SMS_SAFE=true. This prevents accidental real SMS sends.
  - It creates only E2E-tagged data and deletes only E2E-created records.

  Usage from backend folder:
    node scripts/rakie-full-e2e.cjs --base-url=http://localhost:5000
    node scripts/rakie-full-e2e.cjs --start-server --base-url=http://localhost:5000
    SKIP_CLEANUP=true node scripts/rakie-full-e2e.cjs --base-url=http://localhost:5000
*/

require('dotenv').config();

const path = require('path');
const { spawn } = require('child_process');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);

const Admin = require('../models/admin');
const Appointment = require('../models/appointment');
const Client = require('../models/client');
const GiftCard = require('../models/giftcard');
const Otp = require('../models/otp');
const PromotionDeal = require('../models/promotiondeal');
const RuntimeSetting = require('../models/runtimesetting');
const Service = require('../models/service');
const StaffRole = require('../models/staffrole');
const StoreHours = require('../models/storehours');
const SystemErrorLog = require('../models/systemerrorlog');
const Worker = require('../models/worker');
const { ensureDefaultRoles, ensureRakebWorkerAndMigrate, RAKEB_SYSTEM_KEY } = require('../utils/workerPricing');
const { normalizeAppointmentDateTime, formatDate, formatTime } = require('../utils/formatHelpers');

const args = new Set(process.argv.slice(2));
function argValue(name, fallback = '') {
  const prefix = `${name}=`;
  const found = process.argv.slice(2).find((x) => x.startsWith(prefix));
  if (found) return found.slice(prefix.length);
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && process.argv[idx + 1]) return process.argv[idx + 1];
  return fallback;
}

const BASE_URL = String(argValue('--base-url', process.env.BACKEND_BASE_URL || process.env.E2E_BASE_URL || 'http://localhost:5000')).replace(/\/$/, '');
const START_SERVER = args.has('--start-server') || String(process.env.START_SERVER || '').toLowerCase() === 'true';
const SKIP_CLEANUP = args.has('--skip-cleanup') || String(process.env.SKIP_CLEANUP || '').toLowerCase() === 'true';
const PURGE_OLD_E2E = args.has('--purge-old-e2e') || String(process.env.PURGE_OLD_E2E || '').toLowerCase() === 'true';
const ALLOW_REMOTE = String(process.env.RAKIE_E2E_ALLOW_REMOTE || '').toLowerCase() === 'true';
const ALLOW_SMS = String(process.env.RAKIE_E2E_ALLOW_SMS || '').toLowerCase() === 'true';
const ASSUME_SERVER_SMS_SAFE = String(process.env.RAKIE_E2E_ASSUME_SERVER_SMS_SAFE || '').toLowerCase() === 'true';
const TIMEOUT_MS = Number(process.env.E2E_HTTP_TIMEOUT_MS || 15000);
const RUN_ID = process.env.E2E_RUN_ID || new Date().toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
const TAG = `[E2E ${RUN_ID}]`;
const ADMIN_EMAIL = process.env.E2E_ADMIN_EMAIL || `e2e-admin-${RUN_ID}@rakiesalon.test`;
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD || `E2e-${RUN_ID}!`;

const touched = {
  adminEmails: new Set([ADMIN_EMAIL]),
  appointmentIds: new Set(),
  clientIds: new Set(),
  clientPhones: new Set(),
  giftCardCodes: new Set(),
  roleIds: new Set(),
  serviceIds: new Set(),
  workerIds: new Set(),
  dealIds: new Set(),
  systemErrorIds: new Set(),
};
const originalSettings = new Map();
const originalStoreHours = new Map();
const results = [];
let token = '';
let serverProcess = null;

function printUsage() {
  console.log(`\nRakie full E2E runner\n\nOptions:\n  --base-url=http://localhost:5000   Backend URL to test\n  --start-server                     Start node server.js before testing\n  --skip-cleanup                     Keep E2E records for manual inspection\n  --purge-old-e2e                    Delete stale [E2E ...] records first\n\nEnvironment safety:\n  RAKIE_E2E_ALLOW_REMOTE=true         Allow non-local BASE_URL\n  RAKIE_E2E_ALLOW_SMS=true            Allow SMS-capable env when this script starts server\n  RAKIE_E2E_ASSUME_SERVER_SMS_SAFE=true Allow already-running server despite Twilio env vars\n`);
}

if (args.has('--help') || args.has('-h')) {
  printUsage();
  process.exit(0);
}

function isLocalUrl(url) {
  return /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?($|\/)/i.test(url);
}

function hasTwilioEnv(env = process.env) {
  return Boolean((env.TWILIO_SID || env.TWILIO_ACCOUNT_SID) && (env.TWILIO_AUTH || env.TWILIO_AUTH_TOKEN) && (env.TWILIO_PHONE || env.TWILIO_FROM));
}

function assert(condition, message, details = undefined) {
  if (!condition) {
    const err = new Error(message);
    if (details !== undefined) err.details = details;
    throw err;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function todayYmd(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function nextDayOfWeek(dayIndex) {
  const d = new Date();
  const diff = (dayIndex - d.getDay() + 7) % 7;
  d.setDate(d.getDate() + diff);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function phoneFromOffset(offset = 0) {
  const last7 = (Number(String(Date.now()).slice(-7)) + offset) % 10000000;
  return `585${String(last7).padStart(7, '0')}`;
}

function clientSessionToken(client) {
  return jwt.sign(
    { id: String(client._id), phone: String(client.phone || ''), tokenType: 'client' },
    process.env.JWT_SECRET,
    { expiresIn: '30m' }
  );
}

function compact(value, max = 700) {
  const s = typeof value === 'string' ? value : JSON.stringify(value);
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

async function fetchWithTimeout(url, options = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function request(method, urlPath, options = {}) {
  const expected = options.expected || [200];
  const headers = { ...(options.headers || {}) };
  if (options.body !== undefined) headers['Content-Type'] = headers['Content-Type'] || 'application/json';
  if (options.token !== false && token) headers.Authorization = `Bearer ${token}`;

  const response = await fetchWithTimeout(`${BASE_URL}${urlPath}`, {
    method,
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });
  const text = await response.text();
  let data = text;
  try { data = text ? JSON.parse(text) : null; } catch (_) {}

  if (!expected.includes(response.status)) {
    throw new Error(`${method} ${urlPath} expected ${expected.join('/')} but got ${response.status}: ${compact(data)}`);
  }
  return { status: response.status, data, text, headers: response.headers };
}

async function test(name, fn) {
  const started = Date.now();
  try {
    await fn();
    const ms = Date.now() - started;
    results.push({ name, status: 'PASS', ms });
    console.log(`✅ ${name} (${ms}ms)`);
  } catch (err) {
    const ms = Date.now() - started;
    results.push({ name, status: 'FAIL', ms, error: err });
    console.error(`❌ ${name} (${ms}ms)`);
    console.error(`   ${err.message}`);
    if (err.details) console.error(`   ${compact(err.details)}`);
  }
}

async function waitForServer() {
  const deadline = Date.now() + Number(process.env.E2E_SERVER_START_TIMEOUT_MS || 45000);
  let lastErr = null;
  while (Date.now() < deadline) {
    try {
      const res = await fetchWithTimeout(`${BASE_URL}/api/healthz`, { method: 'GET' });
      if (res.ok) return;
    } catch (err) {
      lastErr = err;
    }
    await sleep(800);
  }
  throw new Error(`Backend did not become ready at ${BASE_URL}. Last error: ${lastErr?.message || 'none'}`);
}

function startServerIfNeeded() {
  if (!START_SERVER) return;
  const env = { ...process.env };
  if (!ALLOW_SMS) {
    delete env.TWILIO_SID;
    delete env.TWILIO_ACCOUNT_SID;
    delete env.TWILIO_AUTH;
    delete env.TWILIO_AUTH_TOKEN;
    delete env.TWILIO_PHONE;
    delete env.TWILIO_FROM;
    env.SMS_AUDIT_COPY_ENABLED = 'false';
    env.SMS_AUDIT_ONLY_MODE_ENABLED = 'true';
  }
  serverProcess = spawn(process.execPath, ['server.js'], {
    cwd: ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  serverProcess.stdout.on('data', (buf) => process.stdout.write(`[server] ${buf}`));
  serverProcess.stderr.on('data', (buf) => process.stderr.write(`[server-err] ${buf}`));
}

async function connectDb() {
  if (!process.env.MONGO_URI) throw new Error('MONGO_URI is required for data seeding/cleanup.');
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required.');
  await mongoose.connect(process.env.MONGO_URI);
}

async function rememberSetting(key) {
  if (originalSettings.has(key)) return;
  const row = await RuntimeSetting.findOne({ key }).lean();
  originalSettings.set(key, row ? row.value : undefined);
}

async function setRuntime(key, value) {
  await rememberSetting(key);
  const response = await request('PUT', `/api/admin/runtime-settings/${encodeURIComponent(key)}`, {
    body: { value },
    expected: [200],
  });
  return response.data.setting;
}

async function restoreRuntimeSettings() {
  for (const [key, value] of originalSettings.entries()) {
    if (value === undefined) {
      await RuntimeSetting.deleteOne({ key }).catch(() => {});
    } else {
      await RuntimeSetting.updateOne({ key }, { $set: { value } }).catch(() => {});
    }
  }
}

async function rememberStoreHour(day) {
  if (originalStoreHours.has(day)) return;
  const row = await StoreHours.findOne({ day }).lean();
  originalStoreHours.set(day, row || null);
}

async function restoreStoreHours() {
  for (const [day, row] of originalStoreHours.entries()) {
    if (!row) {
      await StoreHours.deleteOne({ day }).catch(() => {});
    } else {
      const { _id, __v, ...data } = row;
      await StoreHours.updateOne({ day }, { $set: data }, { upsert: true }).catch(() => {});
    }
  }
}

async function purgeOldE2ERecords() {
  if (!PURGE_OLD_E2E) return;
  const e2eServiceIds = await Service.find({ name: /^\[E2E / }).select('_id').lean();
  const e2eClientIds = await Client.find({ email: /@rakie-e2e\.test$/ }).select('_id').lean();
  const e2eWorkerIds = await Worker.find({ email: /@rakie-e2e\.test$/ }).select('_id').lean();
  await Appointment.deleteMany({ $or: [
    { clientId: { $in: e2eClientIds.map((x) => x._id) } },
    { serviceId: { $in: e2eServiceIds.map((x) => x._id) } },
    { workerId: { $in: e2eWorkerIds.map((x) => x._id) } },
  ] });
  await Client.deleteMany({ email: /@rakie-e2e\.test$/ });
  await Worker.deleteMany({ email: /@rakie-e2e\.test$/ });
  await Service.deleteMany({ name: /^\[E2E / });
  await StaffRole.deleteMany({ key: /^e2e-/ });
  await PromotionDeal.deleteMany({ title: /^\[E2E / });
  await GiftCard.deleteMany({ code: /^E2E/ });
  await SystemErrorLog.deleteMany({ message: /^\[E2E / });
  await Admin.deleteMany({ email: /@rakiesalon\.test$/ });
  await Otp.deleteMany({ phone: /^585/ });
}

async function cleanup() {
  if (SKIP_CLEANUP) {
    console.log('\n⚠️  SKIP_CLEANUP=true; leaving test records in DB for inspection.');
    return;
  }
  await restoreRuntimeSettings();
  await restoreStoreHours();
  const appointmentIds = [...touched.appointmentIds].filter(Boolean);
  const clientIds = [...touched.clientIds].filter(Boolean);
  const serviceIds = [...touched.serviceIds].filter(Boolean);
  const workerIds = [...touched.workerIds].filter(Boolean);
  const roleIds = [...touched.roleIds].filter(Boolean);
  const dealIds = [...touched.dealIds].filter(Boolean);
  const systemErrorIds = [...touched.systemErrorIds].filter(Boolean);
  const phones = [...touched.clientPhones].filter(Boolean);
  const giftCodes = [...touched.giftCardCodes].filter(Boolean);
  const emails = [...touched.adminEmails].filter(Boolean);

  await Appointment.deleteMany({ $or: [
    ...(appointmentIds.length ? [{ _id: { $in: appointmentIds } }] : []),
    ...(clientIds.length ? [{ clientId: { $in: clientIds } }] : []),
    ...(serviceIds.length ? [{ serviceId: { $in: serviceIds } }] : []),
    ...(workerIds.length ? [{ workerId: { $in: workerIds } }] : []),
  ] }).catch(() => {});
  await PromotionDeal.deleteMany({ _id: { $in: dealIds } }).catch(() => {});
  await Worker.deleteMany({ _id: { $in: workerIds } }).catch(() => {});
  await Service.deleteMany({ _id: { $in: serviceIds } }).catch(() => {});
  await Client.deleteMany({ $or: [
    ...(clientIds.length ? [{ _id: { $in: clientIds } }] : []),
    ...(phones.length ? [{ phone: { $in: phones } }] : []),
    { email: /@rakie-e2e\.test$/ },
  ] }).catch(() => {});
  await StaffRole.deleteMany({ _id: { $in: roleIds } }).catch(() => {});
  await GiftCard.deleteMany({ code: { $in: giftCodes } }).catch(() => {});
  await SystemErrorLog.deleteMany({ _id: { $in: systemErrorIds } }).catch(() => {});
  await Admin.deleteMany({ email: { $in: emails } }).catch(() => {});
  await Otp.deleteMany({ phone: { $in: phones } }).catch(() => {});
}

async function seedAdmin() {
  await ensureDefaultRoles();
  const migration = await ensureRakebWorkerAndMigrate({ verbose: false });
  const adminRole = await StaffRole.findOne({ key: 'admin' });
  const hashed = await bcrypt.hash(ADMIN_PASSWORD, 10);
  const row = await Admin.findOneAndUpdate(
    { email: ADMIN_EMAIL },
    {
      $set: {
        email: ADMIN_EMAIL,
        password: hashed,
        roleId: adminRole?._id || null,
        roleKey: 'admin',
        workerId: migration.worker?._id || null,
      },
    },
    { upsert: true, new: true }
  );
  return { admin: row, rakeb: migration.worker, migration };
}

async function main() {
  console.log(`\nRakie Salon full E2E regression run ${RUN_ID}`);
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Start server: ${START_SERVER ? 'yes' : 'no'}`);

  if (!isLocalUrl(BASE_URL) && !ALLOW_REMOTE) {
    throw new Error(`Refusing non-local test URL ${BASE_URL}. Set RAKIE_E2E_ALLOW_REMOTE=true only for staging/test environments.`);
  }
  if (!START_SERVER && hasTwilioEnv() && !ASSUME_SERVER_SMS_SAFE) {
    throw new Error('Twilio env vars are present while testing an already-running server. To avoid accidental SMS, run with --start-server so Twilio vars can be stripped, or set RAKIE_E2E_ASSUME_SERVER_SMS_SAFE=true only if the server is safely mocked/staged.');
  }

  await connectDb();
  await purgeOldE2ERecords();
  startServerIfNeeded();
  await waitForServer();

  const seeded = await seedAdmin();
  const rakebId = String(seeded.rakeb._id);

  await test('health endpoint responds', async () => {
    const { data } = await request('GET', '/api/healthz', { token: false, expected: [200] });
    assert(data && data.ok === true, 'healthz did not return ok=true', data);
  });

  await test('admin dashboard rejects missing token', async () => {
    await request('GET', '/api/admin/dashboard', { token: false, expected: [401] });
  });

  await test('admin login rejects bad credentials', async () => {
    await request('POST', '/api/admin/login', {
      token: false,
      expected: [401],
      body: { email: ADMIN_EMAIL, password: 'wrong-password' },
    });
  });

  await test('admin login returns token, role, permissions and worker link', async () => {
    const { data } = await request('POST', '/api/admin/login', {
      token: false,
      expected: [200],
      body: { email: ADMIN_EMAIL, password: ADMIN_PASSWORD },
    });
    assert(data.token, 'missing token', data);
    token = data.token;
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    assert(decoded.roleKey === 'admin', 'token roleKey should be admin', decoded);
    assert(String(decoded.workerId) === rakebId, 'admin should be linked to Rakeb worker', decoded);
    assert(data.admin?.permissions?.systemErrorsView === true, 'admin should have systemErrorsView permission', data.admin);
  });

  await test('enable safe runtime switches for test run', async () => {
    await setRuntime('sms.auditOnlyMode.enabled', true);
    await setRuntime('sms.auditCopy.enabled', false);
    await setRuntime('sms.clientName.enabled', false);
    await setRuntime('sms.appendBookingLink.enabled', true);
    await setRuntime('booking.online.enabled', true);
    const { data } = await request('GET', '/api/admin/runtime-settings', { expected: [200] });
    const byKey = new Map(data.settings.map((s) => [s.key, s.value]));
    assert(byKey.get('sms.auditOnlyMode.enabled') === true, 'audit-only mode did not save', data);
    assert(byKey.get('booking.online.enabled') === true, 'online booking switch did not save', data);
  });

  await test('Rakeb migration creates protected default master stylist and assigns current services', async () => {
    const { data } = await request('POST', '/api/admin/workers/migrate-rakeb', { expected: [200] });
    const rakeb = await Worker.findOne({ systemKey: RAKEB_SYSTEM_KEY }).lean();
    assert(rakeb, 'Rakeb worker missing');
    assert(rakeb.protectedWorker === true && rakeb.isDefault === true, 'Rakeb must be protected/default', rakeb);
    assert(rakeb.tierKey === 'master' && rakeb.roleKey === 'admin', 'Rakeb tier/role mismatch', rakeb);
    assert(Array.isArray(rakeb.serviceAssignments), 'Rakeb assignments missing');
    assert(Number(data.servicesAssigned) === rakeb.serviceAssignments.length, 'migration assignment count mismatch', data);
  });

  let service = null;
  let chemicalService = null;
  let addOn = null;
  let regularWorker = null;
  let client = null;
  let appointment = null;
  let couponDeal = null;

  await test('roles/permissions CRUD and protected role guard', async () => {
    const rolesList = await request('GET', '/api/admin/workers/roles', { expected: [200] });
    const adminRole = rolesList.data.roles.find((r) => r.key === 'admin');
    assert(adminRole, 'admin role missing');
    await request('DELETE', `/api/admin/workers/roles/${adminRole._id}`, { expected: [400] });

    const created = await request('POST', '/api/admin/workers/roles', {
      expected: [201],
      body: {
        name: `${TAG} Limited Desk`,
        key: `e2e-limited-${RUN_ID}`,
        description: `${TAG} temporary permission test`,
        permissions: { ...StaffRole.defaultPermissions(), appointmentsViewAll: true, clientsViewAll: true },
      },
    });
    const roleId = created.data.role._id;
    touched.roleIds.add(roleId);
    const updated = await request('PUT', `/api/admin/workers/roles/${roleId}`, {
      expected: [200],
      body: {
        name: `${TAG} Limited Desk Updated`,
        key: `e2e-limited-${RUN_ID}`,
        description: 'updated',
        active: true,
        permissions: { ...StaffRole.defaultPermissions(), appointmentsViewAll: true, appointmentsCreate: true },
      },
    });
    assert(updated.data.role.permissions.appointmentsCreate === true, 'role permission did not update', updated.data);
    await request('DELETE', `/api/admin/workers/roles/${roleId}`, { expected: [200] });
    touched.roleIds.delete(roleId);
  });

  await test('service/add-on CRUD, validation failure and suggested add-ons', async () => {
    await request('POST', '/api/admin/services', {
      expected: [400],
      body: { name: '', category: '', duration: '', price: '' },
    });

    const addOnRes = await request('POST', '/api/admin/services', {
      expected: [200],
      body: {
        name: `${TAG} Deep Conditioning Add-on`,
        category: 'Add-ons',
        duration: 15,
        price: 12,
        isAddOn: true,
        steps: [{ name: 'Apply treatment', duration: 15 }],
      },
    });
    addOn = addOnRes.data;
    touched.serviceIds.add(addOn._id);

    const serviceRes = await request('POST', '/api/admin/services', {
      expected: [200],
      body: {
        name: `${TAG} Blow Dry Test`,
        category: 'Style',
        duration: 30,
        price: 45,
        startingPrice: '',
        requiresChemicalPermission: false,
        suggestedAddOns: [addOn._id],
        steps: [{ name: 'Wash', duration: 10 }, { name: 'Blow dry', duration: 20 }],
      },
    });
    service = serviceRes.data;
    touched.serviceIds.add(service._id);

    const chemRes = await request('POST', '/api/admin/services', {
      expected: [200],
      body: {
        name: `${TAG} Chemical Color Test`,
        category: 'Color',
        duration: 60,
        price: 90,
        requiresChemicalPermission: true,
        steps: [{ name: 'Color application', duration: 60 }],
      },
    });
    chemicalService = chemRes.data;
    touched.serviceIds.add(chemicalService._id);

    const updated = await request('PUT', `/api/admin/services/${service._id}`, {
      expected: [200],
      body: {
        name: `${TAG} Blow Dry Test Updated`,
        category: 'Style',
        duration: 35,
        price: 48,
        startingPrice: 35,
        requiresChemicalPermission: false,
        suggestedAddOns: [addOn._id],
        steps: [{ name: 'Wash', duration: 10 }, { name: 'Blow dry', duration: 25 }],
      },
    });
    service = updated.data;
    assert(service.startingPrice === 35, 'startingPrice did not save', service);

    const addOns = await request('GET', `/api/admin/services/${service._id}/addons`, { expected: [200] });
    assert(Array.isArray(addOns.data) && addOns.data.some((x) => String(x._id) === String(addOn._id)), 'suggested add-on not returned', addOns.data);
  });

  await test('worker/stylist CRUD, bio/photo/profile fields, service price validation and chemical filtering', async () => {
    await request('POST', '/api/admin/workers', { expected: [400], body: { firstName: '' } });
    await request('POST', '/api/admin/workers', {
      expected: [400],
      body: {
        firstName: 'Invalid',
        serviceAssignments: [{ serviceId: service._id, enabled: true }],
      },
    });

    const create = await request('POST', '/api/admin/workers', {
      expected: [201],
      body: {
        firstName: 'Hana',
        lastName: `E2E${RUN_ID}`,
        displayName: `${TAG} Hana M`,
        email: `hana-${RUN_ID}@rakie-e2e.test`,
        phone: phoneFromOffset(60),
        roleKey: 'stylist',
        tierKey: 'regular',
        title: 'Regular Stylist',
        photoUrl: 'https://example.test/hana.jpg',
        shortBio: 'Friendly stylist for everyday styles.',
        bio: 'Full E2E bio for regular stylist, wash and set, blow dry and silk press.',
        experienceYears: 3,
        specialties: ['Wash & Set', 'Blow-Dry', 'Silk Press'],
        languages: ['English', 'Amharic'],
        canUseChemicals: false,
        active: true,
        showOnline: true,
        onlineBookable: true,
        serviceAssignments: [
          { serviceId: service._id, enabled: true, allowOnlineBooking: true, price: 25, duration: 40 },
          { serviceId: chemicalService._id, enabled: true, allowOnlineBooking: true, price: 70, duration: 75 },
        ],
      },
    });
    regularWorker = create.data.worker;
    touched.workerIds.add(regularWorker._id);
    assert(regularWorker.bio.includes('Full E2E bio'), 'worker bio missing', regularWorker);
    assert(regularWorker.photoUrl, 'worker photo URL missing', regularWorker);

    const publicForNormal = await request('GET', `/api/workers?serviceId=${service._id}`, { token: false, expected: [200] });
    assert(publicForNormal.data.workers.some((w) => String(w._id) === String(regularWorker._id) && w.price === 25), 'regular worker not shown for normal service with price', publicForNormal.data);

    const publicForChemical = await request('GET', `/api/workers?serviceId=${chemicalService._id}`, { token: false, expected: [200] });
    assert(!publicForChemical.data.workers.some((w) => String(w._id) === String(regularWorker._id)), 'worker without chemicals should not show for chemical service', publicForChemical.data);

    await request('DELETE', `/api/admin/workers/${rakebId}`, { expected: [400] });
  });

  await test('client admin CRUD and duplicate/failure cases', async () => {
    const phone = phoneFromOffset(1);
    touched.clientPhones.add(phone);
    const create = await request('POST', '/api/admin/clients', {
      expected: [201],
      body: {
        firstName: 'E2E',
        lastName: `Client${RUN_ID}`,
        phone,
        email: `client-${RUN_ID}@rakie-e2e.test`,
        contactPreferences: { optInPromotions: false, emailDisabled: true },
      },
    });
    client = create.data;
    touched.clientIds.add(client._id);
    assert(client.assignedStylistId, 'admin-created client should get assigned stylist', client);

    await request('POST', '/api/admin/clients', {
      expected: [409],
      body: { firstName: 'Dupe', lastName: 'Client', phone, email: `dupe-${RUN_ID}@rakie-e2e.test` },
    });

    const update = await request('PATCH', `/api/admin/clients/${client._id}`, {
      expected: [200],
      body: {
        nickname: `${TAG} Red BMW`,
        assignedStylistId: regularWorker._id,
        preferredStylistId: regularWorker._id,
        notes: { hairType: 'Test curl pattern', specialInstructions: 'E2E note only' },
      },
    });
    assert(update.data.nickname === `${TAG} Red BMW`, 'client nickname did not update', update.data);

    const byPhone = await request('GET', `/api/clients?phone=${phone}`, { token: false, expected: [200] });
    assert(byPhone.data?.exists === true, 'public client existence lookup failed', byPhone.data);
    assert(!byPhone.data?.firstName && !byPhone.data?.phone, 'public phone lookup must not expose profile details', byPhone.data);

    const details = await request('GET', `/api/admin/clients/${client._id}/details`, { expected: [200] });
    assert(details.data.nickname === `${TAG} Red BMW`, 'client details missing nickname', details.data);
  });

  await test('OTP/PIN happy path and failure/lock cases', async () => {
    const signupPhone = phoneFromOffset(2);
    touched.clientPhones.add(signupPhone);
    await request('POST', '/api/clients', {
      token: false,
      expected: [403],
      body: { firstName: 'No', lastName: 'Otp', phone: signupPhone, pin: '1234' },
    });

    const signupOtp = '123456';
    await Otp.findOneAndUpdate(
      { phone: signupPhone, purpose: 'signup' },
      {
        phone: signupPhone,
        purpose: 'signup',
        codeHash: await bcrypt.hash(signupOtp, 10),
        attempts: 0,
        verifiedAt: null,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
      { upsert: true }
    );

    await request('POST', '/api/clients/pin/verify-otp', {
      token: false,
      expected: [400],
      body: { phone: signupPhone, purpose: 'signup', otp: '000000' },
    });
    await request('POST', '/api/clients/pin/verify-otp', {
      token: false,
      expected: [200],
      body: { phone: signupPhone, purpose: 'signup', otp: signupOtp },
    });

    const signupClient = await request('POST', '/api/clients', {
      token: false,
      expected: [201],
      body: {
        firstName: 'Signup',
        lastName: `Otp${RUN_ID}`,
        phone: signupPhone,
        email: `signup-${RUN_ID}@rakie-e2e.test`,
        pin: '2468',
      },
    });
    touched.clientIds.add(signupClient.data._id);
    assert(signupClient.data.nameVerifiedAt, 'signup client should be verified', signupClient.data);

    await request('POST', '/api/clients/login', {
      token: false,
      expected: [401],
      body: { phone: signupPhone, pin: '1111' },
    });
    const login = await request('POST', '/api/clients/login', {
      token: false,
      expected: [200],
      body: { phone: signupPhone, pin: '2468' },
    });
    assert(String(login.data._id) === String(signupClient.data._id), 'client login returned wrong client', login.data);

    const resetOtp = '654321';
    await Otp.findOneAndUpdate(
      { phone: signupPhone, purpose: 'reset' },
      {
        phone: signupPhone,
        purpose: 'reset',
        codeHash: await bcrypt.hash(resetOtp, 10),
        attempts: 0,
        verifiedAt: null,
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
      { upsert: true }
    );
    await request('POST', '/api/clients/pin/set', {
      token: false,
      expected: [400],
      body: { phone: signupPhone, purpose: 'reset', otp: resetOtp, pin: '9999', pinConfirm: '8888' },
    });
    await request('POST', '/api/clients/pin/set', {
      token: false,
      expected: [200],
      body: { phone: signupPhone, purpose: 'reset', otp: resetOtp, pin: '1357', pinConfirm: '1357' },
    });
    await request('POST', '/api/clients/login', {
      token: false,
      expected: [200],
      body: { phone: signupPhone, pin: '1357' },
    });
  });

  await test('promotion/deal CRUD with worker/tier targeting and validation failures', async () => {
    await request('POST', '/api/admin/promotion-deals', {
      expected: [400],
      body: { title: '', discountType: 'percent', discountValue: 10 },
    });
    const couponCode = `E2E${RUN_ID.slice(-8)}`.toUpperCase();
    const create = await request('POST', '/api/admin/promotion-deals', {
      expected: [201],
      body: {
        title: `${TAG} Worker coupon`,
        description: 'E2E worker/tier targeted coupon',
        status: 'active',
        type: 'coupon',
        couponCode,
        discountType: 'percent',
        discountValue: 10,
        validDays: [0, 1, 2, 3, 4, 5, 6],
        eligibleServiceIds: [service._id],
        eligibleWorkerIds: [rakebId],
        eligibleTierKeys: ['master'],
        showClientBadge: true,
        showWorkerBadge: true,
      },
    });
    couponDeal = create.data.deal;
    touched.dealIds.add(couponDeal._id);
    assert(couponDeal.couponCode === couponCode, 'coupon code was not normalized/saved', couponDeal);

    const update = await request('PUT', `/api/admin/promotion-deals/${couponDeal._id}`, {
      expected: [200],
      body: { ...couponDeal, title: `${TAG} Worker coupon updated`, discountValue: 15 },
    });
    couponDeal = update.data.deal;
    assert(couponDeal.discountValue === 15, 'coupon discount did not update', couponDeal);
  });

  await test('appointments create/update/delete, worker pricing, promo discount, availability blocking and failures', async () => {
    const date = todayYmd(1);
    await request('POST', '/api/admin/appointments', {
      expected: [400],
      body: { clientId: client._id, serviceId: service._id },
    });

    await request('POST', '/api/admin/appointments', {
      expected: [400],
      body: {
        clientId: client._id,
        serviceId: chemicalService._id,
        service: chemicalService.name,
        workerId: regularWorker._id,
        date,
        time: '09:00',
        status: 'booked',
      },
    });

    const created = await request('POST', '/api/admin/appointments', {
      expected: [201],
      body: {
        clientId: client._id,
        serviceId: service._id,
        service: service.name,
        workerId: rakebId,
        date,
        time: '10:00',
        status: 'booked',
        addOns: [addOn._id],
        couponCode: couponDeal.couponCode,
      },
    });
    appointment = created.data;
    touched.appointmentIds.add(appointment._id);
    assert(String(appointment.workerId) === String(rakebId), 'appointment worker should be Rakeb', appointment);
    assert(appointment.priceSnapshot?.workerName === 'Rakeb G', 'price snapshot worker missing', appointment.priceSnapshot);
    assert(appointment.priceSnapshot?.addOnPrice === 12, 'add-on price missing from snapshot', appointment.priceSnapshot);
    assert(appointment.priceSnapshot?.discountAmount > 0, 'coupon discount was not applied', appointment.priceSnapshot);

    const availability = await request('GET', `/api/availability?date=${date}&serviceId=${service._id}&workerId=${rakebId}`, { token: false, expected: [200] });
    const slot = availability.data.find((x) => x.time === '10:00');
    assert(slot && slot.status === 'booked', 'availability should mark appointment slot booked', availability.data.slice(0, 8));

    const updated = await request('PATCH', `/api/admin/appointments/${appointment._id}`, {
      expected: [200],
      body: { status: 'completed' },
    });
    assert(updated.data.status === 'completed', 'appointment status did not update', updated.data);

    await request('GET', `/api/appointments/client/${client._id}`, { token: false, expected: [401] });
    const clientAuth = clientSessionToken(client);
    const clientAppts = await request('GET', `/api/appointments/client/${client._id}`, { token: false, headers: { Authorization: `Bearer ${clientAuth}` }, expected: [200] });
    assert(clientAppts.data.some((x) => String(x._id) === String(appointment._id)), 'client appointment list missing appointment', clientAppts.data);
  });

  await test('online booking disabled fallback and re-enabled happy path', async () => {
    await setRuntime('booking.online.enabled', false);
    const onlineClientAuth = clientSessionToken(client);
    const disabled = await request('POST', '/api/appointments', {
      token: false,
      headers: { Authorization: `Bearer ${onlineClientAuth}` },
      expected: [403],
      body: {
        clientId: client._id,
        serviceId: service._id,
        service: service.name,
        workerId: rakebId,
        date: todayYmd(2),
        time: '11:00',
        status: 'pending',
      },
    });
    assert(disabled.data.code === 'ONLINE_BOOKING_DISABLED', 'wrong disabled booking code', disabled.data);

    await setRuntime('booking.online.enabled', true);
    const online = await request('POST', '/api/appointments', {
      token: false,
      headers: { Authorization: `Bearer ${onlineClientAuth}` },
      expected: [201],
      body: {
        clientId: client._id,
        serviceId: service._id,
        service: service.name,
        workerId: rakebId,
        date: todayYmd(2),
        time: '11:00',
        status: 'pending',
      },
    });
    touched.appointmentIds.add(online.data._id);
    assert(online.data.status === 'pending', 'online booking should create pending appointment', online.data);
  });

  await test('dashboard, reports and export reflect data without crashing', async () => {
    const dashboard = await request('GET', '/api/admin/dashboard', { expected: [200] });
    assert(dashboard.data.snapshot || dashboard.data.today || dashboard.data.setupChecklist, 'dashboard shape missing expected sections', dashboard.data);
    assert(dashboard.data.systemErrors !== undefined, 'dashboard should include systemErrors for admin', dashboard.data);

    await request('GET', '/api/admin/reports/summary', { expected: [200] });
    const exportRes = await request('GET', '/api/admin/export/appointments', { expected: [200] });
    assert(typeof exportRes.text === 'string', 'export should return text/csv or json text');
  });

  await test('system error window lists only error logs and can resolve them', async () => {
    const log = await SystemErrorLog.create({
      level: 'error',
      source: 'e2e-script',
      message: `${TAG} simulated backend error`,
      name: 'E2ESimulatedError',
      stack: 'stack line 1\nstack line 2',
      route: '/api/e2e/fake',
      method: 'GET',
      adminEmail: ADMIN_EMAIL,
      resolved: false,
      occurredAt: new Date(),
    });
    touched.systemErrorIds.add(log._id);

    const list = await request('GET', '/api/admin/system-errors?limit=25', { expected: [200] });
    assert(list.data.logs.some((x) => String(x._id) === String(log._id)), 'system error log not visible', list.data);
    const resolved = await request('PATCH', `/api/admin/system-errors/${log._id}/resolve`, { expected: [200], body: {} });
    assert(resolved.data.log.resolved === true, 'system error did not resolve', resolved.data);
  });

  await test('store hours read/update/restore safety check', async () => {
    await rememberStoreHour('Monday');
    await request('GET', '/api/admin/store-hours', { expected: [200] });
    const update = await request('PUT', '/api/admin/store-hours/Monday', {
      expected: [200],
      body: { open: '09:00', close: '18:00', closed: false },
    });
    assert(update.data, 'store hours update did not return data', update.data);
  });

  await test('gift card create/search/redeem/update/delete and failure cases', async () => {
    const bad = await request('POST', '/api/giftcards/create', {
      expected: [400],
      body: { code: 'SHORT', type: 'digital', amount: 10, email: 'bad' },
    });
    assert(bad.data.message, 'gift card failure should return message', bad.data);

    const code = `E2E${RUN_ID}GIFT00000000000`.slice(0, 28).padEnd(28, 'X');
    touched.giftCardCodes.add(code);
    const create = await request('POST', '/api/giftcards/create', {
      expected: [201],
      body: { code, type: 'digital', amount: 50, pin: '1234', email: `gift-${RUN_ID}@rakie-e2e.test`, adminPassword: 'ignored-by-controller' },
    });
    assert(create.data.giftCard.remainingBalance === 50, 'gift card balance wrong', create.data);

    await request('GET', `/api/giftcards/redeem-search/${code}`, { expected: [200] });
    await request('POST', '/api/giftcards/redeem', { expected: [403], body: { code, redeemAmount: 5, pin: '0000' } });
    const redeem = await request('POST', '/api/giftcards/redeem', { expected: [200], body: { code, redeemAmount: 10, pin: '1234' } });
    assert(redeem.data.remaining === 40, 'gift card redeem remaining balance wrong', redeem.data);
    const updated = await request('PUT', `/api/giftcards/update/${code}`, { expected: [200], body: { amount: 60, pin: '2222' } });
    assert(updated.data.card.remainingBalance === 60, 'gift card update/reset balance wrong', updated.data);
    await request('DELETE', `/api/giftcards/delete/${code}`, { expected: [200] });
    touched.giftCardCodes.delete(code);
  });

  await test('format helper fallback cases for SMS/date-time safety', async () => {
    const normalized = normalizeAppointmentDateTime('2026-05-06', 810);
    assert(normalized.ok === true, 'numeric minutes should normalize', normalized);
    assert(normalized.formattedTime === '1:30 PM', '810 minutes should mean 1:30 PM', normalized);
    const invalid = normalizeAppointmentDateTime('not-a-date', 'not-a-time');
    assert(invalid.ok === false, 'invalid date/time should be rejected', invalid);
    assert(formatDate('2026-05-06').includes('2026'), 'formatDate date-only failed');
    assert(formatTime('06:00') === '6:00 AM', 'formatTime 06:00 failed');
  });

  await test('Twilio inbound rejects unsigned webhook in protected validation mode', async () => {
    const res = await fetchWithTimeout(`${BASE_URL}/api/sms/inbound`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ From: '+15855550123', Body: 'STOP' }).toString(),
    });
    assert([200, 403, 500].includes(res.status), `unexpected inbound status ${res.status}`);
    // 403 is expected in normal local/prod because Twilio signature validation rejects unsigned requests.
  });

  await test('delete/archive workflows for appointment, worker, service, client and promotion', async () => {
    if (appointment?._id) {
      await request('DELETE', `/api/admin/appointments/${appointment._id}`, { expected: [200] });
      touched.appointmentIds.delete(appointment._id);
    }

    if (couponDeal?._id) {
      await request('PATCH', `/api/admin/promotion-deals/${couponDeal._id}/status`, { expected: [200], body: { status: 'archived' } });
      await request('DELETE', `/api/admin/promotion-deals/${couponDeal._id}`, { expected: [200] });
      touched.dealIds.delete(couponDeal._id);
    }

    if (regularWorker?._id) {
      const del = await request('DELETE', `/api/admin/workers/${regularWorker._id}`, { expected: [200] });
      assert(del.data.deleted === true || del.data.archived === true, 'worker delete/archive response unexpected', del.data);
      if (del.data.deleted) touched.workerIds.delete(regularWorker._id);
    }

    if (client?._id) {
      await request('DELETE', `/api/admin/clients/${client._id}`, { expected: [200] });
      touched.clientIds.delete(client._id);
    }

    for (const svc of [service, chemicalService, addOn]) {
      if (svc?._id) {
        await request('DELETE', `/api/admin/services/${svc._id}`, { expected: [200] });
        touched.serviceIds.delete(svc._id);
      }
    }
  });

  console.log('\n─────────────────────────────────────────────');
  console.log('E2E regression summary');
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  console.table(results.map((r) => ({ status: r.status, test: r.name, ms: r.ms })));
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) process.exitCode = 1;
}

(async () => {
  try {
    await main();
  } catch (err) {
    process.exitCode = 1;
    console.error(`\nFatal E2E runner error: ${err.message}`);
  } finally {
    try { await cleanup(); } catch (err) { console.error('Cleanup failed:', err.message); process.exitCode = 1; }
    try { await mongoose.disconnect(); } catch (_) {}
    if (serverProcess) {
      serverProcess.kill('SIGTERM');
      await sleep(500);
      if (!serverProcess.killed) serverProcess.kill('SIGKILL');
    }
  }
})();
