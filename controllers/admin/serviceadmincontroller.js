const Service = require('../../models/service');

function cleanText(value) {
  return String(value ?? '').trim();
}

function parseRequiredNumber(value, field, { min = 0, integer = false } = {}) {
  if (value === '' || value === null || value === undefined) {
    return { error: `${field} is required` };
  }
  const n = Number(value);
  if (!Number.isFinite(n)) {
    return { error: `${field} must be a number` };
  }
  if (integer && !Number.isInteger(n)) {
    return { error: `${field} must be a whole number` };
  }
  if (n < min) {
    return { error: `${field} must be at least ${min}` };
  }
  return { value: n };
}

function normalizeServicePayload(body = {}, { partial = false } = {}) {
  const errors = {};
  const out = {};

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'name')) {
    out.name = cleanText(body.name);
    if (!out.name) errors.name = 'Service name is required';
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'category')) {
    out.category = cleanText(body.category === '__custom' ? body.customCategory : body.category);
    if (!out.category) errors.category = 'Category is required';
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'price')) {
    const price = parseRequiredNumber(body.price, 'Price', { min: 0 });
    if (price.error) errors.price = price.error;
    else out.price = price.value;
  }

  if (!partial || Object.prototype.hasOwnProperty.call(body, 'duration')) {
    const duration = parseRequiredNumber(body.duration, 'Duration', { min: 1, integer: true });
    if (duration.error) errors.duration = duration.error;
    else out.duration = duration.value;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'startingPrice')) {
    if (body.startingPrice === '' || body.startingPrice === null || body.startingPrice === undefined) {
      out.startingPrice = null;
    } else {
      const startingPrice = Number(body.startingPrice);
      if (!Number.isFinite(startingPrice) || startingPrice < 0) errors.startingPrice = 'Starting price must be a valid number';
      else out.startingPrice = startingPrice;
    }
  } else if (!partial) {
    out.startingPrice = null;
  }

  if (Object.prototype.hasOwnProperty.call(body, 'steps') || !partial) {
    const rawSteps = Array.isArray(body.steps) ? body.steps : [];
    out.steps = rawSteps
      .map(step => ({
        name: cleanText(step?.name),
        duration: Number(step?.duration),
      }))
      .filter(step => step.name || Number.isFinite(step.duration));

    out.steps.forEach((step, index) => {
      if (!step.name) errors[`steps.${index}.name`] = 'Step name is required';
      if (!Number.isFinite(step.duration) || step.duration < 1) errors[`steps.${index}.duration`] = 'Step duration must be at least 1 minute';
    });
  }

  if (Object.prototype.hasOwnProperty.call(body, 'isAddOn') || !partial) out.isAddOn = !!body.isAddOn;
  if (Object.prototype.hasOwnProperty.call(body, 'bookableAsSeparateOnline') || !partial) out.bookableAsSeparateOnline = body.bookableAsSeparateOnline !== false;
  if (Object.prototype.hasOwnProperty.call(body, 'requiresChemicalPermission') || !partial) out.requiresChemicalPermission = !!body.requiresChemicalPermission;
  if (Object.prototype.hasOwnProperty.call(body, 'active') || !partial) out.active = body.active !== false;
  if (Object.prototype.hasOwnProperty.call(body, 'suggestedAddOns') || !partial) {
    out.suggestedAddOns = Array.isArray(body.suggestedAddOns) ? body.suggestedAddOns.filter(Boolean) : [];
  }

  return { values: out, errors };
}

function sendValidation(res, errors) {
  return res.status(400).json({
    error: 'Please complete the required service fields.',
    fields: errors,
  });
}

// GET /admin/services
exports.getServices = async (req, res) => {
  try {
    const filter = {};
    if (req.query.isAddOn !== undefined) {
      filter.isAddOn = req.query.isAddOn === 'true';
    }

    const services = await Service.find(filter).populate('suggestedAddOns', 'name');
    res.json(services);
  } catch (err) {
    console.error('❌ Failed to fetch services:', err);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
};

// GET /admin/services/:id/addons
exports.getSuggestedAddOns = async (req, res) => {
  try {
    const service = await Service.findById(req.params.id).populate({
      path: 'suggestedAddOns',
      match: { isAddOn: true } // ✅ only return valid add-ons
    });
    if (!service) return res.status(404).json({ error: 'Service not found' });
    res.json(service.suggestedAddOns || []);
  } catch (err) {
    console.error('❌ Failed to fetch suggested add-ons:', err);
    res.status(500).json({ error: 'Server error fetching add-ons' });
  }
};

// POST /admin/services
exports.addService = async (req, res) => {
  try {
    const { values, errors } = normalizeServicePayload(req.body || {});
    if (Object.keys(errors).length) return sendValidation(res, errors);

    const validAddOns = await Service.find({
      _id: { $in: values.suggestedAddOns || [] },
      isAddOn: true,
    }).select('_id');

    const newService = new Service({
      ...values,
      suggestedAddOns: validAddOns.map(s => s._id),
    });

    await newService.save();
    return res.json(newService);
  } catch (err) {
    console.error('❌ POST service add failed:', err?.message || err);
    return res.status(500).json({ error: 'Failed to add service' });
  }
};

// PUT /admin/services/:id
exports.updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const { values, errors } = normalizeServicePayload(req.body || {});
    if (Object.keys(errors).length) return sendValidation(res, errors);

    const existing = await Service.findById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Service not found' });
    }

    const validAddOns = await Service.find({
      _id: { $in: values.suggestedAddOns || [] },
      isAddOn: true,
    }).select('_id');

    Object.assign(existing, values, { suggestedAddOns: validAddOns.map(s => s._id) });

    const updated = await existing.save();
    return res.json(updated);
  } catch (err) {
    console.error('❌ PUT service update failed:', err?.message || err);
    return res.status(500).json({ error: 'Service update failed' });
  }
};

// PATCH service
exports.patchService = async (req, res) => {
  try {
    const { values, errors } = normalizeServicePayload(req.body || {}, { partial: true });
    if (Object.keys(errors).length) return sendValidation(res, errors);

    if (Array.isArray(values.suggestedAddOns)) {
      const validAddOns = await Service.find({
        _id: { $in: values.suggestedAddOns },
        isAddOn: true,
      }).select('_id');
      values.suggestedAddOns = validAddOns.map(s => s._id);
    }

    const updated = await Service.findByIdAndUpdate(req.params.id, values, { new: true, runValidators: true });
    if (!updated) return res.status(404).json({ error: 'Service not found' });
    return res.json(updated);
  } catch (err) {
    console.error('❌ PATCH service update failed:', err?.message || err);
    return res.status(400).json({ error: 'Update failed' });
  }
};

// DELETE service
exports.deleteService = async (req, res) => {
  try {
    await Service.findByIdAndDelete(req.params.id);
    res.json({ message: 'Service deleted' });
  } catch (err) {
    res.status(400).json({ error: 'Delete failed' });
  }
};

module.exports = {
  getServices: exports.getServices,
  getSuggestedAddOns: exports.getSuggestedAddOns,
  addService: exports.addService,
  updateService: exports.updateService,
  patchService: exports.patchService,
  deleteService: exports.deleteService
};

