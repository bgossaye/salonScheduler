const PromotionDeal = require('../models/promotiondeal');
const Appointment = require('../models/appointment');
const { getRuntimeBoolean } = require('./runtimeSettings');

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DEFAULT_THURSDAY_SYSTEM_KEY = 'default-thursday-20-off';

const SEEDED_DEFAULT_THURSDAY_DEAL = {
  systemKey: DEFAULT_THURSDAY_SYSTEM_KEY,
  title: '20% Off Every Thursday',
  description: 'Seeded default deal converted from the old runtime Thursday special.',
  status: 'active',
  type: 'auto',
  couponCode: '',
  discountType: 'percent',
  discountValue: 20,
  discountPercent: 20,
  shortLabel: '20% Thu',
  menuLabel: '20% Thursday Special',
  appointmentLabel: '20% Thursday Deal',
  serviceOnlyLabel: 'Thu special service',
  details: 'Valid Thursdays only. Select services only. Cannot combine with other offers.',
  validDays: [4],
  startsOn: '',
  endsOn: '',
  eligibleServiceIds: [],
  eligibleServiceNames: [
    'Wash, Set, blow-dry, Iron',
    'Men haircut',
  ],
  showClientBadge: true,
  showWorkerBadge: true,
  warnWrongDay: true,
};

