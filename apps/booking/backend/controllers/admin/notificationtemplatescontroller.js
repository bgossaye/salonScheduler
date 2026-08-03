// controllers/admin/notificationTemplatesController.js
const NotificationTemplate = require('../../models/notificationtemplate');
const NotificationSetting  = require('../../models/notificationsetting');
const { toCanonical } = require('../../utils/canon');

// GET /admin/notificationtemplate
exports.getAll = async (req, res) => {
  try {
    const rows = await NotificationTemplate.find({}).lean();

    // fold any legacy/mistyped keys into canonical names in the response
      const templates = rows.map(r => ({
      templateType: toCanonical(r.type),
      smsTemplate: r.smsTemplate || '',
      emailTemplate: r.emailTemplate || '',
      enabled: r.enabled !== false,
    }));

    const setting = await NotificationSetting.getSingleton();
    res.json({
      templates,
      masterNotificationsEnabled: setting?.masterNotificationsEnabled !== false,
    });
  } catch (err) {
    console.error('❌ fetch admin templates failed', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// PUT /admin/notificationtemplate/:templateType
exports.updateOne = async (req, res) => {
  const { templateType } = req.params;
  const canonical = toCanonical(templateType);
  const { smsTemplate, emailTemplate, enabled } = req.body;
  try {
    const doc = await NotificationTemplate.findOneAndUpdate(
      { type: canonical }, // ✅ filter by canonical key
      {
        $set: {
          type: canonical,
          smsTemplate: smsTemplate ?? '',
          emailTemplate: emailTemplate ?? '',
          enabled: enabled !== false,
          status: 'scheduled',
        },
      },
      { new: true, upsert: true }
    );
    res.json({
      templateType: canonical,
      smsTemplate: doc.smsTemplate,
      emailTemplate: doc.emailTemplate,
      enabled: doc.enabled,
    });
  } catch (err) {
    console.error(`❌ update ${templateType} failed`, err);
    res.status(500).json({ error: 'Update failed' });
  }
};

// PUT /admin/notificationtemplate/master-toggle
exports.toggleMaster = async (req, res) => {
  const { enabled } = req.body;
  try {
    const s = await NotificationSetting.getSingleton();
    s.masterNotificationsEnabled = !!enabled;
    await s.save();
    res.json({ success: true, enabled: s.masterNotificationsEnabled });
  } catch (err) {
    console.error('❌ toggle master failed', err);
    res.status(500).json({ error: 'Toggle failed' });
  }
};
