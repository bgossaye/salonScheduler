// utils/awake.js
const AwakeMarker = require('../models/awakemarker');

const TTL_MS = Number(process.env.AWAKE_TTL_MS || 14 * 60 * 1000); // default 14m
let memLastWake = 0;           // process-local cache
let inFlight = null;           // coalesce concurrent refreshes

const isFresh = () => Date.now() - memLastWake < TTL_MS;

async function readMarker() {
  try {
    const doc = await AwakeMarker.findById('render-awake').lean();
    return doc ? new Date(doc.lastWakeAt).getTime() : 0;
  } catch {
    // DB temporarily unavailable → fall back to whatever we have in memory
    return memLastWake || 0;
  }
 }

async function touchMarker(by = 'healthz') {
  try {
    await AwakeMarker.updateOne(
      { _id: 'render-awake' },
      { $currentDate: { lastWakeAt: true, lastTouchAt: true }, $set: { by } },
      { upsert: true }
    );
  } catch {
    // If DB write fails, still advance memory clock so cluster doesn't stampede.
    memLastWake = Date.now();
  }
}

async function ensureAwake(by = 'healthz') {
  if (isFresh()) return memLastWake;

  if (inFlight) return inFlight; // another request is already refreshing

  inFlight = (async () => {
    // double-check against DB only if our memory is stale
    const dbLast = await readMarker();
    memLastWake = Math.max(memLastWake, dbLast);

    if (!isFresh()) {
      // stale for real → we’re the winner that “touches”
      await touchMarker(by);
      memLastWake = Date.now();
    }

    return memLastWake;
  })();

  try { return await inFlight; }
  finally { inFlight = null; }
}

function getAwakeStatus() {
  return { fresh: isFresh(), lastWakeAt: memLastWake, ttlMs: TTL_MS };
}

module.exports = { ensureAwake, isFresh, getAwakeStatus };