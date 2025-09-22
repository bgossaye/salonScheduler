// controllers/admin/notificationSettingsController.js
const NotificationSettings = require('../../models/notificationsettings');


// GET all templates + master switch
exports.getNotificationSettings = async (req, res) => {
  try {
	const settings = await NotificationSettings.getSingleton();

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


exports.updateTemplate = async (req, res) => {
  const { templateType } = req.params; // e.g., 'pending', 'confirmation', ...
  const { smsTemplate, emailTemplate, enabled } = req.body;
  try {
    let settings = await NotificationSettings.getSingleton();
    if (!settings) settings = new NotificationSettings();
    if (!settings[templateType]) settings[templateType] = {};
    if (smsTemplate !== undefined) settings[templateType].smsTemplate = smsTemplate;
    if (emailTemplate !== undefined) settings[templateType].emailTemplate = emailTemplate;
    if (enabled !== undefined) settings[templateType].enabled = enabled;
    await settings.save();
    res.json(settings[templateType]);
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
