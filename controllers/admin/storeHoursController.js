const StoreHours = require('../../models/storehours');

// Get store hours
exports.getStoreHours = async (req, res) => {
  try {
    const hours = await StoreHours.find();
    res.json(hours);
  } catch (err) {
    res.status(500).json({ error: 'Server error' });
  }
};

// Update store hours
exports.updateStoreHour = async (req, res) => {
  try {
    const updated = await StoreHours.findOneAndUpdate(
      { day: req.params.day },
      req.body,
      { new: true, upsert: true }
    );
    res.json(updated);
  } catch (err) {
    res.status(400).json({ error: 'Update failed' });
  }
};