const Reminder = require('../../models/reminder');
const NotificationSettings = require('../../models/notificationsettings');

// GET all reminders
exports.getReminders = async (req, res) => {
  try {
  const templates = await Reminder.find({});
  const master = await NotificationSettings.findOne({ templateType: 'master' });

  res.json({
    templates,
    masterNotificationsEnabled: master?.enabled !== false, // default to true if not found
  });

  } catch (err) {
    console.error('❌ Failed to fetch reminders:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

// PUT update by templateType
exports.updateReminderSettings = async (req, res) => {
  try {
    const { type } = req.params;
    const updated = await Reminder.findOneAndUpdate(
      { templateType: type },
      {
        smsTemplate: req.body.smsTemplate,
        emailTemplate: req.body.emailTemplate,
        enabled: req.body.enabled
      },
      { new: true, upsert: false }
    );

    if (!updated) {
      return res.status(404).json({ error: 'Reminder not found' });
    }

    res.json(updated);
  } catch (err) {
    console.error('❌ Failed to update reminder:', err);
    res.status(500).json({ error: 'Update failed' });
  }
};

// POST new reminder
exports.createReminder = async (req, res) => {
  try {
    const reminder = new Reminder(req.body);
    const saved = await reminder.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error('❌ Failed to create reminder:', err);
    res.status(500).json({ error: 'Failed to create reminder' });
  }
};
