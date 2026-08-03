#!/usr/bin/env node
/**
 * Rakie Salon – Deep Sanity Checker (with Test & Reset)
 * - Default config matches user's production/dev values (no flags needed)
 * - --test-reset : run a failure simulation then reset and re-run
 *
 * Exits non-zero on required check failures (final pass).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// -----------------------------
// CLI / Defaults
// -----------------------------
const rawArgs = process.argv.slice(2);
const args = Object.fromEntries(
  rawArgs.map(p => {
    const [k, ...rest] = p.replace(/^--/, '').split('=');
    return [k, rest.join('=') || ''];
  })
);

// === Add right after TEST_RESET, near other CLI parsing ===
const SKIP_FRONT_NATIVE = 'skip-front-native' in args;
const FRONT_NATIVE_RETRIES = Number(args['front-native-retries'] || 4);
const FRONT_NATIVE_BACKOFF_MS = Number(args['front-native-backoff-ms'] || 700);
const FRONT_ORIGIN_ALT = args['front-origin-alt'] || ''; // e.g. http://127.0.0.1:3001

// === Helpers ===
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
async function retry(fn, attempts, backoffMs) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(i); } catch (e) { lastErr = e; await sleep(backoffMs * (i + 1)); }
  }
  throw lastErr;
}
function urlWithHost(u, hostLike) {
  try {
    const url = new URL(u);
    const [proto, , port] = (url.host.match(/^(.+?):\/\/|$/), [], url.port);
    const alt = new URL(u);
    const newHost = hostLike.includes('://') ? new URL(hostLike).host : hostLike;
    alt.host = newHost;
    return alt.toString();
  } catch { return u; }
}
function firstBytesOf(text) { return (text || '').slice(0, 200).replace(/\s+/g, ' ').trim(); }


// Your exact defaults (run-as-is)
const DEFAULTS = {
  renderApi: 'https://rakie-backend.onrender.com',
  siteOrigin: 'https://rakiesalon.com',
  frontOrigin: 'http://localhost:3001',
  reviewsFile: path.join('apps', 'site', 'public', 'data', 'reviews.top3.json'),
  servicesFile: path.join('apps', 'site', 'public', 'data', 'services.json'),
  pingPath: '/ping',
  reviewsPath: '/api/google-reviews?limit=3&offset=0&circular=0',
  servicesPath: '/api/services',
  httpTimeoutMs: 8000,
};

const cfg = {
  renderApi: args['render-api'] || process.env.RENDER_API_BASE || DEFAULTS.renderApi,
  siteOrigin: args['site-origin'] || DEFAULTS.siteOrigin,
  frontOrigin: args['front-origin'] || DEFAULTS.frontOrigin,
  reviewsFile: args['reviews-file'] || DEFAULTS.reviewsFile,
  servicesFile: args['services-file'] || DEFAULTS.servicesFile,
  pingPath: args['ping-path'] || DEFAULTS.pingPath,
  reviewsPath: args['reviews-path'] || DEFAULTS.reviewsPath,
  servicesPath: args['services-path'] || DEFAULTS.servicesPath,
  httpTimeoutMs: Number(args['http-timeout']) || DEFAULTS.httpTimeoutMs,
};

const TEST_RESET = 'test-reset' in args;

// -----------------------------
// Output helpers
// -----------------------------
const CHECKS = [];
const PAD = 26;
const dash = (n) => '-'.repeat(n);
const line = (m='') => console.log(m);
const p = (k,v) => console.log(`${k.padEnd(PAD)}: ${v}`);
const ok = (m) => console.log(`✅  ${m}`);
const warn = (m) => console.warn(`⚠️   ${m}`);
const fail = (m) => console.error(`❌  ${m}`);

// -----------------------------
// HTTP helpers (Node 18+ global fetch)
// -----------------------------
async function withTimeout(promiseFactory, ms, abortMsg='Timed out') {
  const ctrl = new AbortController();
  const id = setTimeout(() => ctrl.abort(abortMsg), ms);
  try {
    return await promiseFactory(ctrl.signal);
  } finally { clearTimeout(id); }
}
const httpGet = (url, headers={}) =>
  withTimeout(signal => fetch(url, { method: 'GET', headers, signal }), cfg.httpTimeoutMs);
const httpOptions = (url, headers={}) =>
  withTimeout(signal => fetch(url, { method: 'OPTIONS', headers, signal }), cfg.httpTimeoutMs);

function readJSON(filePath) {
  const full = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(full)) throw new Error(`File not found: ${full}`);
  const s = fs.readFileSync(full, 'utf8');
  try { return JSON.parse(s); } catch (e) { throw new Error(`Invalid JSON in ${filePath}: ${e.message}`); }
}

async function requireJSONResponse(res, what) {
  if (!res.ok) throw new Error(`${what}: HTTP ${res.status}`);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  if (!ct.includes('json')) {
    const first = await res.text().then(t => t.slice(0,120)).catch(()=> '');
    throw new Error(`${what}: Expected JSON, got ${ct || 'unknown'}; first bytes: ${first}`);
  }
  return res.json();
}

// -----------------------------
// Shape heuristics
// -----------------------------
// Replace looksLikeReviews with this:
function looksLikeReviews(payload) {
  // Normalize to an array if possible
  let arr = null;

  if (Array.isArray(payload)) {
    arr = payload;
  } else if (payload && typeof payload === 'object') {
    // common wrappers
    if (Array.isArray(payload.items)) arr = payload.items;
    else if (Array.isArray(payload.reviews)) arr = payload.reviews;
    else if (Array.isArray(payload.results)) arr = payload.results;
    else if (Array.isArray(payload.data)) arr = payload.data;
  }

  if (!arr) return false;
  if (arr.length === 0) return true;

  // Heuristic: a review-like object has text &/or author-ish keys
  const sample = arr[0] || {};
  const keys = Object.keys(sample);
  const hasText = keys.some(k => /text|review|content|body|description/i.test(k));
  const hasAuthor = keys.some(k => /author|name|user|profile/i.test(k));
  const hasRating = keys.some(k => /rating|stars/i.test(k));

  return hasText || (hasAuthor && hasRating);
}

// Replace looksLikeServices with this:
function looksLikeServices(payload) {
  // Allow:
  // 1) Array of services
  // 2) { services: [...] } or { data: [...] }
  // 3) Category map: { "Color": [...], "Haircut": [...] }
  let arr = null;

  if (Array.isArray(payload)) {
    arr = payload;
  } else if (payload && typeof payload === 'object') {
    if (Array.isArray(payload.services)) arr = payload.services;
    else if (Array.isArray(payload.data)) arr = payload.data;
    else {
      // Category map: collect arrays under string keys
      const maybeArrays = Object.values(payload).filter(v => Array.isArray(v));
      if (maybeArrays.length && maybeArrays.every(v => Array.isArray(v))) {
        arr = maybeArrays.flat();
      }
    }
  }

  if (!arr) return false;
  if (arr.length === 0) return true;

  // Heuristic: a service has name, and at least one of category/price/duration
  const s = arr[0] || {};
  const keys = Object.keys(s);
  const hasName = keys.includes('name');
  const hasAny = ['category', 'price', 'duration'].some(k => keys.includes(k));
  return hasName && hasAny;
}

function briefShape(value) {
  try {
    if (Array.isArray(value)) return `Array(len=${value.length})`;
    if (value && typeof value === 'object') {
      const k = Object.keys(value);
      return `Object(keys=${k.slice(0,8).join(',')}${k.length>8?'…':''})`;
    }
    return typeof value;
  } catch { return 'unknown'; }
}


// -----------------------------
// Check recorder
// -----------------------------
function recordCheck({ id, description, required, passed, details }) {
  CHECKS.push({ id, description, required, passed, details });
  if (passed) ok(description);
  else if (required) fail(`${description}${details ? ` — ${details}` : ''}`);
  else warn(`${description}${details ? ` — ${details}` : ''}`);
}

// -----------------------------
// Individual checks
// -----------------------------
async function checkSiteCORS() {
  const url = new URL(cfg.reviewsPath, cfg.renderApi).toString();
  try {
    const res = await httpOptions(url, {
      'Origin': cfg.siteOrigin,
      'Access-Control-Request-Method': 'GET',
      'Access-Control-Request-Headers': 'content-type',
    });
    const allow = res.headers.get('access-control-allow-origin');
    const methods = (res.headers.get('access-control-allow-methods') || '').toUpperCase();
    const okOrigin = allow === '*' || (allow && allow.includes(cfg.siteOrigin));
    const okMethods = methods.includes('GET');
    recordCheck({
      id: 'cors-site-render',
      description: 'Site communicates to Render through CORS (preflight passes)',
      required: true,
      passed: okOrigin && okMethods,
      details: okOrigin && okMethods ? '' : `Allow-Origin="${allow || ''}", Allow-Methods="${methods || ''}"`
    });
  } catch (e) {
    recordCheck({
      id: 'cors-site-render',
      description: 'Site communicates to Render through CORS (preflight passes)',
      required: true,
      passed: false,
      details: e.message
    });
  }
}

async function checkFrontRootUp(origin) {
  const url = new URL('/', origin).toString();
  const started = Date.now();
  try {
    const res = await httpGet(url);
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    const ms = Date.now() - started;
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Dev servers usually serve HTML on root
    const isHtml = ct.includes('text/html');
    recordCheck({
      id: 'front-native-root',
      description: `Frontend root reachable (${origin})`,
      required: false,
      passed: isHtml || res.ok,
      details: isHtml ? `HTML ${ms}ms` : `CT=${ct} ${ms}ms`
    });
    return true;
  } catch (e) {
    recordCheck({
      id: 'front-native-root',
      description: `Frontend root reachable (${origin})`,
      required: false,
      passed: false,
      details: e.message
    });
    return false;
  }
}

async function probeFrontJsonOnce(fullUrl) {
  const started = Date.now();
  const res = await httpGet(fullUrl);
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  const ms = Date.now() - started;
  if (!res.ok) throw new Error(`HTTP ${res.status} from ${fullUrl}`);
  if (!ct.includes('json')) {
    const snippet = firstBytesOf(await res.text());
    // If we got HTML, it’s typically the SPA index.html → proxy missing on /api/*
    if (ct.includes('text/html') || /^<!doctype html/i.test(snippet)) {
      throw new Error(`HTML fallback instead of JSON (proxy missing?) from ${fullUrl}; first bytes: ${snippet}`);
    }
    throw new Error(`Expected JSON, got CT=${ct} from ${fullUrl}; first bytes: ${snippet}`);
  }
  return { ms, ct };
}

async function checkFrontendNativeDeep() {
  if (SKIP_FRONT_NATIVE) {
    recordCheck({
      id: 'front-native',
      description: 'Frontend communicates as native (same-origin services endpoint returns JSON)',
      required: false,
      passed: true,
      details: 'Skipped by --skip-front-native'
    });
    return;
  }

  // Candidate origins: primary + optional alt (127.0.0.1)
  const origins = [cfg.frontOrigin];
  const urlObj = new URL(cfg.frontOrigin);
  const defaultAlt = (urlObj.hostname === 'localhost') ? `${urlObj.protocol}//127.0.0.1:${urlObj.port || ''}` : '';
  if (FRONT_ORIGIN_ALT) origins.push(FRONT_ORIGIN_ALT);
  else if (defaultAlt) origins.push(defaultAlt);

  // 0) Root reachability for each origin (not required)
  for (const o of origins) {
    await checkFrontRootUp(o);
  }

  // 1) /api/services must return JSON (this is your main native check)
  let servicesOk = false, servicesDetail = '';
  for (const origin of origins) {
    const servicesUrl = new URL(cfg.servicesPath, origin).toString();
    try {
      const result = await retry(() => probeFrontJsonOnce(servicesUrl), FRONT_NATIVE_RETRIES, FRONT_NATIVE_BACKOFF_MS);
      servicesOk = true;
      servicesDetail = `${origin} ${result.ms}ms`;
      break;
    } catch (e) {
      servicesDetail = e.message;
    }
  }
  recordCheck({
    id: 'front-native-services',
    description: 'Frontend native: /api/services returns JSON',
    required: false,
    passed: servicesOk,
    details: servicesOk ? servicesDetail : servicesDetail
  });

  // 2) Also probe reviews path via same-origin to catch route/proxy blips from a different angle
  let reviewsOk = false, reviewsDetail = '';
  for (const origin of origins) {
    const reviewsUrl = new URL(cfg.reviewsPath, origin).toString();
    try {
      const result = await retry(() => probeFrontJsonOnce(reviewsUrl), FRONT_NATIVE_RETRIES, FRONT_NATIVE_BACKOFF_MS);
      reviewsOk = true;
      reviewsDetail = `${origin} ${result.ms}ms`;
      break;
    } catch (e) {
      reviewsDetail = e.message;
    }
  }
  recordCheck({
    id: 'front-native-reviews',
    description: 'Frontend native: reviews endpoint returns JSON',
    required: false,
    passed: reviewsOk,
    details: reviewsOk ? reviewsDetail : reviewsDetail
  });

  // 3) Summary pass/fail for legacy “front-native” line
  recordCheck({
    id: 'front-native',
    description: 'Frontend communicates as native (same-origin services endpoint returns JSON)',
    required: false,
    passed: servicesOk,
    details: servicesOk ? 'OK' : 'See front-native-services/reviews checks above'
  });
}

async function checkCron204() {
  const url = new URL(cfg.pingPath, cfg.renderApi).toString();
  try {
    const res = await httpGet(url);
    recordCheck({
      id: 'cron-204',
      description: 'Cron/health endpoint returns 204 No Content',
      required: true,
      passed: res.status === 204,
      details: res.status === 204 ? '' : `HTTP ${res.status}`
    });
  } catch (e) {
    recordCheck({
      id: 'cron-204',
      description: 'Cron/health endpoint returns 204 No Content',
      required: true,
      passed: false,
      details: e.message
    });
  }
}

async function checkTestimonialsToRender() {
  const url = new URL(cfg.reviewsPath, cfg.renderApi).toString();
  try {
    const data = await requireJSONResponse(await httpGet(url), 'Testimonials→Render');
    if (!looksLikeReviews(data)) throw new Error('Response JSON does not look like reviews data.');
    recordCheck({
      id: 'testimonials-render',
      description: 'Testimonials.jsx communicates successfully to Render',
      required: true,
      passed: true
    });
  } catch (e) {
  recordCheck({
    id: 'testimonials-render',
    description: 'Testimonials.jsx communicates successfully to Render',
    required: true,
    passed: false,
    details: e.message
  });
}

}

function checkTestimonialsFromFile() {
  try {
    const data = readJSON(cfg.reviewsFile);
if (!looksLikeReviews(data)) {
  throw new Error(`Response JSON does not look like reviews data. Shape: ${briefShape(data)}`);
}
    recordCheck({
      id: 'testimonials-file',
      description: 'Testimonials.jsx reads successfully from a file',
      required: true,
      passed: true
    });
  } catch (e) {
    recordCheck({
      id: 'testimonials-file',
      description: 'Testimonials.jsx reads successfully from a file',
      required: true,
      passed: false,
      details: e.message
    });
  }
}

async function checkServicesToRender() {
  const url = new URL(cfg.servicesPath, cfg.renderApi).toString();
  try {
    const data = await requireJSONResponse(await httpGet(url), 'Services→Render');
    if (!looksLikeServices(data)) throw new Error('Response JSON does not look like services data.');
    recordCheck({
      id: 'services-render',
      description: 'Services.jsx communicates successfully to Render',
      required: true,
      passed: true
    });
  } catch (e) {
    recordCheck({
      id: 'services-render',
      description: 'Services.jsx communicates successfully to Render',
      required: true,
      passed: false,
      details: e.message
    });
  }
}

function checkServicesFromFile() {
  try {
    const data = readJSON(cfg.servicesFile);
    if (!looksLikeServices(data)) throw new Error('File JSON does not look like services data.');
    recordCheck({
      id: 'services-file',
      description: 'Services.jsx reads successfully from a file',
      required: true,
      passed: true
    });
  } catch (e) {
    recordCheck({
      id: 'services-file',
      description: 'Services.jsx reads successfully from a file',
      required: true,
      passed: false,
      details: e.message
    });
  }
}

function scanServiceFiles() {
  const candidates = [];
  function walk(dir) {
    if (!fs.existsSync(dir)) return;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (['node_modules','dist','build','.git'].includes(entry.name)) continue;
        walk(full);
      } else {
        const n = entry.name.toLowerCase();
        if (n === 'service.js' || n === 'services.js' || n === 'api.js') candidates.push(full);
      }
    }
  }
  walk(path.resolve(process.cwd()));
  const results = candidates.map(f => {
    try {
      const s = fs.readFileSync(f, 'utf8');
      const ok =
        (/NODE_ENV/.test(s) && /production/.test(s)) ||
        (/process\.env/.test(s) && /production/.test(s)) ||
        (/location\.hostname/.test(s) && /(rakiesalon\.com|onrender\.com)/.test(s)) ||
        (/API_BASE/.test(s) && /(https?:\/\/)/.test(s));
      return { file: f, ok };
    } catch { return { file: f, ok: false }; }
  });
  const anyOk = results.some(r => r.ok);
  if (results.length === 0) {
    recordCheck({
      id: 'servicejs-prod',
      description: 'service.js handles production environment',
      required: true,
      passed: false,
      details: 'No candidate service/api files found'
    });
  } else if (!anyOk) {
    recordCheck({
      id: 'servicejs-prod',
      description: 'service.js handles production environment',
      required: true,
      passed: false,
      details: results.map(r => `No prod guard in: ${path.relative(process.cwd(), r.file)}`).join(' | ')
    });
  } else {
    recordCheck({
      id: 'servicejs-prod',
      description: 'service.js handles production environment',
      required: true,
      passed: true
    });
  }
}

// -----------------------------
// Runner + Summary
// -----------------------------
function printHeader(title) {
  line();
  console.log(`🔎 ${title}`);
  p('Render API', cfg.renderApi);
  p('Site Origin', cfg.siteOrigin);
  p('Frontend Origin', cfg.frontOrigin);
  p('Ping Path', cfg.pingPath);
  p('Reviews Path', cfg.reviewsPath);
  p('Services Path', cfg.servicesPath);
  p('Reviews File', cfg.reviewsFile);
  p('Services File', cfg.servicesFile);
  p('Front Retries', FRONT_NATIVE_RETRIES);
  p('Front Backoff (ms)', FRONT_NATIVE_BACKOFF_MS);
  if (FRONT_ORIGIN_ALT) p('Front Alt Origin', FRONT_ORIGIN_ALT);
  line();
}

function printSummary(exitOnRequiredFailures = true) {
  line('\n— Summary —');
  const rows = CHECKS.map(c => ({
    id: c.id,
    status: c.passed ? 'PASS' : (c.required ? 'FAIL' : 'WARN'),
    description: c.description,
    details: c.details || ''
  }));
  const maxId = Math.max(...rows.map(r => r.id.length), 2);
  const maxStatus = 6;
  const maxDesc = Math.max(...rows.map(r => r.description.length), 20);
  const pad = (s,n) => (s || '').padEnd(n,' ');
  console.log(pad('ID', maxId), pad('STATUS', maxStatus), pad('DESCRIPTION', maxDesc), 'DETAILS');
  console.log(dash(maxId), dash(maxStatus), dash(maxDesc), '-------');
  for (const r of rows) console.log(pad(r.id, maxId), pad(r.status, maxStatus), pad(r.description, maxDesc), r.details);

  const requiredFailed = CHECKS.filter(c => c.required && !c.passed);
  line();
  if (requiredFailed.length > 0) {
    fail(`${requiredFailed.length} required check(s) failed.`);
    if (exitOnRequiredFailures) process.exit(1);
    return false;
  } else {
    ok('All required checks passed.');
    return true;
  }
}

async function runAllChecks() {
  CHECKS.length = 0;
  await checkSiteCORS();         // (1)
  await checkFrontendNativeDeep();   // (2) optional, now multi-angle
  await checkCron204();          // (3)
  await checkTestimonialsToRender(); // (4)
  checkTestimonialsFromFile();   // (5)
  await checkServicesToRender(); // (6)
  checkServicesFromFile();       // (7)
  scanServiceFiles();            // (8)
}

function mutateForFailure() {
  // Create obviously-bad values to trigger failures
  return {
    renderApi: 'https://rakie-backend.onrender.comm', // typo TLD
    siteOrigin: 'https://bad.rakiesalon.com',
    frontOrigin: 'http://localhost:9', // unlikely to serve
    reviewsFile: cfg.reviewsFile + '.missing',
    servicesFile: cfg.servicesFile + '.missing',
    pingPath: '/bad-ping',
    reviewsPath: '/api/google-reviewz', // wrong path
    servicesPath: '/api/servicez',      // wrong path
  };
}

async function main() {
  if (TEST_RESET) {
    // Phase A: mutate → expect failures (do not exit here)
    const original = { ...cfg };
    const bad = mutateForFailure();
    Object.assign(cfg, bad);
    printHeader('Sanity Check (TEST PHASE – expect failures)');
    await runAllChecks();
    printSummary(false); // don’t exit on failures in test phase

    // Phase B: reset → expect pass (enforce exit code)
    Object.assign(cfg, original);
    printHeader('Sanity Check (RESET PHASE – real values)');
    await runAllChecks();
    const okFinal = printSummary(true);
    process.exit(okFinal ? 0 : 1);
  } else {
    // Normal single pass
    printHeader('Sanity Check (default config)');
    await runAllChecks();
    const okFinal = printSummary(true);
    process.exit(okFinal ? 0 : 1);
  }
}

main().catch(e => {
  fail(`Unhandled error: ${e?.stack || e?.message || e}`);
  process.exit(2);
});
