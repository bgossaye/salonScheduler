// utils/TemplateManager.js
const NotificationSettings = require('../models/notificationsettings');
const Reminder = require('../models/reminder'); // fallback only
const { formatDate, formatTime } = require('./formatHelpers');

async function getTemplatesFor(type) {
  const settings = await NotificationSettings.findOne();
  const node = settings?.[type];
  const masterOn = settings?.masterNotificationsEnabled !== false;
  if (masterOn && node && node.enabled !== false) {
    return { sms: node.smsTemplate || '', email: node.emailTemplate || '' };
  }
  // Fallback for legacy data stored in reminders
  const r = await Reminder.findOne({ templateType: type, enabled: true });
  return { sms: r?.smsTemplate || '', email: r?.emailTemplate || '' };
}

function populate(template, appt = {}) {
  if (!template) return '';
  const svc =
    appt.service?.name || appt.service || appt.serviceId?.name || '';
  const clientName =
    appt.clientId?.firstName
      ? `${appt.clientId.firstName} ${appt.clientId.lastName || ''}`.trim()
      : (appt.clientName || '');
  const data = {
    clientName,
    service: svc,
    date: appt.date ? formatDate(appt.date) : '',
    time: appt.time ? formatTime(appt.time) : '',
    message: appt.message || ''
  };
  return template.replace(/\{\{(.*?)\}\}/g, (_, key) => data[key.trim()] ?? '');
}

module.exports = { getTemplatesFor, populate };