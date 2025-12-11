const NotificationSettings = require('../../models/notificationsettings');
const Reminder = require('../../models/reminder');
const fs = require('fs');
const path = require('path');
const { loadFileFallback } = require('../../utils/templates');

// GET /admin/notificationsettings
exports.getAll = async (req, res) => {
  try {
    const rows = await NotificationSetting.find({}).lean();
    // if you keep a master flag elsewhere, load it here:
    const masterNotificationsEnabled = true;
    return res.json({ masterNotificationsEnabled, templates: rows });
  } catch (e) {
    // fallback to file on DB failure
    const fb = loadFileFallback();
    return res.status(200).json(fb);
  }
};

// GET /admin/notificationsettings/fallback  (used by UI on “DB fetch failed”)
exports.getFallback = (req, res) => {
  const fb = loadFileFallback();
  res.json(fb);
};

// PUT /admin/notificationsettings/:templateType
exports.updateOne = async (req, res) => {
  const { templateType } = req.params;
  const { smsTemplate, emailTemplate, enabled } = req.body;
  const doc = await NotificationSetting.findOneAndUpdate(
    { templateType },
    { templateType, smsTemplate, emailTemplate, enabled },
    { upsert: true, new: true }
  );
  res.json(doc);
};

// PUT /admin/notificationsettings/master-toggle
exports.masterToggle = async (req, res) => {
  // store wherever you keep global flags; keep simple here
  res.json({ ok: true, enabled: !!req.body.enabled });
};

// GET all templates + master switch
exports.getNotificationSettings = async (req, res) => {
  try {
    // 1) Master flag still lives in NotificationSettings singleton
    const settings = await NotificationSettings.getSingleton();
    const masterNotificationsEnabled = settings?.masterNotificationsEnabled !== false;

    // 2) Templates currently live in the reminders collection — load them
    const reminders = await Reminder.find({}).lean();
    const templates = reminders.map(r => ({
      templateType: String(r.templateType || r.type || '').toLowerCase(),
      smsTemplate: r.smsTemplate || '',
      emailTemplate: r.emailTemplate || '',
      enabled: r.enabled !== false,
    }));

    // 3) Write a disk fallback snapshot for the Admin UI to use if DB fetch fails
    try {
      const fallbackPath = path.join(__dirname, '../../cache/notifications.templates.fallback.json');
      fs.mkdirSync(path.dirname(fallbackPath), { recursive: true });
      fs.writeFileSync(
        fallbackPath,
        JSON.stringify({ templates, masterNotificationsEnabled }, null, 2),
        'utf8'
      );
    } catch (e) {
      console.warn('⚠️ fallback snapshot write failed:', e.message);
    }

    res.json({ templates, masterNotificationsEnabled });
  } catch (err) {
    console.error("❌ Failed to fetch notification settings:", err);
    res.status(500).json({ error: 'Server error' });
  }
};

// GET disk fallback snapshot (used by Admin UI if the live GET fails)
exports.getFallbackSnapshot = (req, res) => {
  try {
    const p = path.join(__dirname, '../../cache/notifications.templates.fallback.json');
    if (fs.existsSync(p)) return res.sendFile(p);
    return res.json({ templates: [], masterNotificationsEnabled: true });
  } catch (e) {
    console.error('❌ Failed to read fallback snapshot:', e.message);
    res.status(500).json({ error: 'fallback read failed' });
  }
};

exports.updateTemplate = async (req, res) => {
  const { templateType } = req.params; // e.g., 'pending', 'confirmation', ...
  const { smsTemplate, emailTemplate, enabled } = req.body;
  try {
    // Write-through: update Reminder (current source of truth)...
    const updated = await Reminder.findOneAndUpdate(
      { templateType },
      {
        $set: {
          smsTemplate: smsTemplate ?? '',
          emailTemplate: emailTemplate ?? '',
          enabled: enabled !== false
        }
      },
      { new: true, upsert: true }
    );

    // ...and mirror into NotificationSettings for future consolidation
    let settings = await NotificationSettings.getSingleton();
    settings[templateType] = settings[templateType] || {};
    if (smsTemplate !== undefined) settings[templateType].smsTemplate = smsTemplate;
    if (emailTemplate !== undefined) settings[templateType].emailTemplate = emailTemplate;
    if (enabled !== undefined) settings[templateType].enabled = enabled;
    await settings.save();

    res.json({
      templateType,
      smsTemplate: updated.smsTemplate,
      emailTemplate: updated.emailTemplate,
      enabled: updated.enabled
    });
  } catch (err) {
    console.error(`❌ Failed to update ${templateType} template:`, err);
    res.status(500).json({ error: 'Failed to update template' });
  }
};

// PUT /notificationsettings/master-toggle
exports.toggleMasterSwitch = async (req, res) => {
  const { enabled } = req.body;

  try {
    let settings = await NotificationSettings.getSingleton();

    if (!settings) {
      settings = new NotificationSettings();
    }

    settings.masterNotificationsEnabled = enabled;
    await settings.save();

    res.json({ success: true, enabled });
  } catch (err) {
    console.error("❌ Failed to update master switch:", err);
    res.status(500).json({ error: 'Failed to toggle master switch' });
  }
};
