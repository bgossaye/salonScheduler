// utils/templates.js
const fs = require('fs');
const path = require('path');
const NotificationTemplate = require('../models/notificationtemplate');
const { toCanonical } = require('../utils/canon');


// Parse JSON-with-comments (JSONC): supports //, /* */, and trailing commas
function parseJSONC(raw) {
  let s = raw.replace(/^\uFEFF/, '');
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/(^|[^:\\])\/\/.*$/gm, '$1');
  s = s.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(s);
}

function loadFileFallback() {
  const p = path.join(__dirname, '..', 'data', 'notification-templates.json');
  return parseJSONC(fs.readFileSync(p, 'utf8'));
}

async function getTemplate(type) {
  const key = toCanonical(type);
  const row = await NotificationTemplate.findOne({ type: key }).lean();
  if (row) {
    return {
      sms: row.smsTemplate || '',
      email: row.emailTemplate || '',
      enabled: row.enabled !== false,
      source: 'db',
    };
  }

  // 2) File fallback
  const fb = loadFileFallback();
  const t = (fb.templates || []).find(x => {
    const raw = (x.type || x.templateType || '').toLowerCase();
    const normalized = ALIAS[raw] || raw;
    return normalized === key && (x.enabled !== false);
  });

  if (t) {
    return {
      sms: t.smsTemplate || '',
      email: t.emailTemplate || '',
      enabled: t.enabled !== false,
      source: 'file',
    };
  }

  const err = new Error(`template_not_found: ${key}`);
  err.code = 'TEMPLATE_NOT_FOUND';
  throw err;
}

module.exports = { getTemplate, loadFileFallback };
