const Service = require('../../models/Service');

// Get all services
exports.getServices = async (req, res) => {
  try {
    const services = await Service.find().populate('suggestedAddOns', 'name');
    res.json(services);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch services' });
  }
};

// Add a new service
exports.addService = async (req, res) => {
  try {
    const newService = new Service(req.body);
    await newService.save();
    res.json(newService);
  } catch (err) {
    res.status(400).json({ error: 'Failed to add service' });
  }
};

// Update a service
exports.updateService = async (req, res) => {
  try {
    const updated = await Service.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: 'Update failed' });
  }
};

// Delete a service
exports.deleteService = async (req, res) => {
  try {
    await Service.findByIdAndDelete(req.params.id);
    res.json({ message: 'Service deleted' });
  } catch (err) {
    res.status(400).json({ error: 'Delete failed' });
  }
};