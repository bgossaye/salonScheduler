// utils/TemplateManager.js
const Reminder = require('../models/reminder');

async function getTemplate(type) {
  const reminder = await Reminder.findOne({ templateType: type, type: 'sms', enabled: true });
  return reminder?.smsTemplate || '';
}

function populateTemplate(template, data = {}) {
  return template.replace(/\{\{(.*?)\}\}/g, (_, key) => data[key.trim()] || '');
}

module.exports = { getTemplate, populateTemplate };