function asDateOnly(value) {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(value))
    ? new Date(`${value}T12:00:00`)
    : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeServiceName(name = '') {
  return String(name)
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function getServiceName(value) {
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

function getServiceId(value) {
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

function hasOwn(obj, key) {
  return Object.prototype.hasOwnProperty.call(obj || {}, key);
}

function normalizeDeal(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const fromMongo = typeof source.toObject === 'function' ? source.toObject() : source;
  const type = fromMongo.type || (fromMongo.couponCode ? 'coupon' : 'auto');
  const discountType = fromMongo.discountType === 'fixed' ? 'fixed' : 'percent';
  const rawDiscount = Number(
    fromMongo.discountValue ??
    fromMongo.discountPercent ??
    (fromMongo.rate !== undefined ? Number(fromMongo.rate) * 100 : 0)
  );
  const discountValue = Number.isFinite(rawDiscount) ? rawDiscount : 0;
  const discountPercent = discountType === 'percent'
    ? discountValue
    : Number(fromMongo.discountPercent ?? 0);

  const validDays = Array.isArray(fromMongo.validDays) && fromMongo.validDays.length
    ? fromMongo.validDays.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [0, 1, 2, 3, 4, 5, 6];

  const sourceEligibleServices = Array.isArray(fromMongo.eligibleServiceIds)
    ? fromMongo.eligibleServiceIds
    : [];

  const eligibleServiceIds = sourceEligibleServices
    .map((idValue) => String(idValue?._id || idValue))
    .filter(Boolean);

  // New deals created in the admin UI commonly save selected services as IDs.
  // When the query populates those IDs, preserve their names for public display.
  const populatedServiceNames = sourceEligibleServices
    .map((service) => (service && typeof service === 'object' ? String(service.name || service.title || '').trim() : ''))
    .filter(Boolean);

  const eligibleServiceNames = Array.from(new Set([
    ...(Array.isArray(fromMongo.eligibleServiceNames)
      ? fromMongo.eligibleServiceNames.map(String).map((x) => x.trim()).filter(Boolean)
      : []),
    ...populatedServiceNames,
  ]));

  const eligibleWorkerIds = Array.isArray(fromMongo.eligibleWorkerIds)
    ? fromMongo.eligibleWorkerIds.map((idValue) => String(idValue?._id || idValue)).filter(Boolean)
    : [];

  const eligibleTierKeys = Array.isArray(fromMongo.eligibleTierKeys)
    ? fromMongo.eligibleTierKeys.map(String).map((x) => x.trim().toLowerCase()).filter(Boolean)
    : [];

  const id = fromMongo._id || fromMongo.id || '';
  const displayFields = {
    description: Boolean(String(fromMongo.description || '').trim()),
    details: Boolean(String(fromMongo.details || '').trim()),
    shortLabel: Boolean(String(fromMongo.shortLabel || '').trim()),
    menuLabel: Boolean(String(fromMongo.menuLabel || '').trim()),
    appointmentLabel: Boolean(String(fromMongo.appointmentLabel || '').trim()),
    serviceOnlyLabel: Boolean(String(fromMongo.serviceOnlyLabel || '').trim()),
    validDays: Array.isArray(fromMongo.validDays) && fromMongo.validDays.length > 0,
    startsOn: Boolean(String(fromMongo.startsOn || '').trim()),
    endsOn: Boolean(String(fromMongo.endsOn || '').trim()),
    services: eligibleServiceIds.length > 0 || eligibleServiceNames.length > 0,
    discount: Number.isFinite(discountValue) && discountValue > 0,
  };

  const normalized = {
    ...fromMongo,
    id: id ? String(id) : '',
    _id: fromMongo._id ? String(fromMongo._id) : undefined,
    systemKey: fromMongo.systemKey || '',
    type,
    status: fromMongo.status || (fromMongo.enabled === false ? 'paused' : 'active'),
    enabled: fromMongo.enabled !== false && !['paused', 'archived', 'expired'].includes(fromMongo.status),
    couponCode: fromMongo.couponCode ? String(fromMongo.couponCode).trim().toUpperCase() : '',
    discountType,
    discountValue,
    discountPercent: Number.isFinite(discountPercent) ? discountPercent : 0,
    rate: discountType === 'percent' && Number.isFinite(discountPercent) ? discountPercent / 100 : 0,
    validDays,
    eligibleServiceIds,
    eligibleServiceNames,
    eligibleWorkerIds,
    eligibleTierKeys,
    startsOn: fromMongo.startsOn || '',
    endsOn: fromMongo.endsOn || '',
    usageLimit: fromMongo.usageLimit ?? null,
    perClientLimit: fromMongo.perClientLimit ?? null,
    usageCount: Number(fromMongo.usageCount || 0),
    showClientBadge: fromMongo.showClientBadge !== false,
    showWorkerBadge: fromMongo.showWorkerBadge !== false,
    warnWrongDay: fromMongo.warnWrongDay !== false,
    isSystemSeed: Boolean(fromMongo.systemKey),
    displayFields,
  };

  if (!normalized.shortLabel) {
    normalized.shortLabel = normalized.discountType === 'fixed'
      ? `$${normalized.discountValue} off`
      : `${normalized.discountValue}%`;
  }
  if (!normalized.appointmentLabel) normalized.appointmentLabel = `${normalized.shortLabel} Deal`;
  if (!normalized.menuLabel) normalized.menuLabel = normalized.title || normalized.appointmentLabel;
  if (!normalized.serviceOnlyLabel) normalized.serviceOnlyLabel = 'Special service';
  if (!normalized.details) normalized.details = normalized.description || '';

  return normalized;
}

function isDealInDateWindow(deal, dateLike = new Date()) {
  const start = asDateOnly(deal?.startsOn);
  const end = asDateOnly(deal?.endsOn);
  const target = asDateOnly(dateLike) || new Date(dateLike);
  if (!target || Number.isNaN(target.getTime())) return false;
  target.setHours(12, 0, 0, 0);

  if (start && target < start) return false;
  if (end && target > end) return false;
  return true;
}

function doesDateQualifyForDeal(dateLike, deal) {
  const date = asDateOnly(dateLike);
  if (!date || !deal) return false;

  const validDays = Array.isArray(deal.validDays) && deal.validDays.length
    ? deal.validDays.map((d) => Number(d)).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6)
    : [0, 1, 2, 3, 4, 5, 6];

  return validDays.includes(date.getDay()) && isDealInDateWindow(deal, date);
}

function matchesDealService(serviceOrName, rawDeal) {
  const deal = normalizeDeal(rawDeal);
  const serviceId = getServiceId(serviceOrName);
  const name = getServiceName(serviceOrName);
  const normalizedName = normalizeServiceName(name);

  const eligibleIds = Array.isArray(deal.eligibleServiceIds)
    ? deal.eligibleServiceIds.map(String).filter(Boolean)
    : [];

  if (eligibleIds.length > 0) {
    return Boolean(serviceId && eligibleIds.includes(serviceId));
  }

  const eligibleNames = Array.isArray(deal.eligibleServiceNames)
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

  // New architecture rule: no selected services means the deal applies to all services.
  // Still require a real service candidate to avoid blank data matching accidentally.
  return Boolean(serviceId || normalizedName);
}


function matchesDealWorker(workerOrAppt, rawDeal) {
  const deal = normalizeDeal(rawDeal);
  const eligibleWorkerIds = Array.isArray(deal.eligibleWorkerIds) ? deal.eligibleWorkerIds.map(String).filter(Boolean) : [];
  const eligibleTierKeys = Array.isArray(deal.eligibleTierKeys) ? deal.eligibleTierKeys.map(String).map((x) => x.toLowerCase()).filter(Boolean) : [];

  if (!eligibleWorkerIds.length && !eligibleTierKeys.length) return true;

  const workerId = String(
    workerOrAppt?.workerId?._id ||
    workerOrAppt?.workerId ||
    workerOrAppt?._id ||
    ''
  );
  const tierKey = String(
    workerOrAppt?.workerTierKey ||
    workerOrAppt?.tierKey ||
    workerOrAppt?.workerId?.tierKey ||
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

  const aValue = Number(a.discountType === 'percent' ? a.discountValue || 0 : a.discountPercent || 0);
  const bValue = Number(b.discountType === 'percent' ? b.discountValue || 0 : b.discountPercent || 0);
  if (aValue !== bValue) return bValue - aValue;

  const aUpdated = new Date(a.updatedAt || a.createdAt || 0).getTime();
  const bUpdated = new Date(b.updatedAt || b.createdAt || 0).getTime();
  return bUpdated - aUpdated;
}

async function ensureDefaultThursdayDeal() {
  const existing = await PromotionDeal.findOne({ systemKey: DEFAULT_THURSDAY_SYSTEM_KEY }).lean();
  if (existing) return normalizeDeal(existing);

  // If the admin already created the same Thursday deal before this migration, convert it into the seeded record.
  const matchingExisting = await PromotionDeal.findOne({
    type: 'auto',
    title: SEEDED_DEFAULT_THURSDAY_DEAL.title,
    discountType: 'percent',
    discountValue: 20,
  });

  if (matchingExisting) {
    matchingExisting.systemKey = DEFAULT_THURSDAY_SYSTEM_KEY;
    if (!matchingExisting.description) matchingExisting.description = SEEDED_DEFAULT_THURSDAY_DEAL.description;
    await matchingExisting.save();
    return normalizeDeal(matchingExisting);
  }

  const created = await PromotionDeal.create({
    ...SEEDED_DEFAULT_THURSDAY_DEAL,
    createdBy: 'system-seed',
    updatedBy: 'system-seed',
  });
  return normalizeDeal(created);
}

async function getGlobalPromotionSwitches() {
  const [enabled, showClientBadges, showWorkerBadges, warnWrongDay] = await Promise.all([
    getRuntimeBoolean('promotions.enabled', true),
    getRuntimeBoolean('promotions.showClientBadges', true),
    getRuntimeBoolean('promotions.showWorkerBadges', true),
    getRuntimeBoolean('promotions.warnWrongDay', true),
  ]);

  return {
    enabled: Boolean(enabled),
    showClientBadges: Boolean(showClientBadges),
    showWorkerBadges: Boolean(showWorkerBadges),
    warnWrongDay: Boolean(warnWrongDay),
  };
}

async function getPromotionDealsForPublic() {
  const switches = await getGlobalPromotionSwitches();
  if (!switches.enabled) {
    return { ...switches, activeDeal: null, activeDeals: [] };
  }

  await ensureDefaultThursdayDeal();

  const rows = await PromotionDeal.find({ type: { $ne: 'coupon' }, status: { $in: ['active', 'scheduled'] } })
    .populate('eligibleServiceIds', 'name title')
    .sort({ updatedAt: -1 })
    .lean();

  const activeDeals = rows
    .map(normalizeDeal)
    .filter((deal) => deal.enabled !== false)
    .sort(compareDealPriority);

  return {
    enabled: Boolean(switches.enabled && activeDeals.length),
    showClientBadges: switches.showClientBadges,
    showWorkerBadges: switches.showWorkerBadges,
    warnWrongDay: switches.warnWrongDay,
    activeDeal: activeDeals[0] || null,
    activeDeals,
  };
}

async function getPromotionConfig() {
  return getPromotionDealsForPublic();
}

function getDealAppliesOnlyText(deal) {
  const validDays = Array.isArray(deal?.validDays) && deal.validDays.length ? deal.validDays : [0, 1, 2, 3, 4, 5, 6];
  const names = validDays.map((d) => DAY_NAMES[d]).filter(Boolean);
  let dayText = 'eligible days';
  if (names.length === 1) dayText = `${names[0]}s`;
  else if (names.length === 2) dayText = `${names[0]}s and ${names[1]}s`;
  else if (names.length > 2 && names.length < 7) dayText = `${names.slice(0, -1).map((n) => `${n}s`).join(', ')}, and ${names[names.length - 1]}s`;
  else if (names.length === 7) dayText = 'all days';

  const discount = deal.discountType === 'fixed' ? `$${deal.discountValue}` : `${deal.discountValue}%`;
  return `${discount} discount applies only on ${dayText}.`;
}

async function countClientCouponUses(dealId, clientId) {
  if (!dealId || !clientId) return 0;
  return Appointment.countDocuments({
    clientId,
    'appliedPromotion.dealId': String(dealId),
    status: { $nin: ['canceled', 'cancelled', 'cancelation', 'cancellation'] },
  });
}

async function countTotalCouponUses(dealId) {
  if (!dealId) return 0;
  return Appointment.countDocuments({
    'appliedPromotion.dealId': String(dealId),
    status: { $nin: ['canceled', 'cancelled', 'cancelation', 'cancellation'] },
  });
}

async function findCouponDeal(couponCode) {
  const code = String(couponCode || '').trim().toUpperCase();
  if (!code) return null;
  const row = await PromotionDeal.findOne({ type: 'coupon', couponCode: code, status: { $ne: 'archived' } }).lean();
  return row ? normalizeDeal(row) : null;
}

async function validateCoupon({ couponCode, service, serviceId, serviceName, date, clientId, workerId, workerTierKey }) {
  const switches = await getGlobalPromotionSwitches();
  if (!switches.enabled) {
    return { valid: false, reason: 'Coupon is not valid for this service/date.' };
  }

  const deal = await findCouponDeal(couponCode);
  if (!deal) return { valid: false, reason: 'Coupon is not valid for this service/date.' };
  if (deal.status !== 'active' || deal.enabled === false) return { valid: false, reason: 'Coupon is not valid for this service/date.' };
  if (!isDealInDateWindow(deal, asDateOnly(date) || new Date())) return { valid: false, reason: 'Coupon is not valid for this service/date.' };
  if (date && !doesDateQualifyForDeal(date, deal)) return { valid: false, reason: 'Coupon is not valid for this service/date.' };

  const serviceCandidate = service || { _id: serviceId, name: serviceName };
  if (!matchesDealService(serviceCandidate, deal)) {
    return { valid: false, reason: 'Coupon is not valid for this service/date.' };
  }

  if (!matchesDealWorker({ workerId, workerTierKey }, deal)) {
    return { valid: false, reason: 'Coupon is not valid for this stylist/tier.' };
  }

  if (deal.usageLimit !== null && deal.usageLimit !== undefined && Number(deal.usageLimit) > 0) {
    const usedTotal = await countTotalCouponUses(deal.id);
    if (usedTotal >= Number(deal.usageLimit)) {
      return { valid: false, reason: 'Coupon is not valid for this service/date.' };
    }
  }

  if (deal.perClientLimit !== null && deal.perClientLimit !== undefined && Number(deal.perClientLimit) > 0 && clientId) {
    const usedByClient = await countClientCouponUses(deal.id, clientId);
    if (usedByClient >= Number(deal.perClientLimit)) {
      return { valid: false, reason: 'Coupon is not valid for this service/date.' };
    }
  }

  return { valid: true, deal };
}

async function findBestAutoDealForAppointment({ service, serviceId, serviceName, date, workerId, workerTierKey }) {
  const config = await getPromotionDealsForPublic();
  if (!config.enabled) return null;
  const serviceCandidate = service || { _id: serviceId, name: serviceName };

  return (config.activeDeals || [])
    .filter((deal) => deal.type !== 'coupon')
    .filter((deal) => matchesDealService(serviceCandidate, deal))
    .filter((deal) => matchesDealWorker({ workerId, workerTierKey }, deal))
    .filter((deal) => doesDateQualifyForDeal(date, deal))
    .sort(compareDealPriority)[0] || null;
}

function promotionSnapshot(deal, source = 'auto') {
  if (!deal) return null;
  return {
    dealId: String(deal._id || deal.id || ''),
    title: deal.title || '',
    type: deal.type || source,
    source,
    couponCode: deal.couponCode || '',
    discountType: deal.discountType || 'percent',
    discountValue: Number(deal.discountValue || deal.discountPercent || 0),
    discountPercent: Number(deal.discountPercent || (deal.discountType === 'percent' ? deal.discountValue : 0) || 0),
    appointmentLabel: deal.appointmentLabel || deal.shortLabel || deal.title || 'Special',
    shortLabel: deal.shortLabel || '',
    appliedAt: new Date(),
  };
}

async function resolvePromotionForAppointment({ couponCode, service, serviceId, serviceName, date, clientId, workerId, workerTierKey }) {
  if (couponCode) {
    const result = await validateCoupon({ couponCode, service, serviceId, serviceName, date, clientId, workerId, workerTierKey });
    if (!result.valid) {
      const err = new Error(result.reason || 'Invalid coupon.');
      err.status = 400;
      err.code = 'INVALID_COUPON';
      throw err;
    }
    return promotionSnapshot(result.deal, 'coupon');
  }

  const autoDeal = await findBestAutoDealForAppointment({ service, serviceId, serviceName, date, workerId, workerTierKey });
  return autoDeal ? promotionSnapshot(autoDeal, 'auto') : null;
}

async function incrementCouponUsage(appliedPromotion, options = {}) {
  if (!appliedPromotion || appliedPromotion.source !== 'coupon' || !appliedPromotion.dealId) return;
  try {
    await PromotionDeal.updateOne(
      { _id: appliedPromotion.dealId, type: 'coupon' },
      { $inc: { usageCount: 1 } },
      options?.session ? { session: options.session } : {}
    );
  } catch (err) {
    console.warn('[promotions] Failed to increment coupon usage:', err.message);
    if (options.throwOnError) throw err;
  }
}

module.exports = {
  DEFAULT_THURSDAY_SYSTEM_KEY,
  SEEDED_DEFAULT_THURSDAY_DEAL,
  normalizeDeal,
  isDealInDateWindow,
  doesDateQualifyForDeal,
  matchesDealService,
  matchesDealWorker,
  getPromotionConfig,
  getPromotionDealsForPublic,
  validateCoupon,
  resolvePromotionForAppointment,
  incrementCouponUsage,
  ensureDefaultThursdayDeal,
};
