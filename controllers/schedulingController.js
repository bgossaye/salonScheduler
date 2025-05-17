const Service = require('../models/Service');

exports.getSuggestedAddOns = async (req, res) => {
  try {
    const { selectedServiceIds } = req.body;
    const services = await Service.find({ _id: { $in: selectedServiceIds } }).populate('suggestedAddOns');
    const allSuggested = services.flatMap(s => s.suggestedAddOns);
    const unique = Array.from(new Map(allSuggested.map(s => [s._id.toString(), s])).values());
    res.json(unique);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to fetch suggestions' });
  }
};
