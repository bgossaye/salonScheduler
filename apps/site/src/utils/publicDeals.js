import { useEffect, useState } from 'react';
import { API } from './api';

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const CACHE_KEY = 'rakie-public-deals:v5';

function asText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function uniqueText(values) {
  return [...new Set(values.map(asText).filter(Boolean))];
}

export function normalizePublicDeal(raw = {}) {
  const discountValue = Number(raw.discountValue ?? raw.discountPercent);
  const hasDiscount = Number.isFinite(discountValue) && discountValue > 0;
  const discountType = raw.discountType === 'fixed' ? 'fixed' : 'percent';
  const discountLabel = hasDiscount
    ? (discountType === 'fixed' ? `$${discountValue} off` : `${discountValue}% off`)
    : '';

  const suppliedDays = Array.isArray(raw.validDays)
    ? raw.validDays.map(Number).filter((day) => Number.isInteger(day) && day >= 0 && day <= 6)
    : [];
  const hasDays = raw.displayFields?.validDays ?? suppliedDays.length > 0;
  const dayText = hasDays
    ? (suppliedDays.length === 7
      ? 'Every day'
      : suppliedDays.map((day) => DAY_NAMES[day]).filter(Boolean).join(', '))
    : '';

  const services = uniqueText([
    ...(Array.isArray(raw.eligibleServiceNames) ? raw.eligibleServiceNames : []),
    ...(Array.isArray(raw.services) ? raw.services : []),
  ]);

  const description = asText(raw.description || raw.message);
  const detailsSource = asText(raw.details);
  const details = detailsSource
    ? detailsSource
      .split(/\n|\.(?:\s+|$)/)
      .map((item) => item.trim())
      .filter(Boolean)
    : [];

  const title = asText(
    raw.title
    || raw.name
    || raw.menuLabel
    || raw.appointmentLabel
    || raw.shortLabel
    || raw.description
    || raw.message
    || discountLabel
    || 'Special offer'
  );

  return {
    ...raw,
    id: String(raw._id || raw.id || raw.systemKey || title || Math.random()),
    title,
    description,
    shortLabel: asText(raw.shortLabel),
    menuLabel: asText(raw.menuLabel),
    appointmentLabel: asText(raw.appointmentLabel),
    serviceOnlyLabel: asText(raw.serviceOnlyLabel),
    discountLabel,
    dayText,
    details,
    services,
    rate: discountType === 'percent' && hasDiscount ? discountValue / 100 : 0,
    discountType,
    discountValue: hasDiscount ? discountValue : 0,
    startsOn: asText(raw.startsOn || raw.startDate || raw.validFrom),
    endsOn: asText(raw.endsOn || raw.endDate || raw.validUntil),
  };
}

function extractDeals(payload, seen = new WeakSet()) {
  if (Array.isArray(payload)) return payload.filter((item) => item && typeof item === 'object');
  if (!payload || typeof payload !== 'object') return [];
  if (seen.has(payload)) return [];
  seen.add(payload);

  // Prefer known collection envelopes. Stop after finding the first real deal
  // collection so the same records are not counted again through nested aliases
  // such as data.promotions + promotions + activeDeals.
  const collectionKeys = ['promotions', 'activeDeals', 'deals', 'items', 'results'];
  for (const key of collectionKeys) {
    if (Array.isArray(payload[key])) return payload[key];
  }

  // A generic `data` envelope is common. Recurse into it only when no known
  // top-level collection exists.
  if (payload.data && typeof payload.data === 'object') {
    const nested = extractDeals(payload.data, seen);
    if (nested.length) return nested;
  }

  // Legacy booking-status response.
  for (const key of ['activeDeal', 'promotion', 'deal']) {
    if (payload[key] && typeof payload[key] === 'object') return [payload[key]];
  }

  return [];
}

function dealIdentity(deal) {
  return String(
    deal?._id
    || deal?.id
    || deal?.systemKey
    || [
      deal?.title || deal?.name,
      deal?.startsOn || deal?.startDate || deal?.validFrom,
      deal?.endsOn || deal?.endDate || deal?.validUntil,
      deal?.discountType,
      deal?.discountValue ?? deal?.discountPercent,
    ].join('|')
  );
}

function dedupeFirst(rows) {
  const found = new Map();
  for (const row of rows) {
    const key = dealIdentity(row);
    // Keep the first copy. Canonical /api/promotions/active records must never
    // be overwritten by stale legacy booking-status copies.
    if (!found.has(key)) found.set(key, row);
  }
  return [...found.values()];
}

async function fetchDealSource(path) {
  try {
    const payload = await API.getJSONQ(path, {}, { cache: 'no-store' });
    const rows = extractDeals(payload);
    return { ok: true, path, rows };
  } catch (error) {
    console.warn(`[Rakie site] Deal source unavailable: ${path}`, error);
    return { ok: false, path, rows: [], error };
  }
}

async function fetchPublicDeals() {
  // This endpoint is the single source of truth. It already represents the
  // backend's active/public selection, so the frontend must not re-judge status,
  // dates, enabled flags, stylist scope, tiers, or deal type.
  const canonical = await fetchDealSource('/api/promotions/active');

  if (canonical.ok) {
    const uniqueRows = dedupeFirst(canonical.rows);
    const publicRows = uniqueRows.map(normalizePublicDeal);

    console.info('[Rakie site] Public deals:', {
      source: canonical.path,
      received: canonical.rows.length,
      unique: uniqueRows.length,
      displayed: publicRows.length,
    });
    return publicRows;
  }

  // Backward-compatible fallback only. Never merge this legacy payload into a
  // successful canonical response because it can contain duplicated/stale data.
  const legacy = await fetchDealSource('/api/booking-status');
  const uniqueRows = dedupeFirst(legacy.rows);
  const publicRows = uniqueRows.map(normalizePublicDeal);

  console.info('[Rakie site] Public deals:', {
    source: legacy.path,
    fallback: true,
    received: legacy.rows.length,
    unique: uniqueRows.length,
    displayed: publicRows.length,
  });
  return publicRows;
}

export function usePublicDeals() {
  const [deals, setDeals] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem(CACHE_KEY) || '[]'); } catch { return []; }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchPublicDeals()
      .then((rows) => {
        if (!active) return;
        setDeals(rows);
        try { sessionStorage.setItem(CACHE_KEY, JSON.stringify(rows)); } catch { /* ignore */ }
      })
      .catch((error) => {
        console.error('[Rakie site] Unable to load public deals:', error);
        if (active) setDeals([]);
      })
      .finally(() => active && setLoading(false));
    return () => { active = false; };
  }, []);

  return { deals, loading };
}

function normalizeName(name = '') {
  return String(name).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}

export function getDealForService(service, deals = []) {
  const id = String(service?._id || service?.id || '');
  const name = normalizeName(service?.name || '');
  return deals.find((deal) => {
    if (deal.eligibleServiceIds?.length) return deal.eligibleServiceIds.map(String).includes(id);
    if (deal.services?.length) return deal.services.some((candidateName) => {
      const candidate = normalizeName(candidateName);
      return candidate === name || candidate.includes(name) || name.includes(candidate);
    });
    return true;
  }) || null;
}

export function discountedPriceCents(service, deal) {
  const base = typeof service?.priceCents === 'number' ? service.priceCents : Math.round(Number(service?.price || 0) * 100);
  if (!deal || !deal.discountValue) return base;
  if (deal.discountType === 'fixed') return Math.max(0, base - Math.round(deal.discountValue * 100));
  return Math.round(base * (1 - deal.rate));
}
