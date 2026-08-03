import { useEffect, useMemo, useState, useRef } from "react";
import { FcGoogle } from "react-icons/fc";
import { API } from "../utils/api";

const ENV = window.ENV || {};
const SAVED_TOP_KEY = "savedGoogleReviews_v3";
const BACKUP_COUNT = 6;
const SHARE_ALL_URL = "https://share.google/qqP2bnE322Lwpkz08";
const RAW_REVIEWS_PATH = ENV.REVIEWS_PATH || "/api/google-reviews";
const REVIEWS_PATH = (() => {
  const s = String(RAW_REVIEWS_PATH || "");
  // if it's absolute or "https//" / "http//", parse and keep only pathname
  if (/^https?:\/\//i.test(s) || /^https\/\//i.test(s) || /^http\/\//i.test(s)) {
    try {
      const fixed = s.replace(/^https\/\//i, "https://").replace(/^http\/\//i, "http://");
      const u = new URL(fixed);
      return u.pathname || "/api/google-reviews";
    } catch { return "/api/google-reviews"; }
  }
  // ensure it starts with a slash
  return s.startsWith("/") ? s : `/${s}`;
})();

// Optional: warn once if we auto-fixed a bad proto like "https//"
if (/^https\/\//i.test(ENV.API_BASE || "") || /^https\/\//i.test(REVIEWS_PATH)) {
  console.warn("[Testimonials] Fixed malformed URL (missing colon in https://). Check your ENV.API_BASE or REVIEWS_PATH.");
}

// --- FORCE LOCAL (env, URL, localStorage) — evaluate at call time ---
function isForceLocalReviews() {
  try {
    const v = window.ENV?.FORCE_LOCAL_REVIEWS;
    if (v != null) {
      const s = String(v).toLowerCase();
      if (s === "false") return false;
      if (["1","true","yes",""].includes(s)) return true;
    }
  } catch {""}
  try {
    const qs = new URLSearchParams(location.search);
    if (qs.has("localReviews")) {
      const s = (qs.get("localReviews") || "").toLowerCase();
      if (["1","true","yes",""].includes(s)) return true;
    }
  } catch {""}
  try {
    const ls = localStorage.getItem("forceLocalReviews");
    if (ls != null && ["1","true","yes"].includes(ls.toLowerCase())) return true;
  } catch {""}
  return false;
}

// one-time logger so we don't spam
function useForceLocalReviewsLogger() {
  const didLog = useRef(false);
  useEffect(() => {
    if (isForceLocalReviews() && !didLog.current) {
      console.info("[Testimonials] Using LOCAL reviews because FORCE_LOCAL_REVIEWS is enabled (env/URL/localStorage).");
      didLog.current = true;
    }
  }, []);
}

// Read the newest successful network snapshot first when live loading fails.
function loadSavedReviews() {
  try {
    const raw = localStorage.getItem(SAVED_TOP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed?.items) || !parsed.items.length) return null;
    console.info(`[Testimonials] Loaded ${parsed.items.length} reviews from the last successful live response.`);
    return { reviews: parsed.items, placeId: parsed?.placeId || "" };
  } catch {
    return null;
  }
}

function saveReviewBackup(reviews, placeId) {
  if (!Array.isArray(reviews) || !reviews.length) return;
  try {
    localStorage.setItem(
      SAVED_TOP_KEY,
      JSON.stringify({
        ts: Date.now(),
        placeId: placeId || "",
        items: reviews.slice(0, BACKUP_COUNT),
      })
    );
  } catch {
    // Storage can be unavailable in private/restricted browser modes.
  }
}

async function loadStaticReviews() {
  const candidates = [
    new URL("data/reviews.top3.json", document.baseURI).toString(),
    new URL("data/reviews.json", document.baseURI).toString(),
  ];

  for (const url of candidates) {
    try {
      const response = await fetch(url, { cache: "no-store" });
      if (!response.ok) continue;
      const json = await response.json();
      const items = Array.isArray(json?.items)
        ? json.items
        : Array.isArray(json?.reviews)
          ? json.reviews
          : [];
      if (items.length) {
        console.info(`[Testimonials] Loaded ${items.length} reviews from static fallback: ${url}`);
        return { reviews: items, placeId: json?.placeId || "" };
      }
    } catch {
      // Try the next fallback file.
    }
  }

  throw new Error("No static reviews available");
}

