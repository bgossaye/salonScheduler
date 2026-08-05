const express = require('express');
const StoreCalendarException = require('../../models/storecalendarexception');
const StoreHours = require('../../models/storehours');
const Worker = require('../../models/worker');
const { getRuntimeBoolean, getRuntimeString } = require('../../utils/runtimeSettings');
const { getPromotionDealsForPublic, isDealInDateWindow } = require('../../utils/promotions');

const router = express.Router();

function businessDateInNewYork(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}


function businessPartsInNewYork(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'long',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    date: `${values.year}-${values.month}-${values.day}`,
    weekday: values.weekday,
    time: `${values.hour === '24' ? '00' : values.hour}:${values.minute}`,
  };
}

function weekdayForDate(dateString) {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'UTC',
    weekday: 'long',
  }).format(new Date(`${dateString}T12:00:00Z`));
}

function formatTime12(value) {
  if (!/^\d{2}:\d{2}$/.test(String(value || ''))) return '';
  const [hourValue, minute] = value.split(':').map(Number);
  const suffix = hourValue >= 12 ? 'PM' : 'AM';
  const hour = hourValue % 12 || 12;
  return `${hour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function hoursForDate(dateString, hoursByDay, exceptions) {
  const active = exceptions.filter((row) => row.startDate <= dateString && row.endDate >= dateString);
  if (active.some((row) => row.storeClosed)) return { closed: true, open: '', close: '' };

  const special = active.find((row) => row.open && row.close);
  if (special) return { closed: false, open: special.open, close: special.close };

  const regular = hoursByDay.get(weekdayForDate(dateString).toLowerCase());
  return {
    closed: !regular || Boolean(regular.closed) || !regular.open || !regular.close,
    open: regular?.open || '',
    close: regular?.close || '',
  };
}

function buildStoreStatus(now, hoursRows, exceptions) {
  const parts = businessPartsInNewYork(now);
  const hoursByDay = new Map(hoursRows.map((row) => [String(row.day || '').toLowerCase(), row]));
  const todayHours = hoursForDate(parts.date, hoursByDay, exceptions);
  const isOpenNow = !todayHours.closed && parts.time >= todayHours.open && parts.time < todayHours.close;

  let nextOpen = null;
  for (let offset = 0; offset <= 14 && !nextOpen; offset += 1) {
    const date = addDays(parts.date, offset);
    const hours = hoursForDate(date, hoursByDay, exceptions);
    if (hours.closed) continue;
    if (offset === 0 && parts.time < hours.open) nextOpen = { date, time: hours.open };
    else if (offset > 0) nextOpen = { date, time: hours.open };
  }

  let statusText;
  if (isOpenNow) {
    statusText = `We are currently open until ${formatTime12(todayHours.close)}.`;
  } else if (nextOpen) {
    const dayText = nextOpen.date === parts.date
      ? 'today'
      : nextOpen.date === addDays(parts.date, 1)
        ? 'tomorrow'
        : new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' })
            .format(new Date(`${nextOpen.date}T12:00:00Z`));
    statusText = `We are currently closed and will open ${dayText} at ${formatTime12(nextOpen.time)}.`;
  } else {
    statusText = 'We are currently closed.';
  }

  return {
    isOpenNow,
    statusText,
    todayOpen: todayHours.open,
    todayClose: todayHours.close,
    nextOpen,
  };
}

function addDays(dateString, numberOfDays) {
  const date = new Date(`${dateString}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + numberOfDays);
  return date.toISOString().slice(0, 10);
}

function publicException(row, timing) {
  return {
    id: String(row._id),
    timing,
    type: row.reason || 'custom',
    title: row.title || (row.onlineBookingOff ? 'Online booking unavailable' : 'Important notice'),
    message: row.customerMessage || '',
    startDate: row.startDate,
    endDate: row.endDate,
    storeClosed: Boolean(row.storeClosed),
    onlineBookingOff: Boolean(row.onlineBookingOff),
    phoneCallRequired: Boolean(row.phoneCallRequired),
    open: row.open || '',
    close: row.close || '',
  };
}

