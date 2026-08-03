const express = require('express');
const router = express.Router();
const Service = require('../../models/service');
const Worker = require('../../models/worker');
const { assignmentFor } = require('../../utils/workerPricing');
const { getRuntimeNumber } = require('../../utils/runtimeSettings');

function numberOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

async function attachPricingSummary(services) {
  const workers = await Worker.find({ active: true, showOnline: true, onlineBookable: { $ne: false } }).lean();
  return services.map((serviceDoc) => {
    const service = serviceDoc.toObject ? serviceDoc.toObject() : { ...serviceDoc };
    const prices = [];
    for (const worker of workers) {
      if (service.requiresChemicalPermission && worker.canUseChemicals === false) continue;
      const assignment = assignmentFor(worker, service._id);
      if (!assignment || assignment.enabled === false || assignment.allowOnlineBooking === false) continue;
      const price = numberOrNull(assignment.price);
      const duration = numberOrNull(assignment.duration);
      if (price === null || duration === null) continue;
      prices.push({ price, duration, workerId: String(worker._id), workerName: worker.displayName || worker.firstName || '' });
    }
    const amounts = prices.map((p) => p.price);
    service.pricingSummary = {
      workerCount: prices.length,
      minPrice: amounts.length ? Math.min(...amounts) : null,
      maxPrice: amounts.length ? Math.max(...amounts) : null,
      label: amounts.length
        ? (Math.min(...amounts) === Math.max(...amounts) ? `$${Math.min(...amounts)}` : `Starting at $${Math.min(...amounts)}`)
        : 'Price varies by stylist',
    };
    return service;
  });
}

router.get('/settings/booking-controls', async (req, res) => {
  try {
    const rawMax = await getRuntimeNumber('booking.online.maxServicesPerVisit', 2);
    const maxOnlineServicesPerVisit = [1, 2, 3, 4].includes(Number(rawMax)) ? Number(rawMax) : 2;
    res.json({
      maxOnlineServicesPerVisit,
      limitMessage: `For more than ${maxOnlineServicesPerVisit} service${maxOnlineServicesPerVisit === 1 ? '' : 's'}, please call Rakie Salon so we can allocate enough time for your visit.`,
    });
  } catch (err) {
    console.error('Failed to fetch booking controls:', err);
    res.status(500).json({ message: 'Server error fetching booking controls' });
  }
});

router.get('/', async (req, res) => {
  try {
    const services = await Service.find({
      active: { $ne: false },
      $or: [
        { isAddOn: { $ne: true } },
        { bookableAsSeparateOnline: { $ne: false } },
      ],
    });
    res.json(await attachPricingSummary(services));
  } catch (err) {
    console.error('Failed to fetch services:', err);
    res.status(500).json({ message: 'Server error fetching services' });
  }
});

router.get('/:serviceId/addons', async (req, res) => {
  try {
    const { serviceId } = req.params;
    const service = await Service.findById(serviceId).populate({
      path: 'suggestedAddOns',
      match: { active: { $ne: false }, isAddOn: true },
    });
    if (!service) return res.status(404).json({ message: 'Service not found' });
    res.json((service.suggestedAddOns || []).filter(Boolean));
  } catch (err) {
    console.error('Failed to fetch suggested add-ons:', err);
    res.status(500).json({ message: 'Server error fetching add-ons' });
  }
});

module.exports = router;