function sortNewestFirst(items) {
  return [...items].sort((a, b) => {
    const valueA = a?.time ?? a?.updateTime ?? a?.createTime ?? a?.publishTime ?? a?.timestamp;
    const valueB = b?.time ?? b?.updateTime ?? b?.createTime ?? b?.publishTime ?? b?.timestamp;
    const ta = typeof valueA === "number" ? valueA * (valueA < 1e12 ? 1000 : 1) : Date.parse(valueA || "");
    const tb = typeof valueB === "number" ? valueB * (valueB < 1e12 ? 1000 : 1) : Date.parse(valueB || "");
    if (Number.isFinite(tb) && Number.isFinite(ta)) return tb - ta;
    if (Number.isFinite(tb)) return 1;
    if (Number.isFinite(ta)) return -1;
    return 0;
  });
}

let reviewsRequestInFlight = null;
async function fetchLiveReviews() {
  if (reviewsRequestInFlight) return reviewsRequestInFlight;

  reviewsRequestInFlight = (async () => {
    const data = await API.getJSONQ(
      REVIEWS_PATH,
      { limit: 500, circular: 0, offset: 0, _ts: Date.now() },
      { credentials: "omit", cache: "no-store" }
    );

    const items = Array.isArray(data?.reviews)
      ? data.reviews
      : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
          ? data
          : [];

    const reviews = sortNewestFirst(items);
    const source = data?.source || "unknown";
    const fetchedAt = data?.fetchedAt || null;
    const isFreshGoogle = source === "google-live" && data?.stale !== true;
    const result = { reviews, placeId: data?.placeId || "", source, fetchedAt };

    // Only a confirmed fresh Google response may replace the browser backup.
    if (isFreshGoogle) {
      saveReviewBackup(reviews, result.placeId);
    }

    const newest = reviews[0];
    console.info("[Testimonials] Reviews response", {
      source,
      fetchedAt,
      received: reviews.length,
      newestAuthor: newest ? getAuthorName(newest) : null,
      newestTime: newest?.time || newest?.updateTime || newest?.createTime || null,
      browserBackupRefreshed: isFreshGoogle,
    });
    return result;
  })();

  try {
    return await reviewsRequestInFlight;
  } finally {
    reviewsRequestInFlight = null;
  }
}

async function loadFallbackReviews() {
  const saved = loadSavedReviews();
  if (saved) return saved;
  return loadStaticReviews();
}

const pick = v => (typeof v === "string" && v.trim()) ? v.trim() : undefined;

function getAuthorName(r) {
  return (
    pick(r.authorName) ||
    pick(r.author_name) ||
    pick(r.author) ||                           // <-- your current API field
    pick(r.profileName) ||
    pick(r.reviewer?.displayName) ||
    pick(r.authorAttribution?.displayName) ||
    pick(r.user?.name) ||
    "Google User"
  );
}

function getAuthorPhoto(r) {
  return (
    pick(r.authorPhoto) ||
    pick(r.avatar) ||                           // <-- your current API field
    pick(r.profile_photo_url) ||
    pick(r.author_photo_url) ||
    pick(r.photo_url) ||
    pick(r.reviewer?.profilePhotoUrl) ||
    pick(r.authorAttribution?.photoUri) ||
    pick(r.user?.photoUrl) || pick(r.user?.photo) ||
    "https://lh3.googleusercontent.com/a/default-user=s64-c"
  );
}


