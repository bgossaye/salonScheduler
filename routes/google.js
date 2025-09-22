// routes/google.js  (CommonJS)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

// ---------- storage ----------
const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_FILE = path.join(DATA_DIR, "google-reviews.json");
const SEED_FILE  = path.join(DATA_DIR, "google-reviews.seed.json");

function ensureDir(p) { if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true }); }

function readJson(file, fallback = {}) {
  try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch { return fallback; }
}
function writeJson(file, obj) {
  ensureDir(path.dirname(file));
  fs.writeFileSync(file, JSON.stringify(obj, null, 2));
}

// ---------- normalize ----------
function normalize(g) {
  const key = `${g.author_url || g.author_name || ""}|${g.time}|${g.text || ""}`;
  const id = crypto.createHash("sha1").update(key).digest("hex");
  return {
    id,
    author: g.author_name,
    avatar: g.profile_photo_url,
    rating: g.rating,
    text: g.text,
    time: (g.time || 0) * 1000, // epoch seconds -> ms
    url: g.author_url || null,
    relativeTime: g.relative_time_description || "",
  };
}

// ---------- fetch from Google (≈ 5 newest) ----------
async function fetchNewestFromGoogle() {
  const placeId = process.env.GOOGLE_PLACE_ID;
  const key = process.env.GOOGLE_PLACES_API_KEY;
  const url =
    `https://maps.googleapis.com/maps/api/place/details/json?` +
    `place_id=${encodeURIComponent(placeId)}` +
    `&fields=reviews,user_ratings_total,rating` +
    `&reviews_sort=newest` +
    `&key=${encodeURIComponent(key)}`;

  const r = await fetch(url);
  const j = await r.json();
  const raw = j?.result?.reviews || [];
  return raw.map(normalize);
}

// ---------- handler with circular pagination ----------
async function googleReviewsHandler(req, res) {
  try {
    const limit = Math.min(parseInt(req.query.limit || "3", 10), 500); // how many to return
    const offset = Math.max(parseInt(req.query.offset || "0", 10), 0); // where to start
    const circular = String(req.query.circular || "1") === "1" || String(req.query.circular).toLowerCase() === "true";

    // Load previous + seed + fresh (~5)
    const cached = readJson(CACHE_FILE, { reviews: [] }).reviews;
    const seeds  = readJson(SEED_FILE,  { reviews: [] }).reviews; // optional seed file (see below)
    const fresh  = await fetchNewestFromGoogle();

    // Merge, prefer the newest copy for duplicates
    const map = new Map([...seeds, ...cached].map(r => [r.id, r]));
    for (const r of fresh) map.set(r.id, r);

    // Sort newest -> oldest and persist cache
    const all = Array.from(map.values()).sort((a, b) => b.time - a.time);
    writeJson(CACHE_FILE, { reviews: all });

    // Build page (circular wrap if asked)
    let page = [];
    if (!all.length) {
      page = [];
    } else if (!circular) {
      page = all.slice(offset, offset + limit);
    } else {
      const start = offset % all.length;
      if (start + limit <= all.length) {
        page = all.slice(start, start + limit);
      } else {
        const endCount = (start + limit) - all.length;
        page = [...all.slice(start), ...all.slice(0, endCount)];
      }
    }

    res.set("Cache-Control", "public, max-age=60");
    res.json({
      placeId: process.env.GOOGLE_PLACE_ID,
      total: all.length,     // how many we have overall
      offset,                // where this page started
      limit,                 // how many we returned
      circular,              // whether wrapping was applied
      reviews: page,
    });
  } catch (err) {
    console.error("[google-reviews]", err);
    res.status(500).json({ message: "Failed to load reviews" });
  }
}

module.exports = { googleReviewsHandler };
