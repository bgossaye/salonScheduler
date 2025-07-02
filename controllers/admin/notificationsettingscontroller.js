// controllers/admin/notificationSettingsController.js
const NotificationSettings = require('../../models/notificationSettings');



// GET all templates + master switch
exports.getNotificationSettings = async (req, res) => {
  try {
    const settings = await NotificationSettings.findOne();

    if (!settings) {
      return res.json({
        templates: [],
        masterNotificationsEnabled: true,
      });
    }

    const { masterNotificationsEnabled, ...rest } = settings.toObject();

    // Convert the rest (confirmation, reminder, etc.) into template array format
    const templates = Object.entries(rest)
      .filter(([key, value]) => typeof value === 'object' && value !== null)
      .map(([templateType, config]) => ({
        templateType,
        ...config
      }));

    res.json({
      templates,
      masterNotificationsEnabled,
    });
  } catch (err) {
    console.error("❌ Failed to fetch notification settings:", err);
    res.status(500).json({ error: 'Server error' });
  }
};


// PUT /notificationsettings/:templateType
exports.updateTemplate = async (req, res) => {
  const { templateType } = req.params;
  const { smsTemplate, emailTemplate, enabled } = req.body;

  try {
    let setting = await NotificationSettings.findOne({ templateType });

    if (!setting) {
      setting = new NotificationSettings({ templateType });
    }

    setting.smsTemplate = smsTemplate || setting.smsTemplate;
    setting.emailTemplate = emailTemplate || setting.emailTemplate;
    setting.enabled = enabled !== undefined ? enabled : setting.enabled;

    await setting.save();
    res.json(setting);
  } catch (err) {
    console.error(`❌ Failed to update ${templateType} template:`, err);
    res.status(500).json({ error: 'Failed to update template' });
  }
};

// PUT /notificationsettings/master-toggle
exports.toggleMasterSwitch = async (req, res) => {
  const { enabled } = req.body;

  try {
    let settings = await NotificationSettings.findOne();

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
