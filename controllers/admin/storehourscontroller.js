const StoreHours = require('../../models/storehours');
const StoreCalendarException = require('../../models/storecalendarexception');
const { normalizeBusinessDate, isValidBusinessDate, isValidTime } = require('../../utils/storeCalendar');

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

function asBool(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

function cleanCalendarPayload(body = {}, adminId = null) {
  const startDate = normalizeBusinessDate(body.startDate);
  const endDate = normalizeBusinessDate(body.endDate || body.startDate);
  if (!isValidBusinessDate(startDate) || !isValidBusinessDate(endDate)) {
    const err = new Error('Start date and end date are required in YYYY-MM-DD format.');
    err.status = 400;
    throw err;
  }
  if (endDate < startDate) {
    const err = new Error('End date cannot be before start date.');
    err.status = 400;
    throw err;
  }

  const storeClosed = asBool(body.storeClosed, false);
  const onlineBookingOff = asBool(body.onlineBookingOff, false);
  const open = storeClosed ? '' : String(body.open || '').trim();
  const close = storeClosed ? '' : String(body.close || '').trim();
  if (!isValidTime(open) || !isValidTime(close)) {
    const err = new Error('Special open and close times must use HH:MM format.');
    err.status = 400;
    throw err;
  }

  return {
    title: String(body.title || '').trim() || (storeClosed ? 'Store closed' : onlineBookingOff ? 'Online booking off' : 'Special hours'),
    reason: String(body.reason || 'custom').trim() || 'custom',
    startDate,
    endDate,
    storeClosed,
    onlineBookingOff,
    phoneCallRequired: asBool(body.phoneCallRequired, onlineBookingOff),
    open,
    close,
    customerMessage: String(body.customerMessage || '').trim(),
    internalNote: String(body.internalNote || '').trim(),
    active: body.active === undefined ? true : asBool(body.active, true),
    updatedBy: adminId || undefined,
  };
}

exports.getCalendarExceptions = async (req, res) => {
  try {
    const from = normalizeBusinessDate(req.query.from) || '0000-01-01';
    const to = normalizeBusinessDate(req.query.to) || '9999-12-31';
    const rows = await StoreCalendarException.find({
      endDate: { $gte: from },
      startDate: { $lte: to },
    }).sort({ startDate: 1, endDate: 1, updatedAt: -1 }).lean();
    res.json(rows);
  } catch (err) {
    console.error('❌ getCalendarExceptions failed:', err);
    res.status(500).json({ error: 'Server error' });
  }
};

exports.createCalendarException = async (req, res) => {
  try {
    const payload = cleanCalendarPayload(req.body, req.admin?._id);
    payload.createdBy = req.admin?._id || undefined;
    const saved = await StoreCalendarException.create(payload);
    res.status(201).json(saved);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Create failed' });
  }
};

exports.updateCalendarException = async (req, res) => {
  try {
    const payload = cleanCalendarPayload(req.body, req.admin?._id);
    const updated = await StoreCalendarException.findByIdAndUpdate(req.params.id, payload, {
      new: true,
      runValidators: true,
    });
    if (!updated) return res.status(404).json({ error: 'Calendar exception not found' });
    res.json(updated);
  } catch (err) {
    res.status(err.status || 400).json({ error: err.message || 'Update failed' });
  }
};

exports.deleteCalendarException = async (req, res) => {
  try {
    const deleted = await StoreCalendarException.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Calendar exception not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: 'Delete failed' });
  }
};