router.get('/', async (req, res) => {
  try {
    const today = businessDateInNewYork();
    const futureThrough = addDays(today, 60);

    const [onlineEnabled, disabledMessage, shopModeRaw, primaryStylistId, exceptionRows, promotionConfig, storeHoursRows, onlineWorkers] = await Promise.all([
      getRuntimeBoolean('booking.online.enabled', true),
      getRuntimeString(
        'booking.online.disabledMessage',
        'Online booking is temporarily unavailable. Please call Rakie Salon to schedule.'
      ),
      getRuntimeString('booking.shopMode', 'auto'),
      getRuntimeString('booking.primaryStylistId', ''),
      StoreCalendarException.find({
        active: true,
        endDate: { $gte: today },
        startDate: { $lte: futureThrough },
      }).sort({ startDate: 1, endDate: 1, updatedAt: -1 }).lean(),
      getPromotionDealsForPublic(),
      StoreHours.find().lean(),
      Worker.find({ active: true, showOnline: { $ne: false }, onlineBookable: { $ne: false } })
        .sort({ isDefault: -1, bookingOrder: 1, displayName: 1 })
        .select('_id displayName firstName lastName isDefault')
        .lean(),
    ]);

    const currentNotices = [];
    const futureNotices = [];

    if (!onlineEnabled) {
      currentNotices.push({
        id: 'global-online-booking-disabled',
        timing: 'current',
        type: 'online_off',
        title: 'Online booking is temporarily unavailable',
        message: disabledMessage,
        startDate: today,
        endDate: '',
        storeClosed: false,
        onlineBookingOff: true,
        phoneCallRequired: true,
        open: '',
        close: '',
      });
    }

    exceptionRows.forEach((row) => {
      const isCurrent = row.startDate <= today && row.endDate >= today;
      const notice = publicException(row, isCurrent ? 'current' : 'future');
      if (isCurrent) currentNotices.push(notice);
      else futureNotices.push(notice);
    });

    const promotions = (promotionConfig.activeDeals || [])
      .filter((deal) => deal.type !== 'coupon')
      // Do not publish stylist-specific promotions on the welcome page.
      .filter((deal) => !Array.isArray(deal.eligibleWorkerIds) || deal.eligibleWorkerIds.length === 0)
      .filter((deal) => deal.showClientBadge !== false)
      .filter((deal) => isDealInDateWindow(deal, today))
      .map((deal) => ({
        id: deal.id || deal._id || deal.systemKey || deal.title,
        _id: deal._id || undefined,
        systemKey: deal.systemKey || '',
        type: deal.type || 'auto',
        status: deal.status || 'active',
        enabled: deal.enabled !== false,
        title: deal.title || deal.menuLabel || 'Special offer',
        description: deal.description || deal.details || '',
        message: deal.description || deal.details || '',
        details: deal.details || deal.description || '',
        shortLabel: deal.shortLabel || '',
        menuLabel: deal.menuLabel || '',
        appointmentLabel: deal.appointmentLabel || '',
        serviceOnlyLabel: deal.serviceOnlyLabel || '',
        displayFields: deal.displayFields || {},
        discountType: deal.discountType || 'percent',
        discountValue: Number(deal.discountValue ?? deal.discountPercent ?? 0),
        discountPercent: Number(deal.discountPercent ?? deal.discountValue ?? 0),
        validDays: Array.isArray(deal.validDays) ? deal.validDays : [0, 1, 2, 3, 4, 5, 6],
        eligibleServiceIds: Array.isArray(deal.eligibleServiceIds) ? deal.eligibleServiceIds : [],
        eligibleServiceNames: Array.isArray(deal.eligibleServiceNames) ? deal.eligibleServiceNames : [],
        eligibleWorkerIds: [],
        eligibleTierKeys: [],
        startsOn: deal.startsOn || '',
        endsOn: deal.endsOn || '',
      }));

    const bookingAvailable = onlineEnabled && !currentNotices.some((notice) => notice.onlineBookingOff);
    const storeStatus = buildStoreStatus(new Date(), storeHoursRows, exceptionRows);
    const normalizedShopMode = ['single', 'multi'].includes(String(shopModeRaw || '').toLowerCase())
      ? String(shopModeRaw).toLowerCase()
      : 'auto';
    const effectiveSingleStylist = normalizedShopMode === 'single'
      || (normalizedShopMode === 'auto' && onlineWorkers.length <= 1);
    const primaryWorker = onlineWorkers.find((worker) => String(worker._id) === String(primaryStylistId || ''))
      || onlineWorkers.find((worker) => worker.isDefault)
      || onlineWorkers[0]
      || null;

    res.json({
      asOfDate: today,
      bookingAvailable,
      storeStatus,
      currentNotices,
      futureNotices,
      promotions,
      shopMode: {
        configured: normalizedShopMode,
        effectiveSingleStylist,
        onlineStylistCount: onlineWorkers.length,
        primaryStylist: primaryWorker ? {
          _id: primaryWorker._id,
          displayName: primaryWorker.displayName || [primaryWorker.firstName, primaryWorker.lastName].filter(Boolean).join(' '),
        } : null,
      },
    });
  } catch (err) {
    console.error('Failed to load public booking status:', err);
    res.status(500).json({ error: 'Failed to load booking status.' });
  }
});

module.exports = router;
