const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const Admin = require('../../models/admin');
const StaffRole = require('../../models/staffrole');
const Worker = require('../../models/worker');
const { ensureDefaultRoles } = require('../../utils/workerPricing');
const { makeToken, tokenHash, addMinutes, makeCredentialUrl, deliverCredentialLink } = require('../../utils/staffCredentialDelivery');

function permissionsObject(role) {
  const defaults = StaffRole.defaultPermissions ? StaffRole.defaultPermissions() : {};
  const raw = role?.permissions instanceof Map ? Object.fromEntries(role.permissions) : (role?.permissions || {});
  return { ...defaults, ...raw };
}

function passwordTooWeak(password) {
  const value = String(password || '');
  if (value.length < 8) return 'Password must be at least 8 characters.';
  return '';
}

async function findAdminByCredentialToken(rawToken, purpose = 'reset') {
  const hash = tokenHash(rawToken || '');
  const now = new Date();
  if (!hash) return null;

  const query = purpose === 'invite'
    ? { inviteTokenHash: hash, inviteExpiresAt: { $gt: now } }
    : { passwordResetTokenHash: hash, passwordResetExpiresAt: { $gt: now } };

  return Admin.findOne(query);
}

async function workerForAdmin(admin) {
  if (!admin?.workerId) return null;
  return Worker.findById(admin.workerId).lean();
}

function publicTokenAccount(admin, worker = null) {
  return {
    email: admin?.email || '',
    username: admin?.username || admin?.email || '',
    workerName: worker?.displayName || [worker?.firstName, worker?.lastName].filter(Boolean).join(' ').trim() || '',
    status: admin?.status || '',
  };
}

async function createPasswordReset(admin, { channel = 'email' } = {}) {
  const token = makeToken();
  const expiresMinutes = Number(process.env.STAFF_RESET_EXPIRES_MINUTES || 60);
  const worker = await workerForAdmin(admin);
  const url = await makeCredentialUrl('reset', token);

  admin.passwordResetTokenHash = tokenHash(token);
  admin.passwordResetExpiresAt = addMinutes(new Date(), expiresMinutes);
  admin.passwordResetSentAt = new Date();
  admin.mustChangePassword = true;

  const delivery = await deliverCredentialLink({ kind: 'reset', worker, admin, url, channel, expiresMinutes });
  admin.credentialLastDeliveryStatus = delivery.map((item) => `${item.channel}:${item.status}`).join(', ');
  admin.credentialLastDeliveryChannel = String(channel || 'email');
  admin.credentialLastDeliveryError = delivery.find((item) => item.error)?.error || '';
  await admin.save();

  return { token, url, expiresAt: admin.passwordResetExpiresAt, delivery };
}

async function hydrateAdminSession(adminDoc) {
  await ensureDefaultRoles();

  let role = adminDoc.roleId ? await StaffRole.findById(adminDoc.roleId).lean() : null;
  if (!role && adminDoc.roleKey) role = await StaffRole.findOne({ key: adminDoc.roleKey }).lean();
  if (!role) role = await StaffRole.findOne({ key: 'admin' }).lean();

  const worker = adminDoc.workerId ? await Worker.findById(adminDoc.workerId).lean() : null;
  const roleKey = role?.key || adminDoc.roleKey || 'admin';
  const permissions = permissionsObject(role);

  const token = jwt.sign(
    {
      id: adminDoc._id,
      role: roleKey,
      roleKey,
      email: adminDoc.email,
      workerId: worker?._id || adminDoc.workerId || null,
      permissions,
    },
    process.env.JWT_SECRET,
    { expiresIn: '1d' }
  );

  return {
    token,
    admin: {
      id: adminDoc._id,
      email: adminDoc.email,
      username: adminDoc.username,
      roleKey,
      roleName: role?.name || roleKey,
      workerId: worker?._id || adminDoc.workerId || null,
      workerName: worker?.displayName || '',
      workerTitle: worker?.title || '',
      status: adminDoc.status || 'active',
      mustChangePassword: adminDoc.mustChangePassword === true,
      permissions,
    },
  };
}