export default function Testimonials() {
  const [reviews, setReviews] = useState([]);
  const [placeId, setPlaceId] = useState("");
  const [offset, setOffset] = useState(0); // start index of the current page
  const [expanded, setExpanded] = useState({}); // { [idx]: true }
  const [offlineMode, setOfflineMode] = useState(false);

  const chunk = 3;

  useForceLocalReviewsLogger();
useEffect(() => {
  let cancelled = false;

  const applyReviews = ({ reviews: nextReviews, placeId: nextPlaceId, source }, isFallback) => {
    if (cancelled) return;
    setReviews(Array.isArray(nextReviews) ? nextReviews.slice(0, 50) : []);
    setOffset(0);
    if (nextPlaceId) setPlaceId(nextPlaceId);
    setOfflineMode(isFallback || (source && source !== "google-live"));
  };

  const load = async () => {
    if (ENV.WAKE_ON_LOAD) API.wake();

    if (isForceLocalReviews()) {
      try {
        applyReviews(await loadFallbackReviews(), true);
      } catch (error) {
        console.warn("Testimonials local fallback failed:", error);
      }
      return;
    }

    try {
      // Always attempt a fresh network request first.
      applyReviews(await fetchLiveReviews(), false);
    } catch (error) {
      console.warn("Testimonials live load failed; using the latest saved backup:", error);
      try {
        applyReviews(await loadFallbackReviews(), true);
      } catch (fallbackError) {
        console.warn("Testimonials fallback also failed:", fallbackError);
      }
    }
  };

  load();

  // Refresh after returning to the tab if the page has been open for a while.
  let lastRefresh = Date.now();
  const handleVisibility = async () => {
    if (document.visibilityState !== "visible" || isForceLocalReviews()) return;
    if (Date.now() - lastRefresh < 5 * 60 * 1000) return;
    lastRefresh = Date.now();
    try {
      applyReviews(await fetchLiveReviews(), false);
    } catch {
      // Keep currently displayed reviews; do not replace them with older data.
    }
  };

  document.addEventListener("visibilitychange", handleVisibility);
  return () => {
    cancelled = true;
    document.removeEventListener("visibilitychange", handleVisibility);
  };
}, []);

  // Visible 3 reviews; wrap-around if near the end
  const visible = useMemo(() => {
    if (reviews.length <= chunk) return reviews.slice(0, chunk);
    const end = offset + chunk;
    return end <= reviews.length
      ? reviews.slice(offset, end)
      : [...reviews.slice(offset), ...reviews.slice(0, end - reviews.length)];
  }, [reviews, offset]);

  const handleLoadMore = () => {
    if (!reviews.length) return;
    setOffset((prev) => (prev + chunk) % reviews.length); // paginate; wrap to newest
    setExpanded({});
  };

  const toggleExpand = (globalIndex) => {
    setExpanded((s) => ({ ...s, [globalIndex]: !s[globalIndex] }));
  };

 const writeReviewUrl = placeId
   ? `https://search.google.com/local/writereview?placeid=${encodeURIComponent(placeId)}`
   : SHARE_ALL_URL;

  return (
    <section className="bg-[#FAF0CA]">
      {/* Slimmed down padding and container */}
      <div className="mx-auto max-w-6xl px-4 py-6">
        <div className="flex items-center justify-between gap-4">
          {/* Status + Title */}
          <div className="flex flex-col">
            <div
              className={`text-xs font-medium mb-1 ${
                offlineMode ? 'text-amber-700' : 'text-emerald-700'
              }`}
            >
              {offlineMode ? 'G reviews' : <>Live <FcGoogle className="inline h-4 w-4 align-text-bottom" /> feed</>}
            </div>
            <h2 className="flex items-center gap-2 text-2xl font-semibold text-[#0D3B66]">
              What clients are saying
            </h2>
         </div>

          <div className="flex items-center gap-3">
   <a
   href={writeReviewUrl}
   target="_blank"
   rel="noopener noreferrer"
   className="rounded-xl bg-[#0D3B66] px-3 py-2 text-sm font-medium text-white shadow hover:brightness-110"
 >
   Write a Google review
 </a>
 {offlineMode ? (
   <a
     href={SHARE_ALL_URL}
     target="_blank"
     rel="noopener noreferrer"
     className="rounded-xl border border-[#0D3B66]/30 px-3 py-2 text-sm font-medium text-[#0D3B66] hover:bg-white"
   >
     All Reviews
   </a>
 ) : (
   <button
     type="button"
     onClick={handleLoadMore}
     className="rounded-xl border border-[#0D3B66]/30 px-3 py-2 text-sm font-medium text-[#0D3B66] hover:bg-white"
   >
     Load more
   </button>
 )}
          </div>
        </div>

        {/* Tighter grid and card spacing */}
        <div className="mt-4 grid gap-4 md:grid-cols-3">
          {(visible.length ? visible : Array.from({ length: 3 })).map((r, i) => {
 const globalIndex = reviews.length ? (offset + i) % reviews.length : i;
            const isExpanded = !!expanded[globalIndex];

            if (!r) {
              return (
                <figure key={`skeleton-${i}`} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                  <div className="h-4 w-24 animate-pulse rounded bg-slate-200" />
                  <div className="mt-3 h-4 w-full animate-pulse rounded bg-slate-200" />
                  <div className="mt-2 h-4 w-5/6 animate-pulse rounded bg-slate-200" />
                  <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-slate-200" />
                </figure>
              );
            }

 const authorName = getAuthorName(r);
 const authorPhoto = getAuthorPhoto(r);

const rating = r.rating ?? r.stars ?? 0;
 const text =
   r.text ?? r.description ?? r.reviewText ?? "";
 const relativeTime =
   r.relativeTime ?? r.relative_time ?? r.relativeTimeDescription ?? r.relative_time_description ?? "";
            const showToggle = !!text && text.length > 180;

            return (
              <figure key={`rev-${r.id ?? globalIndex}`} className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-black/5">
                {/* Header */}
                <div className="flex items-center gap-3">
                  <img
   src={authorPhoto}
   alt=""
   referrerPolicy="no-referrer"
   onError={(e) => { e.currentTarget.src = "https://lh3.googleusercontent.com/a/default-user=s64-c"; }}
   className="h-9 w-9 rounded-full object-cover ring-1 ring-black/5"
 />
                  <div>
                    <figcaption className="text-sm font-medium text-slate-800">
                      {authorName}
                    </figcaption>
                    <div className="text-xs text-slate-500">{relativeTime}</div>
                  </div>
                </div>

                {/* Rating + inline Read more/less */}
                <div
                  className="mt-2 flex flex-wrap items-center gap-2"
                  aria-label={`Rating ${rating || 0} out of 5`}
                >
                  <div className="flex items-center gap-1">
                    {Array.from({ length: 5 }).map((_, j) => (
                      <svg
                        key={j}
                        viewBox="0 0 20 20"
                        className={`h-4 w-4 ${j < Math.round(rating || 0) ? "fill-amber-400" : "fill-slate-200"}`}
                      >
                        <path d="M10 15l-5.878 3.09 1.122-6.545L.488 6.91l6.562-.954L10 0l2.95 5.956 6.562.954-4.756 4.635 1.122 6.545z" />
                      </svg>
                    ))}
                    <span className="ml-1 text-xs text-slate-500">{Number(rating || 0).toFixed(1)}</span>
                  </div>

                  {showToggle && (
                    <button
                      type="button"
                      onClick={() => toggleExpand(globalIndex)}
                      className="text-xs font-medium text-[#0D3B66] hover:underline"
                    >
                      {isExpanded ? "Read less" : "Read more"}
                    </button>
                  )}
                </div>

                {/* Quote body */}
                <blockquote className="relative mt-2 text-sm leading-6 text-slate-700">
                  <div className={`${isExpanded ? "" : "max-h-24 overflow-hidden"} transition-all`}>
                    “{text || ""}”
                  </div>
                  {!isExpanded && text && text.length > 180 && (
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-white to-white/0" />
                  )}
                </blockquote>
              </figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}

