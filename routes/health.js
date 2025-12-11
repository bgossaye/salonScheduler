// routes/health.js (or in server.js)
const express = require('express');
const { ensureAwake, getAwakeStatus } = require('../utils/awake');

const router = express.Router();

router.get('/healthz', (req, res) => {
   const ok = JSON.stringify({ status: 'ok' });
   res.set({
     'Cache-Control': 'no-store',
     'Timing-Allow-Origin': '*',
     'Access-Control-Allow-Origin': '*',
     'Content-Type': 'application/json; charset=utf-8',
   }).status(200).send(ok);
   // Warm after reply; only cron (with key) actually touches the marker
   if (req.query?.key === process.env.HEALTHZ_KEY) {
     setImmediate(() => ensureAwake('healthz').catch(() => {}));
   }
 });
module.exports = router;
