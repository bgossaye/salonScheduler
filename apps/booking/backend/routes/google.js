// routes/google.js (CommonJS)
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const DATA_DIR = path.join(process.cwd(), "data");
const CACHE_FILE = path.join(DATA_DIR, "google-reviews.json");
const SEED_FILE = path.join(DATA_DIR, "google-reviews.seed.json");

function ensureDir(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJson(file, fallback = {}) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function writeJsonAtomic(file, value) {
  ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.${Date.now()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2));
  fs.renameSync(temp, file);
}

function normalizeGoogleReview(review) {
  const timeMs = Number(review?.time || 0) * 1000;
  const identity = [
    review?.author_url || review?.author_name || "",
    timeMs || "",
    review?.text || "",
  ].join("|");

  return {
    id: crypto.createHash("sha1").update(identity).digest("hex"),
    author: review?.author_name || "Google User",
    avatar: review?.profile_photo_url || "",
    rating: Number(review?.rating || 0),
    text: review?.text || "",
    time: timeMs,
    url: review?.author_url || null,
    relativeTime: review?.relative_time_description || "",
  };
}

function uniqueNewestFirst(reviews) {
  const byId = new Map();
  for (const review of Array.isArray(reviews) ? reviews : []) {
    if (!review || typeof review !== "object") continue;
    const id = review.id || crypto
      .createHash("sha1")
      .update(`${review.author || ""}|${review.time || ""}|${review.text || ""}`)
      .digest("hex");
    if (!byId.has(id)) byId.set(id, { ...review, id });
  }
  return [...byId.values()].sort((a, b) => Number(b.time || 0) - Number(a.time || 0));
}

async function fetchNewestFromGoogle() {
  const placeId = String(process.env.GOOGLE_PLACE_ID || "").trim();
  const apiKey = String(process.env.GOOGLE_PLACES_API_KEY || "").trim();
  if (!placeId || !apiKey) {
    throw new Error("GOOGLE_PLACE_ID or GOOGLE_PLACES_API_KEY is missing");
  }

  const params = new URLSearchParams({
    place_id: placeId,
    fields: "reviews,user_ratings_total,rating",
    reviews_sort: "newest",
    key: apiKey,
    language: "en",
  });

  const response = await fetch(
    `https://maps.googleapis.com/maps/api/place/details/json?${params.toString()}`,
    { headers: { Accept: "application/json" }, cache: "no-store" }
  );

  if (!response.ok) {
    throw new Error(`Google Places HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload?.status !== "OK") {
    throw new Error(`Google Places ${payload?.status || "UNKNOWN_ERROR"}: ${payload?.error_message || "No details"}`);
  }

  const raw = Array.isArray(payload?.result?.reviews) ? payload.result.reviews : [];
  const reviews = uniqueNewestFirst(raw.map(normalizeGoogleReview));
  if (!reviews.length) throw new Error("Google returned no reviews");

  return {
    reviews,
    businessRating: payload?.result?.rating ?? null,
    userRatingsTotal: payload?.result?.user_ratings_total ?? null,
  };
}

function loadBackup() {
  const cached = readJson(CACHE_FILE, {});
  const cachedReviews = uniqueNewestFirst(cached?.reviews);
  if (cachedReviews.length) {
    return {
      reviews: cachedReviews,
      fetchedAt: cached?.fetchedAt || null,
      businessRating: cached?.businessRating ?? null,
      userRatingsTotal: cached?.userRatingsTotal ?? null,
      source: "server-backup",
    };
  }

  // Seed is emergency-only and is never merged with successful Google data.
  const seeded = readJson(SEED_FILE, {});
  const seedReviews = uniqueNewestFirst(seeded?.reviews);
  if (seedReviews.length) {
    return {
      reviews: seedReviews,
      fetchedAt: seeded?.fetchedAt || null,
      businessRating: seeded?.businessRating ?? null,
      userRatingsTotal: seeded?.userRatingsTotal ?? null,
      source: "seed-fallback",
    };
  }

  return null;
}

function pageReviews(all, offset, limit, circular) {
  if (!all.length) return [];
  if (!circular) return all.slice(offset, offset + limit);

  const count = Math.min(limit, all.length);
  const start = offset % all.length;
  return Array.from({ length: count }, (_, index) => all[(start + index) % all.length]);
}

async function googleReviewsHandler(req, res) {
  const limit = Math.min(Math.max(parseInt(req.query.limit || "6", 10) || 6, 1), 50);
  const offset = Math.max(parseInt(req.query.offset || "0", 10) || 0, 0);
  const circular = ["1", "true"].includes(String(req.query.circular || "0").toLowerCase());

  let snapshot;
  let liveError = null;

  try {
    const live = await fetchNewestFromGoogle();
    const fetchedAt = new Date().toISOString();
    snapshot = {
      ...live,
      source: "google-live",
      fetchedAt,
    };

    // A successful Google response replaces the backup. Old reviews are not merged back in.
    writeJsonAtomic(CACHE_FILE, {
      fetchedAt,
      businessRating: live.businessRating,
      userRatingsTotal: live.userRatingsTotal,
      reviews: live.reviews,
    });
  } catch (error) {
    liveError = error;
    snapshot = loadBackup();
    if (!snapshot) {
      console.error("[google-reviews] live and backup failed:", error);
      return res.status(502).json({
        message: "Google reviews are temporarily unavailable",
        source: "unavailable",
      });
    }
    console.warn(`[google-reviews] ${error.message}; serving ${snapshot.source}`);
  }

  const all = snapshot.reviews;
  const page = pageReviews(all, offset, limit, circular);

  res.set("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
  res.set("Pragma", "no-cache");
  res.set("Expires", "0");
  res.json({
    placeId: process.env.GOOGLE_PLACE_ID || "",
    source: snapshot.source,
    fetchedAt: snapshot.fetchedAt,
    stale: snapshot.source !== "google-live",
    liveError: liveError ? liveError.message : null,
    businessRating: snapshot.businessRating,
    userRatingsTotal: snapshot.userRatingsTotal,
    total: all.length,
    offset,
    limit,
    circular,
    reviews: page,
  });
}

module.exports = { googleReviewsHandler };
