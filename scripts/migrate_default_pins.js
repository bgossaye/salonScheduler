!!!!!!!!!!!!!!!
how to call it from server.js
//const { migrateDefaultPins } = require('./scripts/migrate_default_pins');

mongoose.connect(process.env.MONGO_URI)
  .then(async () => {
    console.log('✅ MongoDB connected');

      //const res = await migrateDefaultPins({
        //dryRun: false,
        /limit: 82,
        //log: true,
      //});
      //console.log('Default PIN migration done:', res);

    // now continue with the rest of your startup (e.g., app.listen)
  })
  .catch(err => console.error('❌ MongoDB connection error:', err));

!!!!!!!!!!!!!!!!!



// scripts/migrate_default_pins.js
const bcrypt = require('bcryptjs');
const Client = require('../models/client'); // adjust path if needed

function last4(phone = '') {
  const d = String(phone).replace(/\D/g, '');
  return d.slice(-4);
}

/**
 * Initialize default PINs for clients that don't have one.
 * Default PIN = last 4 digits of phone.
 *
 * @param {Object} opts
 * @param {boolean} [opts.dryRun=false] - If true, does NOT write to DB (logs only).
 * @param {number|null} [opts.limit=null] - If set, processes at most N clients.
 * @param {boolean} [opts.log=true] - If true, logs progress.
 * @returns {Promise<{scanned:number, updated:number, skipped:number, errors:number}>}
 */
async function migrateDefaultPins({ dryRun = false, limit = null, log = true } = {}) {
  let scanned = 0, updated = 0, skipped = 0, errors = 0;

  // Only clients missing pinHash
  const query = { $or: [{ pinHash: { $exists: false } }, { pinHash: null }] };

  const cursor = Client.find(query)
    .select('_id phone pinHash failedPinAttempts pinLockedUntil') // minimal fields
    .cursor();

  for await (const doc of cursor) {
    if (limit && scanned >= limit) break;
    scanned += 1;

    const last4Pin = last4(doc.phone);
    if (last4Pin.length !== 4) {
      skipped += 1;
      if (log) console.warn(`[migrate_default_pins] Skipping ${doc._id}: invalid phone "${doc.phone}"`);
      continue;
    }

    try {
      const pinHash = await bcrypt.hash(last4Pin, 10);

      if (dryRun) {
        updated += 1; // would update
        if (log) console.log(`[DRY] would set default PIN (****) for client=${doc._id}`);
        continue;
      }

      await Client.findByIdAndUpdate(
        doc._id,
        {
          $set: {
            pinHash,
            pinSetAt: new Date(),
            pinIsDefault: true,
            failedPinAttempts: 0,       // reset lock counters
          },
          $unset: {
            pinLockedUntil: 1,          // clear any lock
          },
        },
        { new: false }
      );

      updated += 1;
      if (log) console.log(`[OK] set default PIN for client=${doc._id}`);
    } catch (e) {
      errors += 1;
      console.error(`[ERR] updating client=${doc._id}:`, e?.message || e);
    }
  }

  const summary = { scanned, updated, skipped, errors };
  if (log) console.log('[migrate_default_pins] summary:', summary);
  return summary;
}

module.exports = { migrateDefaultPins };
