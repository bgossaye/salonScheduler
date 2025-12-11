const mongoose = require('mongoose');
const Client = require('../models/Client');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- Logging knobs (env-configurable) ----
const VERBOSE = process.env.PROMOS_LOG_VERBOSE === '1';      // log every candidate
const LOG_LIMIT = Number(process.env.PROMOS_LOG_LIMIT || 81); // max detailed logs
const LOG_ID = process.env.PROMOS_LOG_ID || '';              // only log this _id (string)
const LOG_READBACK = process.env.PROMOS_LOG_READBACK !== '0'; // read-after-save (default on)

/** helper to pretty-print the three locations */
function snapshot(doc) {
  return {
    top: doc?.optInPromotions,
    cp: doc?.contactPreferences?.optInPromotions,
    mk: doc?.marketing?.optInPromotions,
  };
}

function shouldLogThis(id, alreadyLoggedCount) {
  if (LOG_ID) return String(id) === String(LOG_ID);
  if (VERBOSE) return alreadyLoggedCount < LOG_LIMIT;
  return false;
}

function fmt(doc) {
  return {
    _id: String(doc._id),
    firstName: doc.firstName,
    lastName: doc.lastName,
    phone: doc.phone,
    ...snapshot(doc),
  };
}

function isTruthyTrue(v) {
  return v === true || v === 'true' || v === 1 || v === '1';
}
function isNotTrue(v) {
  return !isTruthyTrue(v);
}

async function enablePromos() {
  // 1) ensure the connection is fully up (plus small settle delay)
  if (mongoose.connection.readyState !== 1) {
    const start = Date.now();
    while (mongoose.connection.readyState !== 1 && Date.now() - start < 3000) {
      await sleep(100);
    }
  }
  await sleep(1000); // extra 1s, per your request

  // 2) fetch all clients (we’ll decide per-doc if it needs changes)
  const fields = {
    _id: 1, firstName: 1, lastName: 1, phone: 1,
    optInPromotions: 1, contactPreferences: 1, marketing: 1
  };
  const all = await Client.find({}, fields).exec();

  let matched = 0;
  let modified = 0;
  let logged = 0;
  const changedIds = [];
  const unchangedIds = [];

  for (const doc of all) {
    const before = snapshot(doc);
    const needsUpdate = isNotTrue(before.top) || isNotTrue(before.cp) || isNotTrue(before.mk);

    if (!needsUpdate) {
      if (shouldLogThis(doc._id, logged)) {
        console.log('[READ] already true →', fmt(doc));
        logged++;
      }
      continue;
    }

    matched++;

    // Initialize nested objects if missing
    if (!doc.contactPreferences) doc.contactPreferences = {};
    if (!doc.marketing) doc.marketing = {};

    const logThis = shouldLogThis(doc._id, logged);

    if (logThis) {
      console.log('[READ] before →', fmt(doc));
    }

    // 3) set all representations to true
    doc.optInPromotions = true;
    doc.contactPreferences.optInPromotions = true;
    doc.marketing.optInPromotions = true;

    if (logThis) {
      console.log('[SET ] writing →', {
        _id: String(doc._id),
        set: { top: true, cp: true, mk: true }
      });
    }

    try {
      await doc.save({ validateBeforeSave: false });
      modified++;
      changedIds.push(String(doc._id));

      if (LOG_READBACK || logThis) {
        // 4) read-after-save (fresh from DB)
        const fresh = await Client.findById(doc._id, fields).lean();
        if (logThis) {
          console.log('[READ] after  →', fmt(fresh));
          logged++;
        }
      }
    } catch (err) {
      console.error(`[ERR ] save failed for ${doc._id}:`, err?.message || err);
      unchangedIds.push(String(doc._id));
    }
  }

  // 5) final verification sample (first 5 still not true)
  const remaining = await Client.find({
    $or: [
      { optInPromotions: { $exists: false } },
      { optInPromotions: null },
      { optInPromotions: { $in: [false, 0, '0', 'false', ''] } },
      { 'contactPreferences.optInPromotions': { $exists: false } },
      { 'contactPreferences.optInPromotions': null },
      { 'contactPreferences.optInPromotions': { $in: [false, 0, '0', 'false', ''] } },
      { 'marketing.optInPromotions': { $exists: false } },
      { 'marketing.optInPromotions': null },
      { 'marketing.optInPromotions': { $in: [false, 0, '0', 'false', ''] } },
    ]
  }).select(fields).limit(5).lean();

  if (remaining.length) {
    console.warn('[WARN] still not-true (first 5):', remaining.map(fmt));
  }

  console.log(`[DONE] strong-enable → matched: ${matched}, modified: ${modified}, remainingSample: ${remaining.length}`);
  if (changedIds.length) console.log('[INFO] changed ids (first 20):', changedIds.slice(0, 20));
  if (unchangedIds.length) console.log('[INFO] unchanged (failed saves) ids:', unchangedIds);

  return { matched, modified, remainingSample: remaining.length };
}

module.exports = { enablePromos };



to cool it move this to the caller file.

(async () => {
  // After mongoose.connect(...) has succeeded:
    try {
      const { enablePromos } = require('./scripts/enablePromos');
      const { matched, modified } = await enablePromos();
      console.log(`[one-off] optInPromotions enabled → matched: ${matched}, modified: ${modified}`);
    } catch (err) {
      console.error('[one-off] enablePromos failed:', err);
    }
  
})();

