import { useEffect, useState } from 'react';
import API from '../api';

export const EMPTY_PROMOTION_CONFIG = {
  enabled: false,
  showClientBadges: true,
  showWorkerBadges: true,
  warnWrongDay: true,
  activeDeal: null,
  activeDeals: [],
};

// Backwards-compatible export name only. It is no longer used as a hardcoded fallback deal.
export const THURSDAY_SPECIAL = null;
export const DEFAULT_PROMOTION_CONFIG = EMPTY_PROMOTION_CONFIG;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

function normalizeServiceName(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizeDeal(rawDeal) {
  const raw = rawDeal && typeof rawDeal === 'object' ? rawDeal : {};
  const discountType = raw.discountType === 'fixed' ? 'fixed' : 'percent';
  const rawDiscount = Number(
    raw.discountValue ??
    raw.discountPercent ??
    (raw.rate !== undefined ? Number(raw.rate) * 100 : 0)
  );
  const discountValue = Number.isFinite(rawDiscount) ? rawDiscount : 0;
  const discountPercent = discountType === 'percent'
    ? discountValue
    : Number(raw.discountPercent ?? 0);

  const validDays = Array.isArray(raw.validDays) && raw.validDays.length
    ? raw.validDays.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [0, 1, 2, 3, 4, 5, 6];

  const deal = {
    ...raw,
    id: String(raw._id || raw.id || ''),
    _id: raw._id ? String(raw._id) : undefined,
    systemKey: raw.systemKey || '',
    enabled: raw.enabled !== false && !['paused', 'archived', 'expired'].includes(raw.status),
    status: raw.status || (raw.enabled === false ? 'paused' : 'active'),
    type: raw.type || (raw.couponCode ? 'coupon' : 'auto'),
    couponCode: raw.couponCode ? String(raw.couponCode).trim().toUpperCase() : '',
    discountType,
    discountValue,
    discountPercent: Number.isFinite(discountPercent) ? discountPercent : 0,
    rate: discountType === 'percent' && Number.isFinite(discountPercent) ? discountPercent / 100 : 0,
    validDays,
    eligibleServiceIds: Array.isArray(raw.eligibleServiceIds)
      ? raw.eligibleServiceIds.map((x) => String(x?._id || x)).filter(Boolean)
      : [],
    eligibleServiceNames: Array.isArray(raw.eligibleServiceNames)
      ? raw.eligibleServiceNames.map(String).filter(Boolean)
      : [],
    eligibleWorkerIds: Array.isArray(raw.eligibleWorkerIds)
      ? raw.eligibleWorkerIds.map((x) => String(x?._id || x)).filter(Boolean)
      : [],
    eligibleTierKeys: Array.isArray(raw.eligibleTierKeys)
      ? raw.eligibleTierKeys.map(String).map((x) => x.toLowerCase()).filter(Boolean)
      : [],
    startsOn: raw.startsOn || '',
    endsOn: raw.endsOn || '',
    showClientBadge: raw.showClientBadge !== false,
    showWorkerBadge: raw.showWorkerBadge !== false,
    warnWrongDay: raw.warnWrongDay !== false,
    isSystemSeed: Boolean(raw.systemKey || raw.isSystemSeed),
  };

  if (!deal.shortLabel) deal.shortLabel = getDealDiscountLabel(deal);
  if (!deal.appointmentLabel) deal.appointmentLabel = `${getDealDiscountLabel(deal)} Deal`;
  if (!deal.menuLabel) deal.menuLabel = deal.title || deal.appointmentLabel;
  if (!deal.serviceOnlyLabel) deal.serviceOnlyLabel = 'Special service';
  if (!deal.details) deal.details = deal.description || '';

  return deal;
}

export function normalizePromotionConfig(rawConfig) {
  const source = rawConfig?.config || rawConfig || EMPTY_PROMOTION_CONFIG;
  const rawDeals = Array.isArray(source.activeDeals)
    ? source.activeDeals
    : (source.activeDeal ? [source.activeDeal] : []);
  const activeDeals = rawDeals
    .map(normalizeDeal)
    .filter((deal) => deal.id && deal.enabled !== false && deal.status !== 'paused' && deal.status !== 'archived');
  const activeDeal = source.activeDeal === null ? null : (activeDeals[0] || null);
  const enabled = source.enabled !== false && activeDeals.length > 0;

  return {
    enabled,
    showClientBadges: source.showClientBadges !== false,
    showWorkerBadges: source.showWorkerBadges !== false,
    warnWrongDay: source.warnWrongDay !== false,
    activeDeal: enabled ? activeDeal : null,
    activeDeals: enabled ? activeDeals : [],
  };
}

export function usePromotionConfig() {
  const [config, setConfig] = useState(() => normalizePromotionConfig(EMPTY_PROMOTION_CONFIG));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;

    API.get('/promotions/active')
      .then(({ data }) => {
        if (alive) setConfig(normalizePromotionConfig(data));
      })
      .catch((err) => {
        console.warn('Failed to load runtime promotion config', err);
        if (alive) setConfig(normalizePromotionConfig(EMPTY_PROMOTION_CONFIG));
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => { alive = false; };
  }, []);

  return { promotionConfig: config, loading };
}

export function getServiceName(value) {
  if (!value) return '';
  if (typeof value === 'string') return value;
  return (
    value.name ||
    value.serviceName ||
    value.title ||
    value.serviceId?.name ||
    value.service?.name ||
    (typeof value.service === 'string' ? value.service : '') ||
    ''
  );
}

export function getServiceId(value) {
  if (!value || typeof value === 'string') return '';
  const raw =
    value._id ||
    value.id ||
    value.serviceId?._id ||
    value.serviceId ||
    value.service?._id ||
    '';
  return raw ? String(raw) : '';
}

export function getAppointmentServiceName(appointment) {
  return (
    appointment?.serviceId?.name ||
    appointment?.service?.name ||
    (typeof appointment?.service === 'string' ? appointment.service : '') ||
    appointment?.serviceName ||
    'N/A'
  );
}

function matchesDealService(serviceOrName, deal) {
  const serviceId = getServiceId(serviceOrName);
  const name = getServiceName(serviceOrName);
  const normalizedName = normalizeServiceName(name);
  const eligibleIds = Array.isArray(deal?.eligibleServiceIds)
    ? deal.eligibleServiceIds.map(String).filter(Boolean)
    : [];

  if (eligibleIds.length > 0) {
    return Boolean(serviceId && eligibleIds.includes(serviceId));
  }

  const eligibleNames = Array.isArray(deal?.eligibleServiceNames)
    ? deal.eligibleServiceNames.map(normalizeServiceName).filter(Boolean)
    : [];

  if (eligibleNames.length > 0) {
    if (!normalizedName) return false;
    return eligibleNames.some((eligibleName) => (
      normalizedName === eligibleName ||
      normalizedName.includes(eligibleName) ||
      eligibleName.includes(normalizedName)
    ));
  }

  // New architecture rule: no selected services means all services.
  // Require a real service candidate to avoid blank values matching accidentally.
  return Boolean(serviceId || normalizedName);
}


function matchesDealWorker(workerOrAppointment, deal) {
  const eligibleWorkerIds = Array.isArray(deal?.eligibleWorkerIds)
    ? deal.eligibleWorkerIds.map(String).filter(Boolean)
    : [];
  const eligibleTierKeys = Array.isArray(deal?.eligibleTierKeys)
    ? deal.eligibleTierKeys.map(String).map((x) => x.toLowerCase()).filter(Boolean)
    : [];

  if (!eligibleWorkerIds.length && !eligibleTierKeys.length) return true;

  const workerId = String(
    workerOrAppointment?.workerId?._id ||
    workerOrAppointment?.workerId ||
    workerOrAppointment?._id ||
    ''
  );
  const tierKey = String(
    workerOrAppointment?.workerTierKey ||
    workerOrAppointment?.tierKey ||
    workerOrAppointment?.workerId?.tierKey ||
    ''
  ).toLowerCase();

  if (eligibleWorkerIds.length && workerId && eligibleWorkerIds.includes(workerId)) return true;
  if (eligibleTierKeys.length && tierKey && eligibleTierKeys.includes(tierKey)) return true;
  return false;
}

function compareDealPriority(a, b) {
  const aCoupon = a.type === 'coupon' ? 1 : 0;
  const bCoupon = b.type === 'coupon' ? 1 : 0;
  if (aCoupon !== bCoupon) return bCoupon - aCoupon;

  const aValue = Number(a.discountType === 'percent' ? a.discountValue : a.discountPercent || 0);
  const bValue = Number(b.discountType === 'percent' ? b.discountValue : b.discountPercent || 0);
  if (aValue !== bValue) return bValue - aValue;

  const aUpdated = new Date(a.updatedAt || a.createdAt || 0).getTime();
  const bUpdated = new Date(b.updatedAt || b.createdAt || 0).getTime();
  return bUpdated - aUpdated;
}

export function isThursdaySpecialService(serviceOrName, promotionConfig = EMPTY_PROMOTION_CONFIG) {
  return Boolean(getSpecialDealForService(serviceOrName, promotionConfig));
}

export function getSpecialDealForService(serviceOrName, promotionConfig = EMPTY_PROMOTION_CONFIG) {
  const config = normalizePromotionConfig(promotionConfig);
  if (!config.enabled) return null;

  return (config.activeDeals || [])
    .filter((deal) => deal.type !== 'coupon')
    .filter((deal) => matchesDealService(serviceOrName, deal))
    .sort(compareDealPriority)[0] || null;
}

export function parseDateLike(dateLike) {
  if (!dateLike) return null;

  const value = String(dateLike);
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00`)
    : new Date(value);

  if (Number.isNaN(date.getTime())) return null;
  return date;
}

export function isThursdayDate(dateLike) {
  const date = parseDateLike(dateLike);
  return Boolean(date && date.getDay() === 4);
}

function isDealInDateWindow(deal, dateLike) {
  const date = parseDateLike(dateLike);
  if (!date) return false;
  date.setHours(12, 0, 0, 0);

  const start = parseDateLike(deal?.startsOn);
  const end = parseDateLike(deal?.endsOn);
  if (start) start.setHours(12, 0, 0, 0);
  if (end) end.setHours(12, 0, 0, 0);

  if (start && date < start) return false;
  if (end && date > end) return false;
  return true;
}

export function doesDateQualifyForDeal(dateLike, deal) {
  const date = parseDateLike(dateLike);
  if (!date || !deal) return false;

  const validDays = Array.isArray(deal.validDays) && deal.validDays.length
    ? deal.validDays.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [0, 1, 2, 3, 4, 5, 6];

  return validDays.includes(date.getDay()) && isDealInDateWindow(deal, date);
}

export function getAppliedPromotionDeal(appointment) {
  const applied = appointment?.appliedPromotion;
  if (!applied) return null;
  return normalizeDeal({
    id: applied.dealId,
    _id: applied.dealId,
    title: applied.title,
    type: applied.type || applied.source,
    couponCode: applied.couponCode,
    discountType: applied.discountType,
    discountValue: applied.discountValue,
    discountPercent: applied.discountPercent,
    appointmentLabel: applied.appointmentLabel,
    shortLabel: applied.shortLabel,
    validDays: [0, 1, 2, 3, 4, 5, 6],
    eligibleServiceIds: [],
    eligibleServiceNames: [],
  });
}

export function getSpecialDealForAppointment(appointment, promotionConfig = EMPTY_PROMOTION_CONFIG) {
  const applied = getAppliedPromotionDeal(appointment);
  if (applied) return applied;
  const config = normalizePromotionConfig(promotionConfig);
  if (!config.enabled) return null;
  return (config.activeDeals || [])
    .filter((deal) => deal.type !== 'coupon')
    .filter((deal) => matchesDealService(appointment, deal) || matchesDealService(getAppointmentServiceName(appointment), deal))
    .filter((deal) => matchesDealWorker(appointment, deal))
    .sort(compareDealPriority)[0] || null;
}

export function doesAppointmentQualifyForSpecial(appointment, promotionConfig = EMPTY_PROMOTION_CONFIG) {
  if (appointment?.appliedPromotion) return true;
  const deal = getSpecialDealForAppointment(appointment, promotionConfig);
  return Boolean(deal && doesDateQualifyForDeal(appointment?.date, deal));
}

export function getSpecialAppointmentBadgeText(appointment, promotionConfig = EMPTY_PROMOTION_CONFIG) {
  const deal = getSpecialDealForAppointment(appointment, promotionConfig);
  return doesAppointmentQualifyForSpecial(appointment, promotionConfig)
    ? (deal?.appointmentLabel || getDealDiscountLabel(deal))
    : '';
}

export function getDealDiscountLabel(deal = null) {
  const type = deal?.discountType === 'fixed' ? 'fixed' : 'percent';
  const value = Number(deal?.discountValue ?? deal?.discountPercent ?? (deal?.rate ? Number(deal.rate) * 100 : 0));
  if (!Number.isFinite(value) || value <= 0) return 'Special';
  return type === 'fixed' ? `$${value} off` : `${value}%`;
}

export function getDealDayLabel(deal = null) {
  const validDays = Array.isArray(deal?.validDays) && deal.validDays.length
    ? deal.validDays.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [0, 1, 2, 3, 4, 5, 6];

  const names = validDays.map((d) => DAY_NAMES[d]).filter(Boolean);
  if (names.length === 0) return 'eligible days';
  if (names.length === 7) return 'all days';
  if (names.length === 1) return `${names[0]}s`;
  if (names.length === 2) return `${names[0]}s and ${names[1]}s`;
  return `${names.slice(0, -1).map((n) => `${n}s`).join(', ')}, and ${names[names.length - 1]}s`;
}

export function getDealAppliesOnlyText(deal = null) {
  return `${getDealDiscountLabel(deal)} discount applies only on ${getDealDayLabel(deal)}.`;
}

export function getDealQualifiedText(deal = null) {
  const label = deal?.appointmentLabel || `${getDealDiscountLabel(deal)} Deal`;
  return `This appointment qualifies for the ${label}.`;
}
