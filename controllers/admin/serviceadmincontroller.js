const Service = require('../../models/service');

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
    const {
      name,
      category,
      duration,
      price,
      steps,
      suggestedAddOns,
      isAddOn
    } = req.body;

    // verify suggestedAddOns are all valid add-on services
    const validAddOns = await Service.find({ _id: { $in: suggestedAddOns || [] }, isAddOn: true });
    const validAddOnIds = validAddOns.map(s => s._id);

    const newService = new Service({
      name,
      category,
      duration,
      price,
      steps: steps || [],
      isAddOn: !!isAddOn,
      suggestedAddOns: validAddOnIds
    });

    await newService.save();
    res.json(newService);
  } catch (err) {
    console.error('❌ POST service add failed:', err);
    res.status(400).json({ error: 'Failed to add service' });
  }
};

// PUT /admin/services/:id
exports.updateService = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      name,
      category,
      duration,
      price,
      steps,
      suggestedAddOns,
      isAddOn
    } = req.body;

    if (!name || !category || !duration || !price) {
      return res.status(400).json({ error: 'Missing required fields for update' });
    }

    const existing = await Service.findById(id);
    if (!existing) {
      return res.status(404).json({ error: 'Service not found' });
    }

    // Validate add-ons
    const validAddOns = await Service.find({ _id: { $in: suggestedAddOns || [] }, isAddOn: true });
    const validAddOnIds = validAddOns.map(s => s._id);

    existing.name = name;
    existing.category = category;
    existing.duration = duration;
    existing.price = price;
    existing.steps = steps || [];
    existing.isAddOn = !!isAddOn;
    existing.suggestedAddOns = validAddOnIds;

    const updated = await existing.save();
    res.json(updated);
  } catch (err) {
    console.error('❌ PUT service update failed:', err);
    res.status(500).json({ error: 'Service replacement failed' });
  }
};

// PATCH service (no change needed unless updating suggestedAddOns)
exports.patchService = async (req, res) => {
  try {
    const updated = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: 'Update failed' });
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

