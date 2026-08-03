const PromotionDeal = require('../../models/promotiondeal');
const {
  DEFAULT_THURSDAY_SYSTEM_KEY,
  ensureDefaultThursdayDeal,
  normalizeDeal,
} = require('../../utils/promotions');

function adminId(req) {
  return req.admin?.email || req.admin?.id || req.admin?._id || '';
}

function cleanArray(value) {
  return Array.isArray(value) ? value.map(String).map((x) => x.trim()).filter(Boolean) : [];
}

function normalizePayload(body = {}) {
  const type = body.type === 'coupon' ? 'coupon' : 'auto';
  const discountType = body.discountType === 'fixed' ? 'fixed' : 'percent';
  const discountValue = Number(body.discountValue ?? body.discountPercent ?? 0);
  const existingSystemKey = String(body.systemKey || '').trim();

  return {
    ...(existingSystemKey ? { systemKey: existingSystemKey } : {}),
    title: String(body.title || '').trim(),
    description: String(body.description || body.details || '').trim(),
    status: ['active', 'paused', 'scheduled', 'expired', 'archived'].includes(body.status) ? body.status : 'active',
    type,
    couponCode: type === 'coupon' ? String(body.couponCode || '').trim().toUpperCase() : '',
    discountType,
    discountValue: Number.isFinite(discountValue) ? discountValue : 0,
    discountPercent: discountType === 'percent' && Number.isFinite(discountValue) ? discountValue : Number(body.discountPercent || 0),
    shortLabel: String(body.shortLabel || '').trim(),
    menuLabel: String(body.menuLabel || '').trim(),
    appointmentLabel: String(body.appointmentLabel || '').trim(),
    serviceOnlyLabel: String(body.serviceOnlyLabel || '').trim(),
    details: String(body.details || body.description || '').trim(),
    validDays: Array.isArray(body.validDays) ? body.validDays.map(Number).filter((d) => Number.isInteger(d) && d >= 0 && d <= 6) : [],
    startsOn: String(body.startsOn || '').trim(),
    endsOn: String(body.endsOn || '').trim(),
    eligibleServiceIds: cleanArray(body.eligibleServiceIds),
    eligibleServiceNames: cleanArray(body.eligibleServiceNames),
    eligibleWorkerIds: cleanArray(body.eligibleWorkerIds),
    eligibleTierKeys: cleanArray(body.eligibleTierKeys).map((x) => x.toLowerCase()),
    showClientBadge: body.showClientBadge !== false,
    showWorkerBadge: body.showWorkerBadge !== false,
    warnWrongDay: body.warnWrongDay !== false,
    usageLimit: body.usageLimit === '' || body.usageLimit === undefined || body.usageLimit === null ? null : Number(body.usageLimit),
    perClientLimit: body.perClientLimit === '' || body.perClientLimit === undefined || body.perClientLimit === null ? null : Number(body.perClientLimit),
  };
}

function validatePayload(payload) {
  if (!payload.title) return 'Deal title is required.';
  if (!Number.isFinite(payload.discountValue) || payload.discountValue <= 0) return 'Discount value must be greater than 0.';
  if (payload.discountType === 'percent' && payload.discountValue > 100) return 'Percent discounts cannot be more than 100.';
  if (payload.type === 'coupon' && !payload.couponCode) return 'Coupon code is required for coupon deals.';
  if (payload.startsOn && payload.endsOn && payload.startsOn > payload.endsOn) return 'End date cannot be before start date.';
  if (payload.usageLimit !== null && (!Number.isFinite(payload.usageLimit) || payload.usageLimit < 0)) return 'Usage limit must be empty or 0+.';
  if (payload.perClientLimit !== null && (!Number.isFinite(payload.perClientLimit) || payload.perClientLimit < 0)) return 'Per-client limit must be empty or 0+.';
  return '';
}

exports.list = async (req, res) => {
  try {
    await ensureDefaultThursdayDeal();

    const includeArchived = String(req.query.includeArchived || '') === 'true';
    const status = req.query.status ? String(req.query.status) : '';
    const query = {};
    if (!includeArchived) query.status = { $ne: 'archived' };
    if (status) query.status = status;

    const rows = await PromotionDeal.find(query)
      .populate('eligibleServiceIds')
      .sort({ status: 1, updatedAt: -1 })
      .lean();

    res.json({ deals: rows.map(normalizeDeal) });
  } catch (err) {
    console.error('❌ list promotion deals failed', err);
    res.status(500).json({ error: 'Failed to load deals.' });
  }
};