exports.login = async (req, res) => {
  const email = String(req.body?.email || '').trim().toLowerCase();
  const { password } = req.body;

  try {
    const admin = await Admin.findOne({
      $or: [
        { email },
        { username: email },
      ],
    });

    if (!admin) return res.status(401).json({ error: 'Invalid credentials' });
    if (admin.status === 'disabled') return res.status(403).json({ error: 'This staff account is disabled.' });

    const isMatch = await bcrypt.compare(password || '', admin.password);
    if (!isMatch) return res.status(401).json({ error: 'Invalid credentials' });

    if (admin.workerId) {
      const worker = await Worker.findById(admin.workerId).lean();
      if (worker && worker.active === false) {
        return res.status(403).json({ error: 'This worker profile is inactive. Ask an owner/admin to reactivate it.' });
      }
    }

    admin.status = admin.status || 'active';
    admin.lastLoginAt = new Date();
    await admin.save();

    res.json(await hydrateAdminSession(admin));
  } catch (err) {
    console.error('🔥 Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
};

exports.me = async (req, res) => {
  try {
    const admin = await Admin.findById(req.admin?.id);
    if (!admin) return res.status(404).json({ error: 'Account not found.' });
    const session = await hydrateAdminSession(admin);
    res.json({ admin: session.admin });
  } catch (err) {
    console.error('🔥 me failed:', err);
    res.status(500).json({ error: 'Failed to load account.' });
  }
};

exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || String(newPassword).length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    const admin = await Admin.findById(req.admin?.id);
    if (!admin) return res.status(404).json({ error: 'Account not found.' });

    const currentMatches = await bcrypt.compare(currentPassword || '', admin.password);
    if (!currentMatches) return res.status(401).json({ error: 'Current password is incorrect.' });

    admin.password = await bcrypt.hash(newPassword, 10);
    admin.mustChangePassword = false;
    admin.status = admin.status === 'invited' ? 'active' : admin.status;
    await admin.save();

    res.json({ success: true });
  } catch (err) {
    console.error('🔥 changePassword failed:', err);
    res.status(500).json({ error: 'Failed to change password.' });
  }
};


exports.tokenStatus = async (req, res) => {
  try {
    const purpose = String(req.query?.purpose || req.body?.purpose || 'reset').toLowerCase() === 'invite' ? 'invite' : 'reset';
    const token = String(req.query?.token || req.body?.token || '').trim();
    const admin = await findAdminByCredentialToken(token, purpose);
    if (!admin) return res.status(400).json({ valid: false, error: 'This link is invalid or expired.' });
    if (admin.status === 'disabled') return res.status(403).json({ valid: false, error: 'This staff account is disabled.' });
    const worker = await workerForAdmin(admin);
    res.json({ valid: true, purpose, account: publicTokenAccount(admin, worker) });
  } catch (err) {
    console.error('🔥 tokenStatus failed:', err);
    res.status(500).json({ valid: false, error: 'Failed to check link.' });
  }
};

exports.acceptInvite = async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.password || '');
    const weakness = passwordTooWeak(newPassword);
    if (weakness) return res.status(400).json({ error: weakness });

    const admin = await findAdminByCredentialToken(token, 'invite');
    if (!admin) return res.status(400).json({ error: 'This invite link is invalid or expired.' });
    if (admin.status === 'disabled') return res.status(403).json({ error: 'This staff account is disabled.' });

    admin.password = await bcrypt.hash(newPassword, 10);
    admin.mustChangePassword = false;
    admin.status = 'active';
    admin.inviteTokenHash = '';
    admin.inviteExpiresAt = null;
    admin.passwordResetTokenHash = '';
    admin.passwordResetExpiresAt = null;
    await admin.save();

    res.json(await hydrateAdminSession(admin));
  } catch (err) {
    console.error('🔥 acceptInvite failed:', err);
    res.status(500).json({ error: 'Failed to set password.' });
  }
};

exports.requestPasswordReset = async (req, res) => {
  try {
    const email = String(req.body?.email || req.body?.username || '').trim().toLowerCase();
    if (email) {
      const admin = await Admin.findOne({ $or: [{ email }, { username: email }] });
      if (admin && admin.status !== 'disabled') {
        await createPasswordReset(admin, { channel: req.body?.channel || 'email' });
      }
    }

    // Always generic so the login page does not expose whether a staff email exists.
    res.json({ success: true, message: 'If a staff account exists for this email, a password reset link has been sent.' });
  } catch (err) {
    console.error('🔥 requestPasswordReset failed:', err);
    res.json({ success: true, message: 'If a staff account exists for this email, a password reset link has been sent.' });
  }
};

exports.resetPasswordWithToken = async (req, res) => {
  try {
    const token = String(req.body?.token || '').trim();
    const newPassword = String(req.body?.password || '');
    const weakness = passwordTooWeak(newPassword);
    if (weakness) return res.status(400).json({ error: weakness });

    const admin = await findAdminByCredentialToken(token, 'reset');
    if (!admin) return res.status(400).json({ error: 'This reset link is invalid or expired.' });
    if (admin.status === 'disabled') return res.status(403).json({ error: 'This staff account is disabled.' });

    admin.password = await bcrypt.hash(newPassword, 10);
    admin.mustChangePassword = false;
    admin.status = admin.status === 'invited' ? 'active' : (admin.status || 'active');
    admin.passwordResetTokenHash = '';
    admin.passwordResetExpiresAt = null;
    admin.inviteTokenHash = '';
    admin.inviteExpiresAt = null;
    await admin.save();

    res.json(await hydrateAdminSession(admin));
  } catch (err) {
    console.error('🔥 resetPasswordWithToken failed:', err);
    res.status(500).json({ error: 'Failed to reset password.' });
  }
};

exports.register = async (req, res) => {
  const { email, password } = req.body;
  try {
    const hashed = await bcrypt.hash(password, 10);
    const admin = new Admin({ email, username: email, password: hashed });
    await admin.save();
    res.status(201).json({ message: 'Admin created' });
  } catch (err) {
    console.error('🔥 Registration error:', err);
    res.status(400).json({ error: 'Registration failed' });
  }
};
