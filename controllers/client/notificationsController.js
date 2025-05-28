const Reminder = require('../../models/Reminder');

// Get all scheduled reminders
exports.getReminders = async (req, res) => {
  try {
    const reminders = await Reminder.find().sort({ scheduledAt: 1 });
    res.json(reminders);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch reminders' });
  }
};

// Update reminder settings (e.g., templates or enable/disable)
exports.updateReminderSettings = async (req, res) => {
  try {
    const settings = await Reminder.findOneAndUpdate(
      { type: req.params.type },
      req.body,
      { new: true, upsert: true }
    );
    res.json(settings);
  } catch (err) {
    res.status(400).json({ error: 'Failed to update settings' });
  }
};