exports.create = async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    delete payload.systemKey; // admins create normal business records; systemKey is reserved for seeded records.
    const validationError = validatePayload(payload);
    if (validationError) return res.status(400).json({ error: validationError });

    const row = await PromotionDeal.create({
      ...payload,
      createdBy: adminId(req),
      updatedBy: adminId(req),
    });

    const full = await PromotionDeal.findById(row._id).populate('eligibleServiceIds').lean();
    res.status(201).json({ success: true, deal: normalizeDeal(full) });
  } catch (err) {
    console.error('❌ create promotion deal failed', err);
    if (err?.code === 11000) return res.status(409).json({ error: 'A coupon with this code already exists.' });
    res.status(500).json({ error: err.message || 'Failed to create deal.' });
  }
};

exports.update = async (req, res) => {
  try {
    const payload = normalizePayload(req.body);
    const validationError = validatePayload(payload);
    if (validationError) return res.status(400).json({ error: validationError });

    const existing = await PromotionDeal.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ error: 'Deal not found.' });

    const set = {
      ...payload,
      // Preserve seeded identity; do not let the browser clear or change it.
      systemKey: existing.systemKey || '',
      updatedBy: adminId(req),
    };

    const row = await PromotionDeal.findByIdAndUpdate(
      req.params.id,
      { $set: set },
      { new: true, runValidators: true }
    ).populate('eligibleServiceIds').lean();

    res.json({ success: true, deal: normalizeDeal(row) });
  } catch (err) {
    console.error('❌ update promotion deal failed', err);
    if (err?.code === 11000) return res.status(409).json({ error: 'A coupon with this code already exists.' });
    res.status(500).json({ error: err.message || 'Failed to update deal.' });
  }
};

exports.setStatus = async (req, res) => {
  try {
    const status = String(req.body?.status || '').trim();
    if (!['active', 'paused', 'scheduled', 'expired', 'archived'].includes(status)) {
      return res.status(400).json({ error: 'Invalid deal status.' });
    }

    const set = { status, updatedBy: adminId(req) };
    if (status === 'archived') {
      set.archivedAt = new Date();
      set.archivedBy = adminId(req);
    }
    if (status !== 'archived') {
      set.archivedAt = null;
      set.archivedBy = '';
    }

    const row = await PromotionDeal.findByIdAndUpdate(
      req.params.id,
      { $set: set },
      { new: true, runValidators: true }
    ).populate('eligibleServiceIds').lean();

    if (!row) return res.status(404).json({ error: 'Deal not found.' });
    res.json({ success: true, deal: normalizeDeal(row) });
  } catch (err) {
    console.error('❌ status promotion deal failed', err);
    res.status(500).json({ error: 'Failed to change deal status.' });
  }
};

exports.remove = async (req, res) => {
  try {
    const existing = await PromotionDeal.findById(req.params.id).lean();
    if (!existing) return res.status(404).json({ error: 'Deal not found.' });

    // The converted default Thursday deal is a real promotiondeal record, but deleting it would
    // cause migration confusion. Treat delete as archive; it can be restored from Include archived.
    if (existing.systemKey === DEFAULT_THURSDAY_SYSTEM_KEY) {
      const row = await PromotionDeal.findByIdAndUpdate(
        req.params.id,
        {
          $set: {
            status: 'archived',
            archivedAt: new Date(),
            archivedBy: adminId(req),
            updatedBy: adminId(req),
          },
        },
        { new: true }
      ).lean();
      return res.json({ success: true, archivedId: req.params.id, deal: normalizeDeal(row) });
    }

    await PromotionDeal.findByIdAndDelete(req.params.id);
    res.json({ success: true, deletedId: req.params.id });
  } catch (err) {
    console.error('❌ delete promotion deal failed', err);
    res.status(500).json({ error: 'Failed to delete deal.' });
  }
};
