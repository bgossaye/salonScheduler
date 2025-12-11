// scripts/seednotification.js
require('dotenv').config();
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs');
const NotificationTemplate = require('../models/notificationsettings');

// JSONC-safe parse (supports // and /* */ and trailing commas)
function parseJSONC(raw) {
  let s = raw.replace(/^\uFEFF/, '');
  s = s.replace(/\/\*[\s\S]*?\*\//g, '');
  s = s.replace(/(^|[^:\\])\/\/.*$/gm, '$1');
  s = s.replace(/,\s*([}\]])/g, '$1');
  return JSON.parse(s);
}

// {{var}} -> {var} if your populate() expects single braces
function toSingleBraces(str) {
  if (typeof str !== 'string') return str;
  return str.replace(/{{\s*([^}]+)\s*}}/g, '{$1}');
}

(async () => {
  await mongoose.connect(process.env.MONGO_URI);

  // load fallback file
  const filePath = path.join(__dirname, '..', 'data', 'notification-templates.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  const fb = parseJSONC(raw);

  const ALIAS = new Map([['cancelation', 'cancellation']]);
  const applied = [];
  const skipped = [];

  for (const t of fb.templates || []) {
    // accept templateType or type, normalize spelling
    const rawType = (t.type || t.templateType || '').toLowerCase().trim();
    const type = ALIAS.get(rawType) || rawType;
    if (!type) { skipped.push(rawType); continue; }

    const doc = {
      type,
      enabled: typeof t.enabled === 'boolean' ? t.enabled : true,
      status: t.status || 'scheduled',
      smsTemplate: toSingleBraces(t.smsTemplate || ''),
      emailTemplate: toSingleBraces(t.emailTemplate || ''),
      placeholders: Array.isArray(t.placeholders) ? t.placeholders : []
    };

    await NotificationTemplate.updateOne({ type }, { $set: doc }, { upsert: true });
    applied.push(type);
  }

  console.log('[seed-rows] Upserted:', [...new Set(applied)].join(', '));
  if (skipped.length) console.log('[seed-rows] Skipped:', [...new Set(skipped)].join(', '));

  await mongoose.disconnect();
})();
