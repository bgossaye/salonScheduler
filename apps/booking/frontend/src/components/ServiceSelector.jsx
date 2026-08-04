// Finalized ServiceSelector.jsx with frozen top banner and preserved layout
import React, { useState, useEffect, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import API from '../api';
import { toast } from 'react-toastify';
import logo from '../assets/TheRSlogo.png';
import {
  doesDateQualifyForDeal,
  getDealAppliesOnlyText,
  getDealQualifiedText,
  getDealDiscountLabel,
  getSpecialDealForService,
  usePromotionConfig,
} from '../utils/specialDeals';

const RAKIE_PHONE = '5854146041';
const ONLINE_BOOKING_COUNT_KEY = 'rakieOnlineBookingServiceCount';
const ONLINE_BOOKING_COUNT_TS_KEY = 'rakieOnlineBookingServiceCountAt';
const ONLINE_BOOKING_COUNT_TTL_MS = 2 * 60 * 60 * 1000;

function readOnlineBookingCount() {
  try {
    const ts = Number(sessionStorage.getItem(ONLINE_BOOKING_COUNT_TS_KEY) || 0);
    if (!ts || Date.now() - ts > ONLINE_BOOKING_COUNT_TTL_MS) {
      sessionStorage.removeItem(ONLINE_BOOKING_COUNT_KEY);
      sessionStorage.removeItem(ONLINE_BOOKING_COUNT_TS_KEY);
      return 0;
    }
    const count = Number(sessionStorage.getItem(ONLINE_BOOKING_COUNT_KEY) || 0);
    return Number.isFinite(count) && count > 0 ? count : 0;
  } catch { return 0; }
}

function writeOnlineBookingCount(count) {
  try {
    sessionStorage.setItem(ONLINE_BOOKING_COUNT_KEY, String(Math.max(0, Number(count) || 0)));
    sessionStorage.setItem(ONLINE_BOOKING_COUNT_TS_KEY, String(Date.now()));
  } catch { console.log('booking count save failed'); }
}

function clearOnlineBookingCount() {
  try {
    sessionStorage.removeItem(ONLINE_BOOKING_COUNT_KEY);
    sessionStorage.removeItem(ONLINE_BOOKING_COUNT_TS_KEY);
  } catch { console.log('booking count clear failed'); }
}

function idOf(value) {
  return String(value?._id || value || '');
}

function workerDisplayName(worker) {
  return worker?.displayName || [worker?.firstName, worker?.lastName].filter(Boolean).join(' ') || 'Stylist';
}

function addMinutesToTime(timeStr, minutesToAdd) {
  const [hStr, mStr] = String(timeStr || '').split(':');
  const start = (parseInt(hStr, 10) || 0) * 60 + (parseInt(mStr, 10) || 0);
  const total = start + (Number(minutesToAdd) || 0);
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function basketItemDuration(item) {
  if (!item) return 0;
  const base = Number(item.service?.duration || 0);
  const extra = (item.addOns || []).reduce((sum, addOn) => sum + Number(addOn?.duration || 0), 0);
  return base + extra;
}

function relationshipStylistIdFor(client) {
  return (
    idOf(client?.assignedStylistId) ||
    idOf(client?.preferredStylistId) ||
    idOf(client?.lastStylistId) ||
    ''
  );
}

function clientStartingPrice(service) {
  const value = Number(service?.pricingSummary?.minPrice);
  return Number.isFinite(value) ? `$${value.toFixed(value % 1 === 0 ? 0 : 2)}` : null;
}

function clientPriceMessage(service) {
  const startingPrice = clientStartingPrice(service);
  const consultationText = service?.requiresConsultation
    ? ' Consultation is required before final pricing is confirmed.'
    : ' Consultation may be required before final pricing is confirmed.';

  return startingPrice
    ? `Starting from ${startingPrice}.${consultationText} Final pricing may vary based on hair length, density, condition, product needs, service complexity, and time required.`
    : `Starting price requires consultation.${consultationText} Final pricing may vary based on hair length, density, condition, product needs, service complexity, and time required.`;
}

export default function ServiceSelector({ client, onSignOut }) {
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [availableWorkers, setAvailableWorkers] = useState([]);
  const [showStylistOptions, setShowStylistOptions] = useState(false);
  const [relationshipStylistUnavailable, setRelationshipStylistUnavailable] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [selectedTime, setSelectedTime] = useState(null);
  const [availabilityRefreshKey, setAvailabilityRefreshKey] = useState(0);
  const [addOns, setAddOns] = useState([]);
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [serviceBasket, setServiceBasket] = useState([]);
  const [activeBasketItemId, setActiveBasketItemId] = useState(null);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [showAddOnModal, setShowAddOnModal] = useState(false);
  const [storeHours, setStoreHours] = useState([]);
  const [calendarStatus, setCalendarStatus] = useState(null);
  const [mode, setMode] = useState('create'); // 'create' | 'edit' | 'rebook'
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { promotionConfig } = usePromotionConfig();
  const shouldShowClientPromotion = promotionConfig.enabled && promotionConfig.showClientBadges;
  const [couponCode, setCouponCode] = useState('');
  const [couponResult, setCouponResult] = useState(null);
  const [couponChecking, setCouponChecking] = useState(false);
  const [bookingSettings, setBookingSettings] = useState({ maxOnlineServicesPerVisit: 2, limitMessage: 'For more than 2 services, please call Rakie Salon so we can allocate enough time for your visit.' });
  const [separateServiceCount, setSeparateServiceCount] = useState(() => readOnlineBookingCount());
  const [bookingCompleteNotice, setBookingCompleteNotice] = useState(null);
  const [openPriceServiceId, setOpenPriceServiceId] = useState(null);
  const [bookingStatus, setBookingStatus] = useState({ currentNotices: [], futureNotices: [], promotions: [], storeStatus: null });
  const getEditingId = (apt) => apt?._id || apt?.id || apt?.appointmentId || null;

  // Initialize from prop OR localStorage synchronously to avoid a redirect race
 function readClientFromStorage() {
   try {
     // 1) Canonical object
     const raw = localStorage.getItem('client');
     if (raw) return JSON.parse(raw);

     // 2) Profile blob used by Intake
     const prof = localStorage.getItem('clientProfile');
     if (prof) return JSON.parse(prof);

     // 3) Individual keys fallback
     const firstName = localStorage.getItem('clientFirstName') || '';
     const lastName  = localStorage.getItem('clientLastName')  || '';
     const phone     = localStorage.getItem('clientPhone')     || '';
     const id        = localStorage.getItem('clientId')        || '';
     if (firstName || lastName || phone || id) {
       return { _id: id || undefined, firstName, lastName, phone };
     }

     // 4) Edit/Rebook session fallbacks
     const edit = sessionStorage.getItem('editingAppointment');
     if (edit) {
       const e = JSON.parse(edit);
       return e?.client?._id ? e.client : (e?.clientId ? { _id: e.clientId } : null);
    }
     const rb = sessionStorage.getItem('rebookAppointment');
     if (rb) {
      const r = JSON.parse(rb);
       return r?.client?._id ? r.client : (r?.clientId ? { _id: r.clientId } : null);
     }

     return null;
   } catch { return null; }
 }
 const [effectiveClient, setEffectiveClient] = useState(() => client || readClientFromStorage());

 const handleSignInAsDifferentUser = () => {
   try {
     sessionStorage.clear();
     [
       'client',
       'clientProfile',
       'clientFirstName',
       'clientLastName',
       'clientPhone',
       'clientId',
       'lastPhone',
     ].forEach((key) => localStorage.removeItem(key));
   } catch (error) {
     console.error('Unable to clear client session:', error);
   }

   setEffectiveClient(null);
   if (typeof onSignOut === 'function') onSignOut();
   window.location.assign('/booking/');
 };

 // If parent later provides a client prop, sync it in
 useEffect(() => {
   if (client && (!effectiveClient || client._id !== effectiveClient._id)) {
     setEffectiveClient(client);
   }
 }, [client, effectiveClient]); 

// ✅ Re-persist canonically so refreshes keep the name/phone visible
useEffect(() => {
  try {
    if (effectiveClient && (effectiveClient._id || effectiveClient.firstName || effectiveClient.phone)) {
      localStorage.setItem('client', JSON.stringify(effectiveClient));
      if (effectiveClient.phone) localStorage.setItem('lastPhone', effectiveClient.phone);
    }
  } catch {console.log("");}
}, [effectiveClient]);

useEffect(() => {
  API.get('/booking-status')
    .then(({ data }) => {
      setBookingStatus({
        currentNotices: Array.isArray(data?.currentNotices) ? data.currentNotices : [],
        futureNotices: Array.isArray(data?.futureNotices) ? data.futureNotices : [],
        promotions: Array.isArray(data?.promotions) ? data.promotions : [],
        storeStatus: data?.storeStatus || null,
      });
    })
    .catch((error) => {
      console.error('Unable to load booking notices:', error?.response?.data || error.message);
    });
}, []);

const relationshipStylistId = useMemo(() => relationshipStylistIdFor(effectiveClient), [effectiveClient]);
const assignedStylistId = useMemo(() => idOf(effectiveClient?.assignedStylistId), [effectiveClient]);
const preferredStylistId = useMemo(() => idOf(effectiveClient?.preferredStylistId), [effectiveClient]);
const lastStylistId = useMemo(() => idOf(effectiveClient?.lastStylistId), [effectiveClient]);

  useEffect(() => {
    Promise.all([
      API.get('/services'),
      API.get('/services/settings/booking-controls').catch(() => ({ data: null })),
    ])
      .then(([servicesRes, settingsRes]) => {
        const data = Array.isArray(servicesRes.data) ? servicesRes.data : [];
        setServices(data);
        const ordered = ['Color', 'Haircut', 'Style', 'Texturizing', 'Treatment', 'Hair-Removal', 'Add-ons'];
        const unique = [...new Set(data.map(s => s.category))];
        const sorted = [
          ...ordered.filter(c => unique.includes(c)),
          ...unique.filter(c => !ordered.includes(c)).sort((a, b) => String(a).localeCompare(String(b))),
        ];
        setCategories(sorted);

        const max = Number(settingsRes?.data?.maxOnlineServicesPerVisit || 2);
        const safeMax = [1, 2, 3, 4].includes(max) ? max : 2;
        setBookingSettings({
          maxOnlineServicesPerVisit: safeMax,
          limitMessage: settingsRes?.data?.limitMessage || `For more than ${safeMax} service${safeMax === 1 ? '' : 's'}, please call Rakie Salon so we can allocate enough time for your visit.`,
        });
      })
      .catch(err => toast.error('Failed to load services'));
  }, []);


// Normalize original (baseline) values from the editing appointment
const baseline = useMemo(() => {
  if (!editingAppointment) return null;
  return {
    clientId: effectiveClient?._id || editingAppointment.clientId,
    serviceId: editingAppointment.serviceId || editingAppointment.service?._id || null,
    serviceName: editingAppointment.service?.name || editingAppointment.service || null,
    workerId: idOf(editingAppointment.workerId || editingAppointment.worker || editingAppointment.priceSnapshot?.workerId),
    date: editingAppointment.date || null,
    time: editingAppointment.time || null,
    addOnIds: (editingAppointment.addOns || []).map(a => (typeof a === 'string' ? a : a._id)),
  };
}, [editingAppointment, effectiveClient?._id]);

// Current intent (selected + fallbacks to baseline in edit mode)
const current = useMemo(() => {
  const svcId = selectedService?._id || baseline?.serviceId || null;
  const date = selectedDate || baseline?.date || null;
  const time = selectedTime || baseline?.time || null;
  const workerId = selectedWorker?._id || baseline?.workerId || null;
  const addOnIds = selectedAddOns.length
    ? selectedAddOns.map(a => a._id)
    : (baseline?.addOnIds || []);
  const clientId = effectiveClient?._id || baseline?.clientId || null;
  return { clientId, serviceId: svcId, workerId, date, time, addOnIds };
}, [selectedService, selectedWorker, selectedDate, selectedTime, selectedAddOns, baseline, effectiveClient?._id]);

const isEdit = mode === 'edit' && !!baseline;

// “Changed” = any diff vs baseline (service/date/time/add-ons)
const changed = useMemo(() => {
  if (!isEdit || !baseline) return false;
  const sameService = baseline.serviceId === current.serviceId;
  const sameDate = baseline.date === current.date;
  const sameWorker = (baseline.workerId || '') === (current.workerId || '');
  const sameTime = baseline.time === current.time;
  const arrEq = (a, b) =>
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const sameAddOns = arrEq(baseline.addOnIds || [], current.addOnIds || []);
  return !(sameService && sameWorker && sameDate && sameTime && sameAddOns);
}, [isEdit, baseline, current]);

// Validity and button state
const maxServiceLimit = [1, 2, 3, 4].includes(Number(bookingSettings.maxOnlineServicesPerVisit)) ? Number(bookingSettings.maxOnlineServicesPerVisit) : 2;
const basketServiceCount = mode === 'create' ? serviceBasket.length : (current.serviceId ? 1 : 0);
const basketTotalDuration = mode === 'create'
  ? serviceBasket.reduce((sum, item) => sum + basketItemDuration(item), 0)
  : 0;
const primaryBasketItem = serviceBasket[0] || null;
const primaryService = mode === 'create' ? (primaryBasketItem?.service || selectedService) : selectedService;
const workerRequired = !!(mode === 'create' ? primaryService?._id : current.serviceId);
const hasSelectedServiceForBooking = mode === 'create' ? serviceBasket.length > 0 : !!current.serviceId;
const hasAllRequired = !!(current.clientId && hasSelectedServiceForBooking && current.date && current.time && (!workerRequired || current.workerId));
const canSubmit = (isEdit ? (hasAllRequired && changed) : hasAllRequired) && !bookingCompleteNotice;

// After services load, preselect by desired service id (from URL or session)
useEffect(() => {
  if (!services.length) return;

  const params = new URLSearchParams(window.location.search);
  const desiredId = params.get('service') || sessionStorage.getItem('desiredServiceId');
  const preDate = params.get('date'); // YYYY-MM-DD
  const preTime = params.get('time'); // 'HH:MM'
  const openAddons = params.get('addons') === '1';

  if (desiredId) {
    const svc = services.find(s => s._id === desiredId);
    if (svc) {
      setSelectedCategory(svc.category);
      setSelectedService(svc);
      if (openAddons) setShowAddOnModal(true);
    }
  }

  if (preDate) setSelectedDate(preDate);
  if (preTime) setSelectedTime(preTime);

  // Clean the URL if service param existed
  if (params.get('service') || preDate || preTime || openAddons) {
    ['service', 'date', 'time', 'addons'].forEach(k => params.delete(k));
    const clean = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
    window.history.replaceState({}, '', clean);
  }
}, [services]);


useEffect(() => {
  const editRaw = sessionStorage.getItem('editingAppointment');
  const rebookRaw = sessionStorage.getItem('rebookAppointment');
  if (editRaw) {
   let edit = null;
   try { edit = JSON.parse(editRaw); } catch {console.log("editRaw parse error");}
   if (!edit) return;
   setEditingAppointment(edit);
    setMode('edit');

    // Prefill once services are loaded
    if (services.length) {
      const svc = services.find(s => s._id === edit.serviceId || s.name === edit.service);
      if (svc) {
        setSelectedCategory(svc.category);
        setSelectedService(svc);
      }
      setSelectedDate(edit.date);
      setSelectedTime(edit.time);
    }
  } else if (rebookRaw) {
   let rb = null;
   try { rb = JSON.parse(rebookRaw); } catch {console.log("rebookRaw parse error");}
   if (!rb) return;
    setMode('rebook');

    if (services.length) {
      const svc = services.find(s => s._id === rb.serviceId || s.name === rb.service);
      if (svc) {
        setSelectedCategory(svc.category);
        setSelectedService(svc);
      }
     
    }
    // Move date to today or next open day; leave time null
    const todayISO = new Date().toISOString().split('T')[0];
    setSelectedDate(todayISO);
    setSelectedTime(null);

  }

}, [services]); 


useEffect(() => {
  let active = true;

  API.get('/store-hours')
    .then(({ data }) => {
      if (active) setStoreHours(data);
    })
    .catch((error) => {
      console.error('Unable to load store hours:', error.response?.data || error.message);
      if (active) setStoreHours([]);
    });

  return () => {
    active = false;
  };
}, []);

useEffect(() => {
  setSelectedWorker(null);
  setShowStylistOptions(false);
  setRelationshipStylistUnavailable(false);
  setSelectedTime(null);
}, [effectiveClient?._id]);

useEffect(() => {
  if (!primaryService?._id) {
    setAvailableWorkers([]);
    setSelectedWorker(null);
    setRelationshipStylistUnavailable(false);
    return;
  }

  API.get('/workers', { params: { serviceId: primaryService._id } })
    .then(({ data }) => {
      const workers = data?.workers || [];
      setAvailableWorkers(workers);

      const baselineWorker = baseline?.workerId ? workers.find((w) => idOf(w) === baseline.workerId) : null;
      const assignedWorker = assignedStylistId ? workers.find((w) => idOf(w) === assignedStylistId) : null;
      const preferredWorker = preferredStylistId ? workers.find((w) => idOf(w) === preferredStylistId) : null;
      const lastWorker = lastStylistId ? workers.find((w) => idOf(w) === lastStylistId) : null;
      const relationshipWorker = assignedWorker || preferredWorker || lastWorker;

      setRelationshipStylistUnavailable(!!relationshipStylistId && !relationshipWorker);

      setSelectedWorker((prev) => {
        if (prev && workers.some((w) => idOf(w) === idOf(prev))) return prev;
        return baselineWorker || relationshipWorker || (workers.length === 1 ? workers[0] : null);
      });
    })
    .catch(() => {
      setAvailableWorkers([]);
      setSelectedWorker(null);
      setRelationshipStylistUnavailable(false);
    });
}, [primaryService?._id, baseline?.workerId, assignedStylistId, preferredStylistId, lastStylistId, relationshipStylistId]);


useEffect(() => {
  let cancelled = false;

  const fetchForDate = async () => {
    if (!selectedDate) {
      setCalendarStatus(null);
      return;
    }

    try {
      const { data } = await API.get('/availability/status', { params: { date: selectedDate } });
      if (!cancelled) setCalendarStatus(data || null);
    } catch {
      if (!cancelled) setCalendarStatus(null);
    }
  };

  fetchForDate();
  return () => { cancelled = true; };
}, [selectedDate]);

useEffect(() => {
  if (calendarStatus?.storeClosed || calendarStatus?.onlineBookingOff) {
    setAvailableTimes([]);
    setSelectedTime(null);
    return;
  }

  if (primaryService && selectedDate && (!workerRequired || selectedWorker)) {
    const extra = selectedAddOns.reduce((sum, a) => sum + (a.duration || 0), 0);
    const singleDuration = (selectedWorker?.duration || primaryService.duration || 0) + extra;
    const totalDuration = mode === 'create' ? basketTotalDuration : singleDuration;

   const params = { date: selectedDate, serviceId: primaryService._id, duration: totalDuration };
   if (selectedWorker?._id) params.workerId = selectedWorker._id;
 if (isEdit && editingAppointment) params.excludeId = getEditingId(editingAppointment);
 API.get('/availability', { params })
      .then(({ data }) => {
        const rows = Array.isArray(data) ? data : [];
        const mapped = rows.map(t => ({ time: t.time, available: t.status === 'free' }));
        setAvailableTimes(mapped);
      })
      .catch(() => setAvailableTimes([]));
  }
}, [primaryService, selectedWorker, workerRequired, selectedDate, selectedAddOns, basketTotalDuration, mode, isEdit, editingAppointment, calendarStatus, availabilityRefreshKey]);


  const handleServiceClick = async (service) => {
    const specialDeal = getSpecialDealForService(service, promotionConfig);
    const previousDate = selectedDate;

    if (mode === 'create') {
      const alreadyInBasket = serviceBasket.some((item) => idOf(item.service) === idOf(service));
      if (!alreadyInBasket && serviceBasket.length >= maxServiceLimit) {
        toast.info(bookingSettings.limitMessage || `For more than ${maxServiceLimit} services, please call Rakie Salon so we can allocate enough time for your visit.`);
        return;
      }

      let itemId = null;
      if (alreadyInBasket) {
        const existing = serviceBasket.find((item) => idOf(item.service) === idOf(service));
        itemId = existing?.id || null;
        setSelectedAddOns(existing?.addOns || []);
      } else {
        itemId = `${service._id}-${Date.now()}`;
        setServiceBasket((prev) => [...prev, { id: itemId, service, addOns: [] }]);
        setSelectedAddOns([]);
      }
      setActiveBasketItemId(itemId);
    } else {
      setSelectedAddOns([]);
    }

    setSelectedService(service);
    if (mode !== 'create' || serviceBasket.length === 0) {
      setSelectedWorker(null);
      setShowStylistOptions(false);
      setRelationshipStylistUnavailable(false);
      setAvailableWorkers([]);
    }
    setSelectedDate(null);
    setSelectedTime(null);
    setCouponResult(null);

    if (shouldShowClientPromotion && specialDeal && promotionConfig.warnWrongDay) {
      if (previousDate && !doesDateQualifyForDeal(previousDate, specialDeal)) {
        toast.warning(
          `This service has a promotion, but ${getDealAppliesOnlyText(specialDeal)} The discount will not apply to the selected date; final pricing will be confirmed by the salon.`
        );
      } else if (previousDate && doesDateQualifyForDeal(previousDate, specialDeal)) {
        toast.success(getDealQualifiedText(specialDeal));
      } else {
        toast.info(
          `This service has a promotion. ${getDealAppliesOnlyText(specialDeal)} The discount is applied to the final eligible service total after salon pricing is confirmed.`
        );
      }
    }

    try {
      const { data } = await API.get(`/services/${service._id}/addons`);
      setAddOns(data);
      if (data.length > 0) {
        setShowAddOnModal(true);
      }
    } catch {
      setAddOns([]);
    }
  };

  const removeBasketItem = (itemId) => {
    setServiceBasket((prev) => {
      const next = prev.filter((item) => item.id !== itemId);
      if (activeBasketItemId === itemId) {
        const nextActive = next[next.length - 1] || null;
        setActiveBasketItemId(nextActive?.id || null);
        setSelectedService(nextActive?.service || null);
        setSelectedAddOns(nextActive?.addOns || []);
      }
      return next;
    });
    setSelectedDate(null);
    setSelectedTime(null);
    setCouponResult(null);
  };

// Format "HH:MM" (or "HH:MM:ss") -> "h:mmam/pm"
function format24To12(timeStr) {
  if (!timeStr) return '';
  const [hStr, mStr] = String(timeStr).split(':');
  let h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10) || 0;
if (Number.isNaN(h)) return timeStr;
 const ampm = h >= 12 ? 'pm' : 'am';
  h = h % 12; if (h === 0) h = 12;
  const mm = String(m).padStart(2, '0');
  return `${h}:${mm}${ampm}`;
}


// Try several common update endpoints until one succeeds.
async function updateAppointmentOnAnyEndpoint(appointmentId, payload) {
  const candidates = [
    { method: 'patch', url: `/appointments/${appointmentId}`, withIdInBody: false },
    { method: 'put',   url: `/appointments/${appointmentId}`, withIdInBody: false },
    { method: 'post',  url: `/appointments/update/${appointmentId}`, withIdInBody: false },
    { method: 'post',  url: `/appointments/update`, withIdInBody: true }, // expects {_id,...}
    { method: 'put',   url: `/appointments`,        withIdInBody: true }, // expects {_id,...}
    { method: 'patch', url: `/admin/appointments/${appointmentId}`, withIdInBody: false },
  ];

  let lastErr = null;
  for (const c of candidates) {
    try {
      const body = c.withIdInBody ? { ...payload, _id: appointmentId } : payload;
      await API[c.method](c.url, body);
      return; // success
    } catch (e) {
      // If it's a 404 (route not found), try the next candidate.
      if (e?.response?.status === 404) { lastErr = e; continue; }
      // For other errors (400/409/500), bubble up immediately.
      throw e;
    }
  }
  // If we exhausted all candidates with 404s, surface a helpful error.
  const msg = 'No matching update endpoint found (tried PATCH/PUT /appointments/:id, POST /appointments/update, etc.).';
  const err = new Error(msg);
  err.cause = lastErr;
  throw err;
}

function persistClientForDashboard() {
  try {
    // prefer the live client object; otherwise build a minimal one
    const minimal =
      effectiveClient ||
      editingAppointment?.client ||
      { _id: current.clientId, firstName: editingAppointment?.client?.firstName, lastName: editingAppointment?.client?.lastName };
    if (minimal && minimal._id) {
      localStorage.setItem('client', JSON.stringify(minimal));
    }
  } catch {console.log("id is bad must reinter phone")}
}



const applyCouponCode = async () => {
  const code = String(couponCode || '').trim().toUpperCase();
  if (!code) {
    setCouponResult(null);
    toast.info('Enter a coupon code first.');
    return null;
  }

  const selectedSvcForCoupon = primaryService || selectedService || services.find(s => s._id === current.serviceId) || null;
  if (!current.clientId || !current.serviceId || !current.date || !selectedSvcForCoupon) {
    toast.warning('Select a service and date before applying a coupon.');
    return null;
  }

  setCouponChecking(true);
  try {
    const { data } = await API.post('/promotions/validate-coupon', {
      couponCode: code,
      clientId: current.clientId,
      serviceId: current.serviceId,
      serviceName: selectedSvcForCoupon?.name || baseline?.serviceName || '',
      date: current.date,
      workerId: current.workerId,
      workerTierKey: selectedWorker?.tierKey || '',
    });
    setCouponResult({ valid: true, deal: data.deal, code });
    toast.success(`Coupon applied: ${data.deal?.appointmentLabel || data.deal?.title || code}`);
    return data.deal;
  } catch (err) {
    const msg = err?.response?.data?.error || 'Coupon is not valid for this service/date.';
    setCouponResult({ valid: false, error: msg, code });
    toast.error(msg);
    return null;
  } finally {
    setCouponCode('');
    setCouponChecking(false);
  }
};

const resetForAnotherSeparateService = () => {
  setSelectedCategory(null);
  setSelectedService(null);
  setSelectedWorker(null);
  setAvailableWorkers([]);
  setShowStylistOptions(false);
  setRelationshipStylistUnavailable(false);
  setSelectedDate(null);
  setSelectedTime(null);
  setAvailableTimes([]);
  setAddOns([]);
  setSelectedAddOns([]);
  setShowAddOnModal(false);
  setCouponCode('');
  setCouponResult(null);
  setBookingCompleteNotice(null);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const finishOrContinueAfterCreate = () => {
  const max = Number(bookingSettings.maxOnlineServicesPerVisit || 2);
  const safeMax = [1, 2, 3, 4].includes(max) ? max : 2;
  const nextCount = separateServiceCount + 1;
  const reachedLimit = nextCount >= safeMax;
  const remaining = Math.max(0, safeMax - nextCount);

  setSeparateServiceCount(nextCount);
  writeOnlineBookingCount(nextCount);
  setBookingCompleteNotice({
    count: nextCount,
    max: safeMax,
    remaining,
    reachedLimit,
    limitMessage: bookingSettings.limitMessage || `For more than ${safeMax} service${safeMax === 1 ? '' : 's'}, please call Rakie Salon so we can allocate enough time for your visit.`,
  });
  setIsSubmitting(false);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const finishBookingAndGoToDashboard = () => {
  clearOnlineBookingCount();
  persistClientForDashboard();
  sessionStorage.removeItem('rebookAppointment');
  window.location.replace('/booking/dashboard');
};

const handleSubmit = async () => {
  if (isSubmitting) return;

 if (!hasAllRequired) {
   if (!current.clientId) toast.error('Missing client — please (re)identify yourself.');
   else if (workerRequired && !current.workerId) toast.error('Please select a stylist.');
   else toast.error('Please select service, date, and time.');
    return;
  }

  if (assignedStylistId && current.workerId && idOf(current.workerId) !== assignedStylistId) {
    toast.info('This will be a one-time appointment with the selected stylist. Your default stylist will not change.');
  }

  const selectedSvcForSubmit =
    primaryService ||
    selectedService ||
    services.find(s => s._id === current.serviceId) ||
    null;

  const submitSpecialDeal = getSpecialDealForService(selectedSvcForSubmit, promotionConfig);
  const enteredCouponCode = String(couponCode || '').trim().toUpperCase();
  if (enteredCouponCode && (!couponResult?.valid || couponResult.code !== enteredCouponCode)) {
    const validCouponDeal = await applyCouponCode();
    if (!validCouponDeal) return;
  }
  const appliedCouponCode = enteredCouponCode || (couponResult?.valid ? couponResult.code : '');

  if (shouldShowClientPromotion && promotionConfig.warnWrongDay && !appliedCouponCode && submitSpecialDeal && !doesDateQualifyForDeal(current.date, submitSpecialDeal)) {
    const warning = `The promotion will not apply because ${getDealAppliesOnlyText(submitSpecialDeal)} Final pricing will be confirmed by the salon.`;
    toast.warning(warning);

    const continueBooking = window.confirm(
      `${warning} Continue booking?`
    );

    if (!continueBooking) return;
  }

  setIsSubmitting(true);

  try {
    // Derive service object for name/duration (fallback to baseline/service list)
    const svcObj = selectedSvcForSubmit;

    const baseDuration = (selectedWorker?.duration ?? svcObj?.duration ?? editingAppointment?.duration ?? 0);
    const extraDuration = (selectedAddOns.length ? selectedAddOns
                          : addOns.filter(a => current.addOnIds.includes(a._id)))
                          .reduce((sum, a) => sum + (a.duration || 0), 0);
    const duration = baseDuration + extraDuration;

   const payload = {      
      clientId: current.clientId,
      serviceId: current.serviceId,
      service: svcObj?.name || baseline?.serviceName || undefined,
      workerId: current.workerId || undefined,
      workerTierKey: selectedWorker?.tierKey || '',
      date: current.date,
      time: current.time,
      duration,
      addOns: current.addOnIds,
      status: isEdit ? (editingAppointment?.status || 'pending') : 'pending',
      couponCode: appliedCouponCode,
    };

    if (isEdit) {
      const appointmentId = getEditingId(editingAppointment);
      if (!appointmentId) {
        toast.error('Cannot update: missing appointment id.');
        setIsSubmitting(false);
        return;
      }

      if (!changed) {
        toast.info('No changes to update.');
        setIsSubmitting(false);
        return;
      }

 try {
        await updateAppointmentOnAnyEndpoint(appointmentId, { ...payload, _id: appointmentId });
        // ✅ show success immediately after DB save
        toast.success('Appointment successfully saved');

        // ✅ persist and go to dashboard
        persistClientForDashboard();
        sessionStorage.removeItem('editingAppointment');
        window.location.replace('/booking/dashboard');
        return;
      } catch (err) {
  console.error('[Update failed]', err?.response?.data || err?.message || err);
  const responseData = err?.response?.data || {};
  const isSlotConflict =
    err?.response?.status === 409 ||
    responseData?.code === 'APPOINTMENT_SLOT_CONFLICT' ||
    responseData?.code === 'INTERNAL_BATCH_SLOT_OVERLAP';

  if (isSlotConflict) {
    setSelectedTime(null);
    setAvailabilityRefreshKey((value) => value + 1);
    toast.error(responseData?.error || 'That time was just taken. Availability has been refreshed—please choose another time.');
  } else {
    toast.error(
      'Update failed: ' +
        (responseData?.error || responseData?.message || err?.message || 'No matching update endpoint')
    );
  }
  setIsSubmitting(false);
}
    }
   console.log('[client post] /appointments payload =', payload);

    // Create / Rebook
    if (mode === 'create' && serviceBasket.length > 1) {
      let cursorTime = current.time;
      const appointments = serviceBasket.map((item) => {
        const itemDuration = basketItemDuration(item);
        const row = {
          ...payload,
          serviceId: item.service._id,
          service: item.service.name,
          time: cursorTime,
          duration: itemDuration,
          addOns: (item.addOns || []).map((a) => a._id),
          bookingFlags: ['online_multi_service_visit'],
        };
        cursorTime = addMinutesToTime(cursorTime, itemDuration);
        return row;
      });

      await API.post('/appointments/batch', { appointments });
      toast.success('Appointments successfully saved together');
      clearOnlineBookingCount();
      persistClientForDashboard();
      window.location.replace('/booking/dashboard');
      return;
    }

    await API.post('/appointments', payload);
    toast.success('Appointment successfully saved');

    if (mode === 'create') {
      clearOnlineBookingCount();
      persistClientForDashboard();
      window.location.replace('/booking/dashboard');
      return;
    }

    // Rebook flow returns to dashboard after one appointment.
    clearOnlineBookingCount();
    persistClientForDashboard();
    sessionStorage.removeItem('rebookAppointment');
    window.location.replace('/booking/dashboard');
  } catch (err) {
    console.error('[save error]', err?.response?.data || err?.message || err);
    const responseData = err?.response?.data || {};
    const isSlotConflict =
      err?.response?.status === 409 ||
      responseData?.code === 'APPOINTMENT_SLOT_CONFLICT' ||
      responseData?.code === 'INTERNAL_BATCH_SLOT_OVERLAP';

    if (isSlotConflict) {
      setSelectedTime(null);
      setAvailabilityRefreshKey((value) => value + 1);
      toast.error(responseData?.error || 'That time was just taken. Availability has been refreshed—please choose another time.');
    } else {
      toast.error(responseData?.error || responseData?.message || 'Failed to save appointment');
    }
    setIsSubmitting(false);
  }
};

  const handleDateClick = async ({ dateStr }) => {
const selectedDay = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
const storeDay = storeHours.find(h => h.day.toLowerCase() === selectedDay.toLowerCase());

  const today = new Date().toISOString().split('T')[0];
   if (dateStr > maxISO) {
     toast.warning('You can book up to 3 months ahead.');
     return;
   }

  if (dateStr < today) {
    toast.warning('Cannot book in the past');
    return;
  }

  try {
    const { data } = await API.get('/availability/status', { params: { date: dateStr } });
    if (data?.storeClosed) {
      toast.warning(data.customerMessage || 'The store is closed on this date.');
      setSelectedDate(dateStr);
      setCalendarStatus(data);
      setAvailableTimes([]);
      setSelectedTime(null);
      return;
    }
    if (data?.onlineBookingOff) {
      toast.info(data.customerMessage || 'Online booking is not available for this date. Please call Rakie Salon to schedule.');
      setSelectedDate(dateStr);
      setCalendarStatus(data);
      setAvailableTimes([]);
      setSelectedTime(null);
      return;
    }
    if (data?.hasSpecialHours) {
      toast.info(data.customerMessage || `Special hours for this date: ${data.open} - ${data.close}.`);
    }
  } catch {console.log('calendar status check failed');}

  if (storeDay?.closed) {
    toast.warning('The store is closed on this day.');
    return;
  }

  setSelectedDate(dateStr);
  setCouponResult(null);

  const selectedDealForDate = getSpecialDealForService(selectedService, promotionConfig);
  if (shouldShowClientPromotion && selectedDealForDate && promotionConfig.warnWrongDay) {
    if (doesDateQualifyForDeal(dateStr, selectedDealForDate)) {
      toast.success(getDealQualifiedText(selectedDealForDate));
    } else {
      toast.warning(
        `The promotion will not apply for this date. ${getDealAppliesOnlyText(selectedDealForDate)} Final pricing will be confirmed by the salon.`
      );
    }
  }

if (mode === 'rebook' && storeDay?.closed) {
  toast.info('That day is closed. Picking the next open day.');
  const next = new Date(dateStr);
  next.setDate(next.getDate() + 1);
  setSelectedDate(next.toISOString().split('T')[0]);
}


};


  const today = new Date();
  const max = new Date(today);
  max.setMonth(max.getMonth() + 3); // allow booking up to 3 months ahead
  const maxISO = max.toISOString().split('T')[0];


// Slim, no-gray, mini calendar CSS — must be rendered inside JSX
const tightCalendarCSS = (
  <style>{`
    /* 1) Make rows short */
    .fc { --fc-daygrid-row-min-height: 14px; } /* default ~24px+ */
    .fc .fc-daygrid-day-events { min-height: 0 !important; } /* ensure no extra event gutter */
    .fc .fc-scrollgrid,
    .fc .fc-scrollgrid-liquid,
    .fc .fc-scrollgrid-section-liquid > td,
    .fc .fc-daygrid-body,
    .fc .fc-daygrid-body-unbalanced,
    .fc .fc-daygrid-body table,
    .fc .fc-scrollgrid-sync-table {
      height: auto !important;
      border: 0 !important;
    }

    /* 2) Remove heavy borders and padding that add vertical bulk */
    .fc .fc-daygrid-day, .fc-theme-standard td, .fc-theme-standard th { 
      border: 0 !important; 
    }
    .fc .fc-daygrid-day-frame { padding: 2px 3px; }
    .fc .fc-col-header-cell-cushion { 
      padding: 2px 0; 
      font-size: 11px; 
      font-weight: 600; 
      color: #6b7280; /* gray-500 */
    }
    .fc .fc-daygrid-day-number { font-size: 12px; line-height: 1; }

    /* 3) Kill the “past day” gray tint */
    .fc .fc-day-past { 
      background: transparent !important; 
      opacity: 1 !important;
      color: inherit !important;
    }

    /* 4) Today + Selected styles (lightweight) */
    .fc .fc-day-today { background: #f0fdf4 !important; } /* green-50 */
    .fc .is-selected { background: #2563eb !important; color: #FFA500 !important; }

    /* 5) Hover feedback without adding height */
    .fc .fc-daygrid-day-frame:hover { background: #eff6ff; } /* blue-50 */
    .fc .fc-day-disabled { background: transparent !important; opacity: 1 !important; }

  `}</style>
);

const selectedSpecialDeal = shouldShowClientPromotion ? getSpecialDealForService(selectedService, promotionConfig) : null;
const selectedDateQualifiesForSpecial = selectedSpecialDeal && doesDateQualifyForDeal(selectedDate, selectedSpecialDeal);
const selectedWorkerIsAssigned = !!assignedStylistId && !!selectedWorker && idOf(selectedWorker) === assignedStylistId;
const selectedWorkerIsRelationship = !!relationshipStylistId && !!selectedWorker && idOf(selectedWorker) === relationshipStylistId;
const shouldCollapseStylistPicker = !!selectedWorker && !showStylistOptions;
const scheduleNotices = [
  ...bookingStatus.currentNotices.filter((notice) => !notice.onlineBookingOff),
  ...bookingStatus.futureNotices,
];
const scheduleNoticeCount = scheduleNotices.length + bookingStatus.promotions.length;
const formatNoticeDate = (value) => {
  if (!value) return '';
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};
const formatNoticeRange = (notice) => {
  if (!notice?.startDate) return '';
  const start = formatNoticeDate(notice.startDate);
  const end = formatNoticeDate(notice.endDate);
  return !end || notice.startDate === notice.endDate ? start : `${start}–${end}`;
};

return (
<div className="p-2 relative max-w-screen-md mx-auto">
    {tightCalendarCSS}

  <div className="p-2 relative max-w-screen-md mx-auto">
    <div className="sticky top-0 z-40 bg-white border-b py-3 px-4 shadow-sm flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <div className="text-sm font-semibold text-gray-700">
          <div>
            Welcome, {`${effectiveClient?.firstName || ''} ${effectiveClient?.lastName || ''}`.trim() || 'Client'}
          </div>
          <button
            type="button"
            onClick={handleSignInAsDifferentUser}
            className="mt-1 text-xs font-medium text-blue-600 underline hover:text-blue-800"
          >
            Sign out / use a different account
          </button>
        </div>
        <img src={logo} alt="Logo" className="h-8 w-8" />
      </div>

      {/* Booking progress summary. Service names/prices stay in the Your services tile only. */}
      <div className="text-center font-medium text-sm text-gray-800">
        {mode === 'create' ? (
          <>
            {basketServiceCount > 0 ? `${basketServiceCount} service${basketServiceCount === 1 ? '' : 's'} selected` : 'Select services'}
            {selectedWorker && <> · {selectedWorker.displayName || workerDisplayName(selectedWorker)}</>}
            {selectedDate && <> → {selectedDate}</>}
            {selectedTime && <> @ {format24To12(selectedTime)}</>}
          </>
        ) : (
          <>
            {selectedService?.name || 'Select a Service'}
            {selectedSpecialDeal && (
              <span
                className={`ml-2 inline-block rounded px-2 py-[2px] text-[11px] font-semibold uppercase tracking-wide ${
                  selectedDateQualifiesForSpecial
                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                    : 'bg-gray-100 text-gray-600 border border-gray-200'
                }`}
              >
                {selectedDateQualifiesForSpecial ? selectedSpecialDeal.appointmentLabel : selectedSpecialDeal.serviceOnlyLabel}
              </span>
            )}
            {selectedWorker && <> · {selectedWorker.displayName}</>}
            {selectedDate && <> → {selectedDate}</>}
            {selectedTime && <> @ {format24To12(selectedTime)}</>}
            <span className="ml-2 inline-block text-[11px] px-2 py-[2px] rounded bg-gray-100 text-gray-600 uppercase tracking-wide">
              {mode}
            </span>
          </>
        )}
      </div>

      {selectedSpecialDeal && (
        <div
          className={`rounded-md border px-3 py-2 text-center text-xs ${
            selectedDate
              ? selectedDateQualifiesForSpecial
                ? 'border-amber-300 bg-amber-50 text-amber-800'
                : 'border-red-200 bg-red-50 text-red-700'
              : 'border-gray-200 bg-gray-50 text-gray-700'
          }`}
        >
          {selectedDate
            ? selectedDateQualifiesForSpecial
              ? getDealQualifiedText(selectedSpecialDeal)
              : `The promotion will not apply for this date. ${getDealAppliesOnlyText(selectedSpecialDeal)} Final pricing will be confirmed by the salon.`
            : `This service has a promotion. Choose an eligible day to use it. ${getDealAppliesOnlyText(selectedSpecialDeal)} The discount is calculated from the final eligible service total.`}
        </div>
      )}

      {editingAppointment && (
        <div className="text-center text-xs text-yellow-600">
 <span className="font-semibold">Original:</span> {editingAppointment.service} → {editingAppointment.date} @ {format24To12(editingAppointment.time)}
        </div>
      )}

      </div>

      {scheduleNoticeCount > 0 && (
        <details className="mx-1 mt-2 rounded-lg border border-gray-200 bg-white shadow-sm">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-gray-700">
            <span className="flex min-w-0 items-center justify-between gap-2">
              <span className={`min-w-0 truncate ${bookingStatus.storeStatus?.isOpenNow ? 'text-emerald-700' : 'text-red-700'}`}>
                {bookingStatus.storeStatus?.statusText || 'Store status available'}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                {bookingStatus.promotions.length > 0 && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                    {bookingStatus.promotions.length} {bookingStatus.promotions.length === 1 ? 'deal' : 'deals'}
                  </span>
                )}
                {bookingStatus.futureNotices.length > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                    {bookingStatus.futureNotices.length} future {bookingStatus.futureNotices.length === 1 ? 'closure' : 'closures'}
                  </span>
                )}
              </span>
            </span>
          </summary>
          <div className="space-y-2 border-t border-gray-100 p-3">
            {bookingStatus.currentNotices.filter((notice) => !notice.onlineBookingOff).map((notice) => (
              <div key={notice.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                <div className="flex items-start justify-between gap-3">
                  <strong>{notice.title}</strong>
                  {formatNoticeRange(notice) && <span className="shrink-0 text-xs font-semibold text-red-700">{formatNoticeRange(notice)}</span>}
                </div>
                {notice.message && <p className="mt-1 text-xs text-red-800">{notice.message}</p>}
                {notice.storeClosed && !notice.onlineBookingOff && <p className="mt-1 text-xs font-semibold">Online booking is available for another date.</p>}
                {notice.open && notice.close && <p className="mt-1 text-xs font-semibold">Special hours: {notice.open}–{notice.close}</p>}
              </div>
            ))}
            {bookingStatus.futureNotices.map((notice) => (
              <div key={notice.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <div className="flex items-start justify-between gap-3">
                  <strong>{notice.title}</strong>
                  {formatNoticeRange(notice) && <span className="shrink-0 text-xs font-semibold text-amber-800">{formatNoticeRange(notice)}</span>}
                </div>
                {notice.message && <p className="mt-1 text-xs text-amber-900">{notice.message}</p>}
                {notice.storeClosed && !notice.onlineBookingOff && <p className="mt-1 text-xs font-semibold">Online booking will remain available for another date.</p>}
                {notice.open && notice.close && <p className="mt-1 text-xs font-semibold">Special hours: {notice.open}–{notice.close}</p>}
              </div>
            ))}
            {bookingStatus.promotions.map((promotion) => (
              <div key={promotion.id} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
                <strong>{promotion.shortLabel ? `${promotion.shortLabel} — ` : ''}{promotion.title}</strong>
                {promotion.message && <p className="mt-1 text-xs text-emerald-900">{promotion.message}</p>}
              </div>
            ))}
          </div>
        </details>
      )}

      {mode === 'create' && (
        <div className="my-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="font-semibold">Your services</div>
              <div className="text-xs text-blue-700">Add all services first, then choose one date and time. We will check the total time before booking.</div>
            </div>
            <div className="text-xs font-semibold">{basketServiceCount} of {maxServiceLimit} selected</div>
          </div>

          {serviceBasket.length > 0 ? (
            <div className="mt-3 space-y-2">
              {serviceBasket.map((item, index) => (
                <div key={item.id} className="flex items-start justify-between gap-2 rounded border border-blue-100 bg-white px-3 py-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveBasketItemId(item.id);
                      setSelectedService(item.service);
                      setSelectedAddOns(item.addOns || []);
                      API.get(`/services/${item.service._id}/addons`).then(({ data }) => setAddOns(data || [])).catch(() => setAddOns([]));
                    }}
                    className="text-left"
                  >
                    <div className="font-semibold">{index + 1}. {item.service.name}</div>
                    <div className="text-xs text-gray-600">{basketItemDuration(item)} min{(item.addOns || []).length ? ` · Add-ons: ${(item.addOns || []).map(a => a.name).join(', ')}` : ''}</div>
                  </button>
                  <button type="button" onClick={() => removeBasketItem(item.id)} className="text-xs font-semibold text-red-600 underline">Remove</button>
                </div>
              ))}
              <div className="text-xs font-semibold text-blue-800">Total estimated time: {basketTotalDuration} minutes</div>
            </div>
          ) : (
            <div className="mt-3 rounded border border-dashed border-blue-200 bg-white px-3 py-2 text-xs text-blue-700">Choose the first service below to start.</div>
          )}

          {serviceBasket.length >= maxServiceLimit ? (
            <div className="mt-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {bookingSettings.limitMessage || `For more than ${maxServiceLimit} services, please call Rakie Salon so we can allocate enough time for your visit.`}
              <a className="ml-2 font-semibold underline" href={`tel:${RAKIE_PHONE}`}>Call Rakie Salon</a>
            </div>
          ) : serviceBasket.length > 0 && (
            <div className="mt-3 text-xs text-blue-700">Use the service list below to add another service before choosing date and time.</div>
          )}
        </div>
      )}

      {showAddOnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded shadow-md w-full max-w-md">
            <h2 className="text-lg font-bold mb-2">Suggested Add-ons</h2>
            <p className="mb-3 text-xs text-gray-600">
              These are added inside {selectedService?.name || 'this service'} as one appointment. If you forgot one later, book it separately from the service list when it is allowed online.
            </p>
            <div className="flex flex-wrap gap-2 mb-4">
              {addOns.map(add => (
                <label key={add._id} className="text-sm">
                  <input
                    type="checkbox"
                    className="mr-1"
                    checked={selectedAddOns.some((a) => idOf(a) === idOf(add))}
                    onChange={() => {
                      setSelectedAddOns(prev => {
                        const exists = prev.some((a) => idOf(a) === idOf(add));
                        const next = exists ? prev.filter(a => idOf(a) !== idOf(add)) : [...prev, add];
                        if (mode === 'create' && activeBasketItemId) {
                          setServiceBasket(items => items.map(item => item.id === activeBasketItemId ? { ...item, addOns: next } : item));
                          setSelectedDate(null);
                          setSelectedTime(null);
                        }
                        return next;
                      });
                    }}
                  />
                  {add.name} <span className="text-gray-500">({add.duration} min)</span>
                </label>
              ))}
            </div>
            <button
              onClick={() => setShowAddOnModal(false)}
              className="mt-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Done
            </button>
          </div>
        </div>
      )}
  <div className="flex gap-4 items-start">
        <div className="flex flex-col gap-2 w-max">
          <div className="text-sm font-semibold">Category</div>
          {categories.map(cat => (
            <button
              key={cat}
              className={`px-2 py-1 text-sm rounded whitespace-nowrap ${selectedCategory === cat ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
              onClick={() => {
                setSelectedCategory(cat);
                if (mode !== 'create') {
                  setSelectedService(null);
                  setSelectedWorker(null);
                  setShowStylistOptions(false);
                  setRelationshipStylistUnavailable(false);
                  setSelectedAddOns([]);
                  setAddOns([]);
                }
                setSelectedTime(null);
                setCouponResult(null);
              }}
            >{cat}</button>
          ))}
        </div>

        <div className="flex flex-col gap-2 w-max">
          <div className="text-sm font-semibold">Services</div>
          {services.filter(s => s.category === selectedCategory).map(service => {
            const specialDeal = shouldShowClientPromotion ? getSpecialDealForService(service, promotionConfig) : null;
            const isSelected = selectedService?._id === service._id;
            const priceOpen = openPriceServiceId === service._id;
            return (
              <div
                key={service._id}
                className="relative flex items-stretch gap-1"
                onMouseLeave={() => setOpenPriceServiceId((current) => current === service._id ? null : current)}
              >
                <button
                  type="button"
                  className={`min-w-0 flex-1 px-2 py-1 text-sm rounded whitespace-nowrap text-left ${
                    isSelected
                      ? 'bg-blue-600 text-white'
                      : specialDeal
                        ? 'bg-amber-50 border border-amber-300 text-gray-900'
                        : 'bg-gray-100'
                  }`}
                  onClick={() => handleServiceClick(service)}
                >
                  <span className="block">{service.name}</span>
                  {service.isAddOn && (
                    <span className="block text-[11px] opacity-80">Add-on or separate service</span>
                  )}
                  {specialDeal && (
                    <span
                      className={`mt-1 inline-block rounded-full px-2 py-[1px] text-[10px] font-semibold uppercase tracking-wide ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {specialDeal.shortLabel}
                    </span>
                  )}
                </button>
                <button
                  type="button"
                  aria-label={`Pricing information for ${service.name}`}
                  aria-expanded={priceOpen}
                  title={clientPriceMessage(service)}
                  onMouseEnter={() => setOpenPriceServiceId(service._id)}
                  onFocus={() => setOpenPriceServiceId(service._id)}
                  onBlur={() => setOpenPriceServiceId(null)}
                  onClick={() => setOpenPriceServiceId((current) => current === service._id ? null : service._id)}
                  className={`flex w-9 shrink-0 items-center justify-center rounded border text-base font-bold ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  }`}
                >
                  $
                </button>
                {priceOpen && (
                  <div
                    role="tooltip"
                    className="absolute right-0 top-full z-30 mt-1 w-72 max-w-[80vw] rounded-lg border border-emerald-200 bg-white p-3 text-left text-xs text-gray-700 shadow-xl whitespace-normal"
                  >
                    <div className="font-semibold text-emerald-800">
                      {clientStartingPrice(service) ? `Starting from ${clientStartingPrice(service)}` : 'Starting price requires consultation'}
                    </div>
                    <div className="mt-1">
                      Final pricing may vary based on hair length, density, condition, product needs, service complexity, and time required.
                    </div>
                    <div className="mt-1 font-medium">
                      {service.requiresConsultation ? 'Consultation is required.' : 'Consultation may be required.'} The salon will confirm final pricing.
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selectedService && (
        <div className="mt-4 rounded border bg-white p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold">Stylist</div>
              {selectedWorkerIsAssigned && (
                <div className="text-xs text-gray-500">We selected your usual stylist for you.</div>
              )}
            </div>
            {shouldCollapseStylistPicker && availableWorkers.length > 1 && (
              <button
                type="button"
                onClick={() => {
                  if (assignedStylistId) {
                    toast.info('Choose another stylist for this appointment only. Your default stylist will not change.');
                  }
                  setShowStylistOptions(true);
                }}
                className="text-xs text-gray-500 underline hover:text-gray-700"
              >
                {assignedStylistId ? 'Choose one-time stylist' : 'Change stylist'}
              </button>
            )}
          </div>

          {relationshipStylistUnavailable && !selectedWorkerIsRelationship && (
            <div className="mb-3 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Your usual stylist is not available online for this service. Please choose another stylist or call Rakie Salon.
            </div>
          )}

          {shouldCollapseStylistPicker ? (
            <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
              <div className="flex gap-3">
                {selectedWorker.photoUrl || selectedWorker.profilePhoto ? (
                  <img src={selectedWorker.photoUrl || selectedWorker.profilePhoto} alt={workerDisplayName(selectedWorker)} className="h-14 w-14 rounded-full object-cover" />
                ) : (
                  <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 text-[10px] text-gray-500">Photo</div>
                )}
                <div className="min-w-0">
                  <div className="font-semibold">{workerDisplayName(selectedWorker)}</div>
                  <div className="text-xs text-gray-600">{selectedWorker.title || 'Stylist'}{selectedWorker.experienceYears ? ` · ${selectedWorker.experienceYears}+ years` : ''}</div>
                  {selectedWorkerIsRelationship ? (
                    <div className="mt-1 text-xs text-blue-700">Your stylist is pre-selected.</div>
                  ) : (
                    <div className="mt-1 text-xs text-gray-500">This stylist is selected for this appointment.</div>
                  )}
                </div>
              </div>
            </div>
          ) : availableWorkers.length > 0 ? (
            <div className="grid gap-3 sm:grid-cols-2">
              {availableWorkers.map((worker) => {
                const selected = selectedWorker?._id === worker._id;
                const isRelationshipWorker = relationshipStylistId && idOf(worker) === relationshipStylistId;
                return (
                  <button
                    type="button"
                    key={worker._id}
                    onClick={() => { setSelectedWorker(worker); setShowStylistOptions(false); setSelectedTime(null); setCouponResult(null); }}
                    className={`text-left rounded border p-3 ${selected ? 'border-blue-600 bg-blue-50' : 'border-gray-200 bg-white hover:bg-gray-50'}`}
                  >
                    <div className="flex gap-3">
                      {worker.photoUrl || worker.profilePhoto ? (
                        <img src={worker.photoUrl || worker.profilePhoto} alt={workerDisplayName(worker)} className="h-14 w-14 rounded-full object-cover" />
                      ) : (
                        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-gray-200 text-[10px] text-gray-500">Photo</div>
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold">{workerDisplayName(worker)}</div>
                        <div className="text-xs text-gray-600">{worker.title || 'Stylist'}{worker.experienceYears ? ` · ${worker.experienceYears}+ years` : ''}</div>
                        {isRelationshipWorker && (
                          <div className="mt-1 inline-block rounded-full bg-blue-100 px-2 py-[1px] text-[10px] font-semibold text-blue-700">Your stylist</div>
                        )}
                        {(worker.specialties || []).length > 0 && (
                          <div className="mt-1 text-xs text-gray-500">{worker.specialties.slice(0, 4).join(' · ')}</div>
                        )}
                        {(worker.shortBio || worker.bio) && (
                          <div className="mt-1 line-clamp-2 text-xs text-gray-500">{worker.shortBio || worker.bio}</div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="rounded bg-yellow-50 p-2 text-sm text-yellow-800">No online stylist is assigned to this service yet. Please call Rakie Salon or ask admin to assign worker pricing.</div>
          )}
        </div>
      )}

      <div className="flex flex-row gap-4 items-start mt-4">
      <div className="border rounded shadow p-1 w-[300px] overflow-hidden">
          <FullCalendar
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
 height="auto"
 contentHeight="auto"
 expandRows={false}            
           fixedWeekCount={false}         
            showNonCurrentDates={false} 
            dayMaxEventRows={false}
            dateClick={handleDateClick}
            headerToolbar={{ left: 'prev', center: 'title', right: 'next' }}
            titleFormat={{ year: 'numeric', month: 'short' }}  // e.g., “Sep 2025”
          validRange={{ end: maxISO }}
 dayHeaderFormat={{ weekday: 'narrow' }}
dayCellClassNames={({ date }) => {
  const iso = date.toISOString().split('T')[0];
  const isToday = iso === new Date().toISOString().split('T')[0];
  const isSelected = selectedDate === iso;
  return [
    'text-[11px] leading-4 text-center font-medium rounded',
    isSelected ? 'is-selected' : 'hover:bg-blue-50',
    isToday && !isSelected ? 'ring-1 ring-green-400' : ''
  ];
}}
          />
        </div>

        <div className="overflow-y-auto max-h-[300px] space-y-1 w-40">
 {(calendarStatus?.storeClosed || calendarStatus?.onlineBookingOff) && selectedDate ? (
    <div className="rounded bg-yellow-50 p-3 text-sm text-yellow-900">
      <div>{calendarStatus.customerMessage || 'Online booking is not available for this date. Please call Rakie Salon to schedule.'}</div>
      {calendarStatus.phoneCallRequired && <a className="mt-2 inline-block font-semibold underline" href={`tel:${RAKIE_PHONE}`}>Call Rakie Salon</a>}
    </div>
  ) : availableTimes.length === 0 && selectedDate && hasSelectedServiceForBooking ? (
    <div className="rounded bg-gray-50 p-3 text-sm text-gray-600">No available times for this date. Please choose another date or call the salon.</div>
  ) : availableTimes.map(({ time, available }) => {
    const label = format24To12(time);
    return (
            <button
              key={time}
              disabled={!available}
              className={`w-full px-2 py-1 text-sm text-left rounded ${
                !available ? 'bg-yellow-300 text-gray-700 cursor-not-allowed' :
                selectedTime === time ? 'bg-blue-600 text-white' : 'bg-green-100 hover:bg-green-200'
              }`}
              onClick={() => available && setSelectedTime(time)}
              >{label}</button>
    );
 })}
        </div>
      </div>


      {client?.welcomeOffer?.code === 'NEWCLIENT10' && client?.welcomeOffer?.status === 'available' && (
        <div className="mt-4 rounded border border-green-300 bg-green-50 p-3 text-green-800">
          <div className="font-semibold">$10 New Client Credit Available</div>
          <div className="text-sm">It will apply automatically to your first completed booking.</div>
        </div>
      )}

      <div className="mt-4 border rounded bg-white p-3 space-y-2">
        <div className="text-sm font-semibold">Coupon code optional</div>
        <div className="flex flex-col sm:flex-row gap-2">
          <input
            value={couponCode}
            onChange={(e) => {
              setCouponCode(e.target.value.toUpperCase());
              setCouponResult(null);
            }}
            placeholder="Enter coupon code"
            className="border rounded p-2 flex-1 uppercase"
          />
          <button
            type="button"
            onClick={applyCouponCode}
            disabled={couponChecking || !couponCode.trim() || !selectedService || !selectedDate}
            className="px-4 py-2 bg-amber-600 text-white rounded disabled:opacity-60"
          >
            {couponChecking ? 'Checking…' : 'Apply coupon'}
          </button>
        </div>
        {couponResult?.valid && (
          <div className="text-sm rounded border border-green-200 bg-green-50 text-green-700 px-3 py-2">
            <div className="font-semibold">Coupon applied: {couponResult.deal?.title || couponResult.code} ({getDealDiscountLabel(couponResult.deal)})</div>
            <div className="mt-1 text-xs">The discount will be taken from the final eligible service total after salon pricing is confirmed.</div>
          </div>
        )}
        {couponResult && couponResult.valid === false && (
          <div className="text-sm rounded border border-red-200 bg-red-50 text-red-700 px-3 py-2">
            {couponResult.error}
          </div>
        )}
      </div>

<div className="mt-4 flex justify-center gap-3">
  {!bookingCompleteNotice && (
  <button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}
  className={`px-6 py-2 rounded text-white ${(!canSubmit || isSubmitting) ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
  
    {mode === 'edit' ? 'Update Appointment'
      : mode === 'rebook' ? 'Rebook'
      : mode === 'create' && serviceBasket.length > 1 ? 'Book Services' : 'Book Appointment'}
  </button>
  )}

  {!bookingCompleteNotice && (
  <button
    onClick={() => {
      // Cancel semantics differ by mode
      if (mode === 'edit') {
        sessionStorage.removeItem('editingAppointment');
        window.location.href = '/booking/dashboard';
      } else if (mode === 'rebook') {
        sessionStorage.removeItem('rebookAppointment');
        window.history.length > 1 ? window.history.back() : (window.location.href = '/booking');
      } else {
        // create flow
        clearOnlineBookingCount();
        window.history.length > 1 ? window.history.back() : (window.location.href = '/booking');
      }
    }}
    className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded"
  >
    Cancel
  </button>
  )}
</div>


      <img src={logo} alt="Rakie Salon Logo" className="fixed bottom-4 right-4 w-16 h-16 opacity-20 pointer-events-none" />
    
    </div>
</div>
  );
}
