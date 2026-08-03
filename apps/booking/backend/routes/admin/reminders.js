const express = require('express');
const router = express.Router();
const ScheduledReminder = require('../../models/scheduledreminder');
const auth = require('../../middleware/authmiddleware');

const { requireAnyPermission } = auth;
const canManageNotifications = requireAnyPermission([
  'notificationsManage',
  'notificationTemplatesManage',
  'settingsManage',
  'runtimeSettingsManage',
]);

router.use(auth);

router.get('/', canManageNotifications, async (req, res) => {
  try {
    const limit = Math.min(Math.max(Number(req.query.limit || 50), 1), 100);
    const reminders = await ScheduledReminder.find({})
      .sort({ scheduledAt: -1, createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ reminders });
  } catch (err) {
    console.error('[admin-reminders] list failed:', err?.message || err);
    res.status(500).json({ error: 'Failed to load scheduled reminders' });
  }
});

router.post('/', canManageNotifications, async (req, res) => {
  try {
    const scheduledAt = new Date(req.body?.scheduledAt || '');
    if (Number.isNaN(scheduledAt.getTime())) {
      return res.status(400).json({ error: 'A valid scheduledAt date/time is required.', code: 'INVALID_SCHEDULED_AT' });
    }

    const smsTemplate = String(req.body?.smsTemplate || '').trim();
    const emailTemplate = String(req.body?.emailTemplate || '').trim();
    if (!smsTemplate && !emailTemplate) {
      return res.status(400).json({ error: 'A reminder message is required.', code: 'REMINDER_MESSAGE_REQUIRED' });
    }

    const reminder = await ScheduledReminder.create({
      channel: String(req.body?.type || req.body?.channel || 'sms').toLowerCase() === 'email' ? 'email' : 'sms',
      templateType: String(req.body?.templateType || req.body?.reminderType || 'announcement').trim().toLowerCase() || 'announcement',
      smsTemplate,
      emailTemplate,
      scheduledAt,
      status: ['scheduled', 'canceled'].includes(String(req.body?.status || '').toLowerCase())
        ? String(req.body.status).toLowerCase()
        : 'scheduled',
      enabled: req.body?.enabled !== false,
      createdByAdminId: req.admin?.id || req.admin?._id || null,
      createdByName: req.admin?.name || req.admin?.displayName || req.admin?.email || '',
      metadata: {
        source: 'admin_notifications_panel',
      },
    });

    res.status(201).json({ reminder });
  } catch (err) {
    console.error('[admin-reminders] create failed:', err?.message || err);
    res.status(500).json({ error: 'Failed to schedule reminder' });
  }
});

router.patch('/:id', canManageNotifications, async (req, res) => {
  try {
    const updates = {};
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'enabled')) updates.enabled = req.body.enabled !== false;
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'status')) {
      const status = String(req.body.status || '').toLowerCase();
      if (!['scheduled', 'sent', 'canceled', 'failed'].includes(status)) {
        return res.status(400).json({ error: 'Invalid reminder status.', code: 'INVALID_REMINDER_STATUS' });
      }
      updates.status = status;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'scheduledAt')) {
      const scheduledAt = new Date(req.body.scheduledAt || '');
      if (Number.isNaN(scheduledAt.getTime())) {
        return res.status(400).json({ error: 'A valid scheduledAt date/time is required.', code: 'INVALID_SCHEDULED_AT' });
      }
      updates.scheduledAt = scheduledAt;
    }
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'smsTemplate')) updates.smsTemplate = String(req.body.smsTemplate || '').trim();
    if (Object.prototype.hasOwnProperty.call(req.body || {}, 'emailTemplate')) updates.emailTemplate = String(req.body.emailTemplate || '').trim();

    const reminder = await ScheduledReminder.findByIdAndUpdate(req.params.id, { $set: updates }, { new: true }).lean();
    if (!reminder) return res.status(404).json({ error: 'Scheduled reminder not found' });
    res.json({ reminder });
  } catch (err) {
    console.error('[admin-reminders] update failed:', err?.message || err);
    res.status(500).json({ error: 'Failed to update reminder' });
  }
});

module.exports = router;
