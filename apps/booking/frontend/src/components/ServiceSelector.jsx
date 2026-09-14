// Finalized ServiceSelector.jsx with frozen top banner and preserved layout
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import API from '../api';
import { toast } from 'react-toastify';
import logo from '../assets/TheRSlogo.png';
import familyHubIcon from '../assets/family-hub.png';
import FamilyHub from './FamilyHub';
import {
  doesDateQualifyForDeal,
  getDealAppliesOnlyText,
  getDealQualifiedText,
  getDealDiscountLabel,
  getSpecialDealForService,
  usePromotionConfig,
} from '../utils/specialDeals';
// Pure helpers used throughout this component now live in
// utils/serviceSelectorHelpers.js — extracted so they're independently
// unit-testable and reusable, without changing any behavior here.
// See that file for the rationale and for where to continue this pattern
// if you decompose the stateful sections below (family booking, coupons,
// handleSubmit) into their own hooks/components.
import {
  bookingDebug,
  summarizeClientAppointmentResponse,
  clearOnlineBookingCount,
  idOf,
  workerDisplayName,
  timeToMinutes,
  addMinutesToTime,
  basketItemDuration,
  relationshipStylistIdFor,
  clientStartingPrice,
  clientPriceMessage,
} from '../utils/serviceSelectorHelpers';

const RAKIE_PHONE = '5854146041';

export default function ServiceSelector({ client, onSignOut }) {
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [categorySelectionMade, setCategorySelectionMade] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedWorker, setSelectedWorker] = useState(null);
  const [availableWorkers, setAvailableWorkers] = useState([]);
  const [showStylistOptions, setShowStylistOptions] = useState(false);
  const [relationshipStylistUnavailable, setRelationshipStylistUnavailable] = useState(false);
  const [selectedDate, setSelectedDate] = useState(null);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [selectedTime, setSelectedTime] = useState(null);
  const [availabilityRefreshKey, setAvailabilityRefreshKey] = useState(0);
  const availabilityRequestRef = useRef(0);
  const [addOns, setAddOns] = useState([]);
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [serviceBasket, setServiceBasket] = useState([]);
  const [activeBasketItemId, setActiveBasketItemId] = useState(null);
  const [editingBasketItemId, setEditingBasketItemId] = useState(null);
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
  const [bookingCompleteNotice, setBookingCompleteNotice] = useState(null);
  const [guidedStep, setGuidedStep] = useState(1); // 1 who, 2 service, 3 date/time, 4 review (client create flow only)
  const [pendingServiceToAdd, setPendingServiceToAdd] = useState(null);
  const [appointmentCapacity, setAppointmentCapacity] = useState({
    clientId: '',
    loading: true,
    activeAppointments: [],
    count: 0,
    max: 2,
    canCreate: false,
    error: '',
  });
  const [serviceAddedPrompt, setServiceAddedPrompt] = useState(null);
  const [isSelectingAdditionalService, setIsSelectingAdditionalService] = useState(false);
  const [familyFinalReviewRows, setFamilyFinalReviewRows] = useState(null);
  const [familyMembers, setFamilyMembers] = useState([]);
  const [selectedBookingClientIds, setSelectedBookingClientIds] = useState([]);
  const [activeFamilyBookingIndex, setActiveFamilyBookingIndex] = useState(0);
  const [familyBookingDrafts, setFamilyBookingDrafts] = useState([]);
  const [familyStepSelections, setFamilyStepSelections] = useState({});
  const [familyScheduleMode, setFamilyScheduleMode] = useState('individual'); // individual | together-auto | together-same | together-back-to-back
  const [showAddFamilyMember, setShowAddFamilyMember] = useState(false);
  const [familyMemberForm, setFamilyMemberForm] = useState({ firstName: '', lastName: '', phone: '', relationship: 'family', dob: '', guardianAttestation: false });
  const [familySaving, setFamilySaving] = useState(false);
  const [familyPhonePromptOpen, setFamilyPhonePromptOpen] = useState(false);
  const [familyPhonePromptMessage, setFamilyPhonePromptMessage] = useState('A phone number for this family member is required.');
  const [familyPhoneFieldError, setFamilyPhoneFieldError] = useState('');
  const [familyNoPhoneMode, setFamilyNoPhoneMode] = useState(false);
  const familyPhoneInputRef = useRef(null);
  const [showFamilyBookingPanel, setShowFamilyBookingPanel] = useState(false);
  const [familyScheduleSummary, setFamilyScheduleSummary] = useState(null);
  const [familyOverviewMembers, setFamilyOverviewMembers] = useState([]);
  const [showFamilyScheduleHub, setShowFamilyScheduleHub] = useState(false);
  const [openPriceServiceId, setOpenPriceServiceId] = useState(null);
  const [bookingStatus, setBookingStatus] = useState({ currentNotices: [], futureNotices: [], promotions: [], storeStatus: null, shopMode: null });
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
       'clientToken',
     ].forEach((key) => localStorage.removeItem(key));
   } catch (error) {
     console.error('Unable to clear client session:', error);
   }

   setEffectiveClient(null);
   if (typeof onSignOut === 'function') onSignOut();
   window.location.assign('/booking/');
 };

 const handleCancelBooking = () => {
   if (mode === 'edit') {
     sessionStorage.removeItem('editingAppointment');
     window.location.href = '/booking/dashboard';
   } else if (mode === 'rebook') {
     sessionStorage.removeItem('rebookAppointment');
     window.history.length > 1 ? window.history.back() : (window.location.href = '/booking');
   } else {
     clearOnlineBookingCount();
     window.history.length > 1 ? window.history.back() : (window.location.href = '/booking');
   }
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
  const ownerId = effectiveClient?._id;
  if (!ownerId || mode !== 'create') return;

  let cancelled = false;
  API.get(`/clients/${ownerId}/family/overview`)
    .then(({ data }) => {
      if (!cancelled) {
        setFamilyScheduleSummary(data?.summary || null);
        setFamilyOverviewMembers(Array.isArray(data?.members) ? data.members : []);
      }
    })
    .catch((error) => {
      if (!cancelled) {
        console.error('Unable to load family schedule summary:', error?.response?.data || error.message);
        setFamilyScheduleSummary(null);
        setFamilyOverviewMembers([]);
      }
    });
  return () => { cancelled = true; };
}, [effectiveClient?._id, mode]);

useEffect(() => {
  const ownerId = effectiveClient?._id;
  if (!ownerId || mode !== 'create') return;

  setSelectedBookingClientIds((currentIds) => currentIds.length ? currentIds : [String(ownerId)]);
  API.get(`/clients/${ownerId}/family`)
    .then(({ data }) =>
      setFamilyMembers(
        (Array.isArray(data?.members) ? data.members : []).filter(
          (member) =>
            String(member?.linkStatus || 'active') === 'active' &&
            member?.permissions?.canBook !== false
        )
      )
    )
    .catch((error) => {
      console.error('Unable to load family members:', error?.response?.data || error.message);
      setFamilyMembers([]);
    });
}, [effectiveClient?._id, effectiveClient?.phone, mode]);


useEffect(() => {
  if (mode !== 'create' || !effectiveClient?._id) return;
  const requested = new URLSearchParams(window.location.search)
    .get('familyClientIds')
    ?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  if (!requested?.length) return;
  const allowed = new Set([String(effectiveClient._id), ...familyMembers.map((member) => String(member._id))]);
  const valid = Array.from(new Set(requested.filter((id) => allowed.has(String(id))))).slice(0, 2);
  if (valid.length) {
    setSelectedBookingClientIds(valid);
    setActiveFamilyBookingIndex(0);
    setFamilyBookingDrafts([]);
    setFamilyStepSelections({});
    setShowFamilyBookingPanel(true);
  }
}, [mode, effectiveClient?._id, familyMembers]);

const activeBookingClientId = mode === 'create'
  ? (selectedBookingClientIds[activeFamilyBookingIndex] || selectedBookingClientIds[0] || effectiveClient?._id)
  : effectiveClient?._id;

const familyBookingPeople = [
  ...(effectiveClient?._id ? [{ ...effectiveClient, relationship: 'self' }] : []),
  ...familyMembers,
];
const activeBookingPerson = familyBookingPeople.find((person) => String(person._id) === String(activeBookingClientId)) || effectiveClient;

const firstFamilyBookingBlock = useMemo(() => {
  if (!familyBookingDrafts.length) return null;
  const firstClientId = String(selectedBookingClientIds[0] || '');
  const rows = familyBookingDrafts.filter((draft) => String(draft.clientId || '') === firstClientId);
  if (!rows.length) return null;
  const date = rows[0].date;
  const startMinutes = Math.min(...rows.map((row) => timeToMinutes(row.time)));
  const endMinutes = Math.max(...rows.map((row) => timeToMinutes(row.time) + Number(row.duration || 0)));
  const workerIds = new Set(rows.map((row) => String(row.workerId || '')).filter(Boolean));
  const toTime = (minutes) => `${String(Math.floor(minutes / 60) % 24).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
  return { date, startTime: toTime(startMinutes), endTime: toTime(endMinutes), workerIds };
}, [familyBookingDrafts, selectedBookingClientIds]);

const selectedFamilyAppointmentRows = useMemo(() => {
  const byId = new Map((familyOverviewMembers || []).map((member) => [String(member?._id || ''), member]));
  return selectedBookingClientIds.flatMap((clientId) => {
    const member = byId.get(String(clientId));
    if (!member) return [];
    const appointments = Array.isArray(member.upcomingAppointments) && member.upcomingAppointments.length
      ? member.upcomingAppointments
      : (member.nextAppointment ? [member.nextAppointment] : []);
    return appointments.map((appointment) => ({
      member,
      appointment,
      canEdit: appointment?.canEditAppointment === true,
    }));
  });
}, [familyOverviewMembers, selectedBookingClientIds]);

const editFamilyAppointment = (appointment) => {
  if (!appointment) return;
  try {
    sessionStorage.setItem('editingAppointment', JSON.stringify(appointment));
  } catch (error) {
    console.error('Unable to prepare family appointment edit:', error);
  }
  window.location.assign('/booking/schedule');
};

const familyTogetherMode = selectedBookingClientIds.length > 1 && familyScheduleMode !== 'individual';

const isBackToBackFollower =
  mode === 'create' &&
  selectedBookingClientIds.length > 1 &&
  activeFamilyBookingIndex > 0 &&
  familyScheduleMode === 'together-back-to-back' &&
  !!firstFamilyBookingBlock;

const toggleBookingPerson = (clientId) => {
  const id = String(clientId || '');
  if (!id) return;
  const targetPerson = familyBookingPeople.find((person) => String(person?._id || '') === id);
  const targetActiveCount = Number(targetPerson?.activeAppointmentCount ?? targetPerson?.upcomingAppointments?.length ?? 0);
  if (!selectedBookingClientIds.includes(id) && targetActiveCount >= 2) {
    toast.info(`${targetPerson?.firstName || 'This client'} already has two active appointments. Please contact the salon if another appointment is needed.`);
    return;
  }
  setSelectedBookingClientIds((currentIds) => {
    let nextIds = currentIds;
    if (currentIds.includes(id)) {
      if (currentIds.length === 1) {
        toast.info('Select at least one person for this appointment.');
        return currentIds;
      }
      nextIds = currentIds.filter((value) => value !== id);
    } else {
      if (currentIds.length >= 2) {
        toast.info('Online family booking is limited to two people at a time. Please call for a larger group.');
        return currentIds;
      }
      nextIds = [...currentIds, id];
    }
    setActiveFamilyBookingIndex(0);
    setFamilyBookingDrafts([]);
    setFamilyStepSelections({});
    if (nextIds.length < 2) setFamilyScheduleMode('individual');
    return nextIds;
  });
};

const addFamilyMember = async () => {
  if (familySaving) return;
  const firstName = String(familyMemberForm.firstName || '').trim();
  const lastName = String(familyMemberForm.lastName || '').trim();
  const phone = String(familyMemberForm.phone || '').replace(/\D/g, '').slice(-10);

  if (!firstName || !lastName) {
    toast.error('Enter the family member’s first and last name.');
    return;
  }

  if (!familyNoPhoneMode && !phone) {
    setFamilyPhoneFieldError('Please enter the family member’s phone number.');
    setFamilyPhonePromptMessage('A phone number for this family member is required.');
    setFamilyPhonePromptOpen(true);
    return;
  }

  if (!familyNoPhoneMode && phone.length !== 10) {
    setFamilyPhoneFieldError('Please enter a valid 10-digit phone number.');
    setFamilyPhonePromptMessage('Please enter a valid 10-digit phone number for this family member.');
    setFamilyPhonePromptOpen(true);
    return;
  }

  if (familyNoPhoneMode && (!familyMemberForm.dob || !familyMemberForm.guardianAttestation)) {
    toast.error('Date of birth and guardian confirmation are required.');
    return;
  }

  setFamilySaving(true);
  try {
    const { data } = await API.post(`/clients/${effectiveClient._id}/family`, {
      firstName,
      lastName,
      memberPhone: familyNoPhoneMode ? '' : phone,
      relationship: familyMemberForm.relationship || (familyNoPhoneMode ? 'child' : 'family'),
      noPhone: familyNoPhoneMode,
      dob: familyNoPhoneMode ? familyMemberForm.dob : null,
      guardianAttestation: familyNoPhoneMode ? Boolean(familyMemberForm.guardianAttestation) : false,
    });
    const member = data?.member;
    if (data?.pendingInvitation) {
      toast.info('Invitation sent. This existing client must accept before you can book for them.');
    } else if (member?._id) {
      setFamilyMembers((members) => {
        const withoutDuplicate = members.filter((item) => String(item._id) !== String(member._id));
        return [...withoutDuplicate, member];
      });
      setSelectedBookingClientIds((ids) => Array.from(new Set([...ids, String(member._id)])).slice(0, 2));
    }
    setFamilyMemberForm({ firstName: '', lastName: '', phone: '', relationship: 'family', dob: '', guardianAttestation: false });
    setFamilyNoPhoneMode(false);
    setFamilyPhoneFieldError('');
    setShowAddFamilyMember(false);
    if (!data?.pendingInvitation) toast.success(familyNoPhoneMode ? 'Minor dependent added and selected.' : 'Family member added and selected.');
  } catch (error) {
    toast.error(error?.response?.data?.error || 'Could not add the family member.');
  } finally {
    setFamilySaving(false);
  }
};

useEffect(() => {
  API.get('/booking-status')
    .then(({ data }) => {
      setBookingStatus({
        currentNotices: Array.isArray(data?.currentNotices) ? data.currentNotices : [],
        futureNotices: Array.isArray(data?.futureNotices) ? data.futureNotices : [],
        promotions: Array.isArray(data?.promotions) ? data.promotions : [],
        storeStatus: data?.storeStatus || null,
        shopMode: data?.shopMode || null,
      });
    })
    .catch((error) => {
      console.error('Unable to load booking notices:', error?.response?.data || error.message);
    });
}, []);

const effectiveSingleStylist = Boolean(bookingStatus?.shopMode?.effectiveSingleStylist);
const relationshipStylistId = useMemo(() => relationshipStylistIdFor(activeBookingPerson), [activeBookingPerson]);
useEffect(() => {
  if (effectiveSingleStylist && ['together-auto', 'together-same'].includes(familyScheduleMode)) {
    setFamilyScheduleMode('together-back-to-back');
    toast.info('Only one stylist is available, so family appointments will be scheduled back-to-back.');
  }
}, [effectiveSingleStylist, familyScheduleMode]);

const assignedStylistId = useMemo(() => idOf(activeBookingPerson?.assignedStylistId), [activeBookingPerson]);
const preferredStylistId = useMemo(() => idOf(activeBookingPerson?.preferredStylistId), [activeBookingPerson]);
const lastStylistId = useMemo(() => idOf(activeBookingPerson?.lastStylistId), [activeBookingPerson]);

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
    clientId: idOf(editingAppointment.clientId || editingAppointment.client) || effectiveClient?._id || null,
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
  const clientId = mode === 'create' ? (activeBookingClientId || effectiveClient?._id || null) : (baseline?.clientId || effectiveClient?._id || null);
  return { clientId, serviceId: svcId, workerId, date, time, addOnIds };
}, [selectedService, selectedWorker, selectedDate, selectedTime, selectedAddOns, baseline, effectiveClient?._id, mode, activeBookingClientId]);

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

const loadAppointmentCapacity = useCallback(async (targetClientId) => {
  const clientId = String(targetClientId || '').trim();
  if (!clientId || mode !== 'create') return;

  setAppointmentCapacity((currentState) => ({ ...currentState, clientId, loading: true, canCreate: false, error: '' }));
  try {
    const { data } = await API.get(`/appointments/client/${clientId}/capacity`);
    setAppointmentCapacity({
      clientId,
      loading: false,
      activeAppointments: Array.isArray(data?.activeAppointments) ? data.activeAppointments : [],
      count: Number(data?.activeAppointmentCount || 0),
      max: Number(data?.maxActiveAppointments || 2),
      canCreate: data?.canCreate !== false,
      error: '',
    });
  } catch (error) {
    console.error('Unable to check appointment capacity:', error?.response?.data || error.message);
    setAppointmentCapacity((currentState) => ({
      ...currentState,
      loading: false,
      canCreate: false,
      error: error?.response?.data?.error || 'Unable to verify current appointments. Please try again.',
    }));
  }
}, [mode]);

useEffect(() => {
  if (mode !== 'create' || guidedStep !== 2 || !activeBookingClientId) return;
  loadAppointmentCapacity(activeBookingClientId);
}, [mode, guidedStep, activeBookingClientId, loadAppointmentCapacity]);

const openActiveAppointmentForEdit = (appointment) => {
  if (!appointment) return;
  try {
    sessionStorage.setItem('editingAppointment', JSON.stringify(appointment));
  } catch (error) {
    console.error('Unable to prepare appointment edit:', error);
    toast.error('Unable to open this appointment for editing.');
    return;
  }
  window.location.assign('/booking/schedule');
};

const cancelActiveAppointmentFromStep2 = async (appointment) => {
  const appointmentId = getEditingId(appointment);
  if (!appointmentId) return;
  const serviceName = appointment?.serviceId?.name || appointment?.service?.name || appointment?.service || 'this appointment';
  if (!window.confirm(`Cancel ${serviceName}?`)) return;

  try {
    await API.delete(`/appointments/${appointmentId}`);
    toast.success('Appointment canceled.');
    await loadAppointmentCapacity(activeBookingClientId);
  } catch (error) {
    toast.error(error?.response?.data?.error || 'Unable to cancel the appointment.');
  }
};

// Validity and button state
// Online client and family booking is capped at two services per person.
// Runtime settings may further lower this limit, but can never raise it above two.
const configuredServiceLimit = Number(bookingSettings.maxOnlineServicesPerVisit);
const maxServiceLimit = configuredServiceLimit === 1 ? 1 : 2;
const basketServiceCount = mode === 'create' ? serviceBasket.length : (current.serviceId ? 1 : 0);
const basketTotalDuration = mode === 'create'
  ? serviceBasket.reduce((sum, item) => sum + basketItemDuration(item), 0)
  : 0;
const primaryBasketItem = serviceBasket[0] || null;
const primaryService = mode === 'create' ? (primaryBasketItem?.service || selectedService) : selectedService;
const workerRequired = !!(mode === 'create' ? primaryService?._id : current.serviceId);
const hasSelectedServiceForBooking = mode === 'create' ? serviceBasket.length > 0 : !!current.serviceId;

// In create mode, once a service is confirmed the picker pauses until the client
// explicitly chooses Add another service or Edit. It also stays locked at the
// online service limit.
const capacityReadyForActiveClient =
  String(appointmentCapacity.clientId || '') === String(activeBookingClientId || '') &&
  !appointmentCapacity.loading;

const capacityBlocksNewAppointment = mode === 'create' && (
  !capacityReadyForActiveClient ||
  !appointmentCapacity.canCreate
);

const servicePickerLocked =
  mode === 'create' && (
    capacityBlocksNewAppointment ||
    (serviceBasket.length > 0 && !isSelectingAdditionalService && !editingBasketItemId)
  );

useEffect(() => {
  if (isBackToBackFollower && guidedStep === 3) {
    setGuidedStep(2);
  }
}, [isBackToBackFollower, guidedStep]);

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
  const requestId = ++availabilityRequestRef.current;
  let cancelled = false;

  if (calendarStatus?.storeClosed || calendarStatus?.onlineBookingOff) {
    setAvailableTimes([]);
    setSelectedTime(null);
    return () => { cancelled = true; };
  }

  if (!(primaryService && selectedDate && (!workerRequired || selectedWorker))) {
    setAvailableTimes([]);
    return () => { cancelled = true; };
  }

  const extra = selectedAddOns.reduce((sum, a) => sum + (Number(a.duration) || 0), 0);
  const singleDuration = (Number(selectedWorker?.duration) || Number(primaryService.duration) || 0) + extra;
  const totalDuration = Math.max(1, Number(mode === 'create' ? basketTotalDuration : singleDuration) || singleDuration || 60);
  const params = { date: selectedDate, serviceId: primaryService._id, duration: totalDuration };
  if (selectedWorker?._id) params.workerId = selectedWorker._id;
  if (isEdit && editingAppointment) params.excludeId = getEditingId(editingAppointment);

  API.get('/availability', { params })
    .then(({ data }) => {
      if (cancelled || requestId !== availabilityRequestRef.current) return;
      const rows = Array.isArray(data) ? data : [];
      const mapped = rows.map((t) => {
        let available = t.status === 'free';
        // Extra client-side guard: for today's date, never leave a past/current slot clickable
        // even if an older/stale availability response was cached somewhere in the path.
        if (available && selectedDate) {
          const now = new Date();
          const localToday = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
          if (selectedDate === localToday) {
            const slotMinutes = timeToMinutes(t.time);
            const currentMinutes = now.getHours() * 60 + now.getMinutes();
            if (slotMinutes <= currentMinutes) available = false;
          }
        }
        if (available && familyBookingDrafts.length > 0 && selectedDate && selectedWorker?._id) {
          const candidateStart = timeToMinutes(t.time);
          const candidateEnd = candidateStart + totalDuration;
          available = !familyBookingDrafts.some((draft) => {
            if (String(draft.workerId || '') !== String(selectedWorker._id || '')) return false;
            if (String(draft.date || '') !== String(selectedDate || '')) return false;
            const draftStart = timeToMinutes(draft.time);
            const draftEnd = draftStart + Number(draft.duration || 0);
            return candidateStart < draftEnd && candidateEnd > draftStart;
          });
        }
        if (available && familyTogetherMode && activeFamilyBookingIndex > 0 && firstFamilyBookingBlock) {
          const differentStylist = !firstFamilyBookingBlock.workerIds.has(String(selectedWorker?._id || ''));
          const sameTimeAllowed = differentStylist && t.time === firstFamilyBookingBlock.startTime;
          const backToBackAllowed = t.time === firstFamilyBookingBlock.endTime;
          if (familyScheduleMode === 'together-same') available = sameTimeAllowed;
          else if (familyScheduleMode === 'together-back-to-back') available = backToBackAllowed;
          else available = sameTimeAllowed || backToBackAllowed;
        }
        return { time: t.time, available, status: t.status, reason: t.reason || '' };
      });
      setAvailableTimes(mapped);
      setSelectedTime((current) => current && !mapped.some((row) => row.available && row.time === current) ? null : current);
    })
    .catch(() => {
      if (!cancelled && requestId === availabilityRequestRef.current) setAvailableTimes([]);
    });

  return () => { cancelled = true; };
}, [primaryService, selectedWorker, workerRequired, selectedDate, selectedAddOns, basketTotalDuration, mode, isEdit, editingAppointment, calendarStatus, availabilityRefreshKey, familyBookingDrafts, familyTogetherMode, familyScheduleMode, activeFamilyBookingIndex, firstFamilyBookingBlock]);


useEffect(() => {
  if (!isBackToBackFollower || !firstFamilyBookingBlock?.date) return;
  if (selectedDate !== firstFamilyBookingBlock.date) {
    setSelectedDate(firstFamilyBookingBlock.date);
    setSelectedTime(null);
  }
}, [isBackToBackFollower, firstFamilyBookingBlock, selectedDate]);

useEffect(() => {
  if (!familyTogetherMode || activeFamilyBookingIndex === 0 || !firstFamilyBookingBlock) return;
  if (selectedDate !== firstFamilyBookingBlock.date) setSelectedDate(firstFamilyBookingBlock.date);
}, [familyTogetherMode, activeFamilyBookingIndex, firstFamilyBookingBlock, selectedDate]);

useEffect(() => {
  if (!familyTogetherMode || activeFamilyBookingIndex === 0 || !firstFamilyBookingBlock || !selectedWorker?._id) return;
  const freeTimes = availableTimes.filter((row) => row.available).map((row) => row.time);
  if (!freeTimes.length || (selectedTime && freeTimes.includes(selectedTime))) return;
  const differentStylist = !firstFamilyBookingBlock.workerIds.has(String(selectedWorker._id));
  const preferred = familyScheduleMode === 'together-back-to-back'
    ? firstFamilyBookingBlock.endTime
    : familyScheduleMode === 'together-same'
      ? firstFamilyBookingBlock.startTime
      : (differentStylist && freeTimes.includes(firstFamilyBookingBlock.startTime)
          ? firstFamilyBookingBlock.startTime
          : firstFamilyBookingBlock.endTime);
  if (freeTimes.includes(preferred)) setSelectedTime(preferred);
}, [familyTogetherMode, familyScheduleMode, activeFamilyBookingIndex, firstFamilyBookingBlock, selectedWorker, availableTimes, selectedTime]);


  const commitServiceSelection = async (service) => {
    const specialDeal = getSpecialDealForService(service, promotionConfig);
    const previousDate = selectedDate;

    if (mode === 'create') setIsSelectingAdditionalService(false);

    if (mode === 'create') {
      const editingItem = editingBasketItemId
        ? serviceBasket.find((item) => item.id === editingBasketItemId)
        : null;
      const duplicateOtherItem = editingItem
        ? serviceBasket.some((item) => item.id !== editingBasketItemId && idOf(item.service) === idOf(service))
        : false;

      if (duplicateOtherItem) {
        toast.info(`${service.name} is already selected. Choose a different service for this line item.`);
        return;
      }

      const alreadyInBasket = serviceBasket.some((item) => idOf(item.service) === idOf(service));
      if (!editingItem && !alreadyInBasket && serviceBasket.length >= maxServiceLimit) {
        toast.info(bookingSettings.limitMessage || `For more than ${maxServiceLimit} services, please call Rakie Salon so we can allocate enough time for your visit.`);
        return;
      }

      let itemId = null;
      if (editingItem) {
        itemId = editingItem.id;
        const sameService = idOf(editingItem.service) === idOf(service);
        const nextAddOns = sameService ? (editingItem.addOns || []) : [];
        setServiceBasket((prev) => prev.map((item) =>
          item.id === editingItem.id ? { ...item, service, addOns: nextAddOns } : item
        ));
        setSelectedAddOns(nextAddOns);
        setEditingBasketItemId(null);
        setServiceAddedPrompt({ serviceName: service.name, personName: activeBookingPerson?.firstName || 'you', updated: true });
      } else if (alreadyInBasket) {
        const existing = serviceBasket.find((item) => idOf(item.service) === idOf(service));
        itemId = existing?.id || null;
        setSelectedAddOns(existing?.addOns || []);
        setServiceAddedPrompt({ serviceName: service.name, personName: activeBookingPerson?.firstName || 'you' });
      } else {
        itemId = `${service._id}-${Date.now()}`;
        setServiceBasket((prev) => [...prev, { id: itemId, service, addOns: [] }]);
        setSelectedAddOns([]);
        setServiceAddedPrompt({ serviceName: service.name, personName: activeBookingPerson?.firstName || 'you' });
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

  const handleServiceClick = async (service) => {
    if (mode !== 'create') {
      await commitServiceSelection(service);
      return;
    }

    if (editingBasketItemId) {
      const duplicateOtherItem = serviceBasket.some((item) =>
        item.id !== editingBasketItemId && idOf(item.service) === idOf(service)
      );
      if (duplicateOtherItem) {
        toast.info(`${service.name} is already selected. Choose a different service for this line item.`);
        return;
      }
      setPendingServiceToAdd(service);
      return;
    }

    const alreadyInBasket = serviceBasket.some((item) => idOf(item.service) === idOf(service));
    if (alreadyInBasket) {
      await commitServiceSelection(service);
      return;
    }

    if (serviceBasket.length >= maxServiceLimit) {
      toast.info(bookingSettings.limitMessage || `For more than ${maxServiceLimit} services, please call Rakie Salon so we can allocate enough time for your visit.`);
      return;
    }

    setPendingServiceToAdd(service);
  };


  const beginEditBasketItem = async (item) => {
    if (!item?.service) return;
    setActiveBasketItemId(item.id);
    setEditingBasketItemId(item.id);
    setIsSelectingAdditionalService(false);
    setServiceAddedPrompt(null);
    setPendingServiceToAdd(null);
    setSelectedService(item.service);
    if (item.service?.category) setSelectedCategory(item.service.category);
    setSelectedAddOns(item.addOns || []);
    try {
      const { data } = await API.get(`/services/${item.service._id}/addons`);
      setAddOns(data || []);
    } catch {
      setAddOns([]);
    }
    requestAnimationFrame(() => document.querySelector('.rakie-service-browser')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  };

  const prepareToAddAnotherService = () => {
    if (serviceBasket.length >= maxServiceLimit) {
      toast.info(bookingSettings.limitMessage || `For more than ${maxServiceLimit} services, please call Rakie Salon so we can allocate enough time for your visit.`);
      return;
    }
    setEditingBasketItemId(null);
    setActiveBasketItemId(null);
    setIsSelectingAdditionalService(true);
    setServiceAddedPrompt(null);
    setPendingServiceToAdd(null);
    setSelectedService(null);
    setSelectedAddOns([]);
    setAddOns([]);
    requestAnimationFrame(() => document.querySelector('.rakie-service-browser')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
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
      bookingDebug('PERSIST_CLIENT_FOR_DASHBOARD', {
        clientId: minimal._id,
        currentClientId: current.clientId,
        effectiveClientId: effectiveClient?._id,
        activeBookingClientId,
      });
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

const captureFamilyStepSelection = () => ({
  selectedCategory,
  selectedService,
  selectedWorker,
  availableWorkers,
  showStylistOptions,
  relationshipStylistUnavailable,
  selectedDate,
  selectedTime,
  availableTimes,
  addOns,
  selectedAddOns,
  serviceBasket,
  activeBasketItemId,
  couponCode,
  couponResult,
  guidedStep,
});

const restoreFamilyStepSelection = (snapshot, preferredDate = null) => {
  if (!snapshot) {
    resetForNextFamilyMember(preferredDate);
    return;
  }
  setSelectedCategory(snapshot.selectedCategory || null);
  setSelectedService(snapshot.selectedService || null);
  setSelectedWorker(snapshot.selectedWorker || null);
  setAvailableWorkers(Array.isArray(snapshot.availableWorkers) ? snapshot.availableWorkers : []);
  setShowStylistOptions(Boolean(snapshot.showStylistOptions));
  setRelationshipStylistUnavailable(Boolean(snapshot.relationshipStylistUnavailable));
  setSelectedDate(snapshot.selectedDate || preferredDate || null);
  setSelectedTime(snapshot.selectedTime || null);
  setAvailableTimes(Array.isArray(snapshot.availableTimes) ? snapshot.availableTimes : []);
  setAddOns(Array.isArray(snapshot.addOns) ? snapshot.addOns : []);
  setSelectedAddOns(Array.isArray(snapshot.selectedAddOns) ? snapshot.selectedAddOns : []);
  setServiceBasket(Array.isArray(snapshot.serviceBasket) ? snapshot.serviceBasket : []);
  setActiveBasketItemId(snapshot.activeBasketItemId || null);
  setShowAddOnModal(false);
  setCouponCode(snapshot.couponCode || '');
  setCouponResult(snapshot.couponResult || null);
  setGuidedStep(snapshot.guidedStep || (snapshot.selectedTime ? 4 : snapshot.selectedDate ? 3 : snapshot.serviceBasket?.length ? 2 : 1));
  setBookingCompleteNotice(null);
  setServiceAddedPrompt(null);
  setIsSelectingAdditionalService(false);
  setFamilyFinalReviewRows(null);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const goToPreviousFamilyMember = () => {
  if (activeFamilyBookingIndex <= 0 || isSubmitting) return;
  const currentId = String(activeBookingClientId || '');
  const previousIndex = activeFamilyBookingIndex - 1;
  const previousId = String(selectedBookingClientIds[previousIndex] || '');
  const currentSnapshot = captureFamilyStepSelection();
  setFamilyStepSelections((existing) => ({ ...existing, [currentId]: currentSnapshot }));
  setActiveFamilyBookingIndex(previousIndex);
  restoreFamilyStepSelection(familyStepSelections[previousId], firstFamilyBookingBlock?.date || null);
};

const resetForNextFamilyMember = (preferredDate = null) => {
  setSelectedCategory(null);
  setSelectedService(null);
  setSelectedWorker(null);
  setAvailableWorkers([]);
  setShowStylistOptions(false);
  setRelationshipStylistUnavailable(false);
  // Start the next family member on the first person's selected day in every family mode.
  // Flexible mode may still change the date; coordinated modes remain locked by their existing rules.
  setSelectedDate(preferredDate || (firstFamilyBookingBlock ? firstFamilyBookingBlock.date : null));
  setSelectedTime(null);
  setAvailableTimes([]);
  setAddOns([]);
  setSelectedAddOns([]);
  setServiceBasket([]);
  setActiveBasketItemId(null);
  setShowAddOnModal(false);
  setCouponCode('');
  setCouponResult(null);
  setGuidedStep(1);
  setBookingCompleteNotice(null);
  setServiceAddedPrompt(null);
  setIsSelectingAdditionalService(false);
  setFamilyFinalReviewRows(null);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

const handleSubmit = async () => {
  if (isSubmitting) return;

  bookingDebug('SUBMIT_START', {
    mode,
    guidedStep,
    effectiveClientId: effectiveClient?._id,
    currentClientId: current.clientId,
    activeBookingClientId,
    selectedBookingClientIds,
    activeFamilyBookingIndex,
    selectedServiceId: current.serviceId,
    selectedServiceName: selectedService?.name,
    selectedDate: current.date,
    selectedTime: current.time,
    basket: serviceBasket.map((item) => ({
      basketId: item.id || item.basketId,
      serviceId: item.service?._id,
      service: item.service?.name,
      addOnIds: (item.addOns || []).map((a) => a?._id),
    })),
  });

  if (mode === 'create' && familyFinalReviewRows?.length) {
    setIsSubmitting(true);
    try {
      bookingDebug('FAMILY_FINAL_BATCH_BEFORE_POST', {
        bookingOwnerClientId: effectiveClient?._id,
        rows: familyFinalReviewRows.map((row) => ({
          clientId: row?.clientId,
          serviceId: row?.serviceId,
          service: row?.service,
          date: row?.date,
          time: row?.time,
          status: row?.status,
          bookingFlags: row?.bookingFlags,
        })),
      });
      const familyBatchResponse = await API.post('/appointments/batch', {
        appointments: familyFinalReviewRows,
        bookingOwnerClientId: effectiveClient?._id,
        bookingOwnerPhone: effectiveClient?.phone,
      });
      bookingDebug('FAMILY_FINAL_BATCH_RESPONSE', {
        status: familyBatchResponse?.status,
        data: familyBatchResponse?.data,
      });
      toast.success('Family appointments submitted together for salon confirmation');
      clearOnlineBookingCount();
      persistClientForDashboard();
      window.location.replace('/booking/dashboard');
      return;
    } catch (err) {
      console.error('[family batch save error]', err?.response?.data || err?.message || err);
      const responseData = err?.response?.data || {};
      toast.error(responseData?.error || responseData?.message || 'Failed to save family appointments');
      setIsSubmitting(false);
      return;
    }
  }

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
      // In create mode, always honor the currently selected family-booking target.
      // This matters when My Family launches booking for exactly one other member:
      // selectedBookingClientIds has one id, so the old multi-person-only override
      // never ran and the appointment could be saved against the signed-in owner.
      clientId: mode === 'create' ? (activeBookingClientId || current.clientId) : current.clientId,
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
   bookingDebug('BASE_PAYLOAD_READY', {
     payload,
     effectiveClientId: effectiveClient?._id,
     currentClientId: current.clientId,
     activeBookingClientId,
     selectedBookingClientIds,
   });

    // Family booking is completed person-by-person. Nothing is posted until the final person is ready.
    if (mode === 'create' && selectedBookingClientIds.length > 1) {
      let cursorTime = current.time;
      const currentPersonAppointments = serviceBasket.length > 1
        ? serviceBasket.map((item) => {
            const itemDuration = basketItemDuration(item);
            const row = {
              ...payload,
              clientId: activeBookingClientId,
              serviceId: item.service._id,
              service: item.service.name,
              time: cursorTime,
              duration: itemDuration,
              addOns: (item.addOns || []).map((a) => a._id),
              bookingFlags: ['online_family_booking', `family_schedule_${familyScheduleMode}`],
            };
            cursorTime = addMinutesToTime(cursorTime, itemDuration);
            return row;
          })
        : [{ ...payload, clientId: activeBookingClientId, bookingFlags: ['online_family_booking', `family_schedule_${familyScheduleMode}`] }];

      if (activeFamilyBookingIndex > 0 && familyTogetherMode && firstFamilyBookingBlock) {
        const currentStart = currentPersonAppointments[0]?.time;
        const currentWorkerId = String(currentPersonAppointments[0]?.workerId || '');
        const differentStylist = !firstFamilyBookingBlock.workerIds.has(currentWorkerId);
        const validSameTime = differentStylist && currentStart === firstFamilyBookingBlock.startTime;
        const validBackToBack = currentStart === firstFamilyBookingBlock.endTime;
        const validArrangement = familyScheduleMode === 'together-same'
          ? validSameTime
          : familyScheduleMode === 'together-back-to-back'
            ? validBackToBack
            : (validSameTime || validBackToBack);
        if (!validArrangement || current.date !== firstFamilyBookingBlock.date) {
          toast.error('Choose one of the available together-booking times: the same start time with a different stylist, or the exact next time after the first appointment.');
          setIsSubmitting(false);
          return;
        }
      }

      const activeClientKey = String(activeBookingClientId || '');
      const previousRowsForActiveClient = familyBookingDrafts.filter((draft) => String(draft.clientId || '') === activeClientKey);
      const nextDrafts = [
        ...familyBookingDrafts.filter((draft) => String(draft.clientId || '') !== activeClientKey),
        ...currentPersonAppointments,
      ];
      const currentSnapshot = captureFamilyStepSelection();
      const isLastFamilyMember = activeFamilyBookingIndex >= selectedBookingClientIds.length - 1;

      if (!isLastFamilyMember) {
        const nextIndex = activeFamilyBookingIndex + 1;
        const nextId = String(selectedBookingClientIds[nextIndex] || '');
        let nextSnapshot = familyStepSelections[nextId] || null;

        // When the first person's coordinated block changes, the next person's old time
        // may no longer be valid. Preserve their service choices but require a fresh time review.
        if (activeFamilyBookingIndex === 0 && familyTogetherMode && nextSnapshot) {
          const oldSignature = previousRowsForActiveClient.map((row) => `${row.date}|${row.time}|${row.duration}|${row.workerId || ''}`).join(';');
          const newSignature = currentPersonAppointments.map((row) => `${row.date}|${row.time}|${row.duration}|${row.workerId || ''}`).join(';');
          if (oldSignature && oldSignature !== newSignature) {
            nextSnapshot = {
              ...nextSnapshot,
              selectedDate: currentPersonAppointments[0]?.date || nextSnapshot.selectedDate,
              selectedTime: null,
              availableTimes: [],
            };
            toast.info('The first appointment changed. Please review the next family member’s time.');
          }
        }

        setFamilyBookingDrafts(nextDrafts);
        setFamilyStepSelections((existing) => ({
          ...existing,
          [activeClientKey]: currentSnapshot,
          ...(nextSnapshot ? { [nextId]: nextSnapshot } : {}),
        }));
        setActiveFamilyBookingIndex(nextIndex);
        const firstSelectedFamilyDate = nextDrafts.find((draft) =>
          String(draft.clientId || '') === String(selectedBookingClientIds[0] || '')
        )?.date || nextDrafts[0]?.date || null;
        restoreFamilyStepSelection(nextSnapshot, firstSelectedFamilyDate);
        const nextPerson = familyBookingPeople.find((person) => String(person._id) === nextId);
        toast.success(`${nextPerson?.firstName || 'Next family member'} is next. The first appointment date is preselected as a starting point; you may change it in flexible mode.`);
        setIsSubmitting(false);
        return;
      }

      setFamilyBookingDrafts(nextDrafts);
      setFamilyStepSelections((existing) => ({ ...existing, [activeClientKey]: currentSnapshot }));
      setFamilyFinalReviewRows(nextDrafts);
      setIsSubmitting(false);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

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

      bookingDebug('SELF_MULTI_BATCH_BEFORE_POST', {
        effectiveClientId: effectiveClient?._id,
        currentClientId: current.clientId,
        activeBookingClientId,
        appointments,
      });
      const batchResponse = await API.post('/appointments/batch', { appointments });
      bookingDebug('SELF_MULTI_BATCH_RESPONSE', {
        status: batchResponse?.status,
        data: batchResponse?.data,
      });

      const verifyClientId = String(payload.clientId || effectiveClient?._id || current.clientId || '');
      if (verifyClientId) {
        try {
          const verifyResponse = await API.get(`/appointments/client/${verifyClientId}`, {
            params: { rakieDebugTs: Date.now() },
          });
          bookingDebug('SELF_MULTI_POST_SAVE_CLIENT_LOOKUP', {
            clientId: verifyClientId,
            httpStatus: verifyResponse?.status,
            summary: summarizeClientAppointmentResponse(verifyResponse?.data, verifyClientId),
          });
        } catch (verifyErr) {
          bookingDebug('SELF_MULTI_POST_SAVE_CLIENT_LOOKUP_ERROR', {
            clientId: verifyClientId,
            httpStatus: verifyErr?.response?.status,
            response: verifyErr?.response?.data,
            message: verifyErr?.message,
          });
        }
      }

      toast.success('Appointments successfully saved together');
      clearOnlineBookingCount();
      persistClientForDashboard();
      bookingDebug('SELF_MULTI_REDIRECT_TO_DASHBOARD', {
        target: '/booking/dashboard',
        persistedClientId: effectiveClient?._id || current.clientId,
      });
      window.location.replace('/booking/dashboard');
      return;
    }

    bookingDebug('SINGLE_APPOINTMENT_BEFORE_POST', { payload });
    const singleResponse = await API.post('/appointments', payload);
    bookingDebug('SINGLE_APPOINTMENT_RESPONSE', {
      status: singleResponse?.status,
      data: singleResponse?.data,
    });
    toast.success('Appointment successfully saved');

    if (mode === 'create') {
      const verifyClientId = String(payload.clientId || effectiveClient?._id || current.clientId || '');
      if (verifyClientId) {
        try {
          const verifyResponse = await API.get(`/appointments/client/${verifyClientId}`, {
            params: { rakieDebugTs: Date.now() },
          });
          bookingDebug('SINGLE_POST_SAVE_CLIENT_LOOKUP', {
            clientId: verifyClientId,
            httpStatus: verifyResponse?.status,
            summary: summarizeClientAppointmentResponse(verifyResponse?.data, verifyClientId),
          });
        } catch (verifyErr) {
          bookingDebug('SINGLE_POST_SAVE_CLIENT_LOOKUP_ERROR', {
            clientId: verifyClientId,
            httpStatus: verifyErr?.response?.status,
            response: verifyErr?.response?.data,
            message: verifyErr?.message,
          });
        }
      }
      clearOnlineBookingCount();
      persistClientForDashboard();
      bookingDebug('SINGLE_REDIRECT_TO_DASHBOARD', { target: '/booking/dashboard' });
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
    .fc .fc-day-today { background: #faf6f0 !important; }
    .fc .is-selected { background: #f7eaed !important; color: #5d1b28 !important; box-shadow: inset 0 0 0 1px #7b2636; }

    /* 5) Hover feedback without adding height */
    .fc .fc-daygrid-day-frame:hover { background: #fbf3f4; }
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
<div className="rakie-schedule p-2 relative max-w-screen-md mx-auto">
    {tightCalendarCSS}

  <div className="p-2 relative max-w-screen-md mx-auto">
    <div className="rakie-booking-header sticky top-0 z-40 bg-white border-b py-3 px-4 shadow-sm flex flex-col gap-1">
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
            Sign out
          </button>
        </div>
        <img src={logo} alt="Logo" className="h-8 w-8" />
      </div>

      {/* Compact booking summary. Hidden on the final review step to avoid duplicate review information. */}
      <div className="text-center font-medium text-sm text-gray-800">
        {mode === 'create' ? (
          guidedStep < 4 ? (
            <>
              {guidedStep === 1 ? (selectedBookingClientIds.length > 1 ? `${selectedBookingClientIds.length} family members selected` : 'Booking for myself') : (
                <>
                  <strong>{selectedBookingClientIds.length > 1 ? `For ${activeBookingPerson?.firstName || 'family member'}: ` : ''}</strong>
                  {guidedStep === 2 ? (
                    selectedWorker
                      ? <>Booking with {selectedWorker.displayName || workerDisplayName(selectedWorker)}</>
                      : 'Choose a service'
                  ) : (
                    <>
                      {serviceBasket.length > 0
                        ? `${serviceBasket.length} service${serviceBasket.length === 1 ? '' : 's'} selected`
                        : 'Choose a service'}
                      {selectedWorker && <> · {selectedWorker.displayName || workerDisplayName(selectedWorker)}</>}
                      {selectedDate && <> → {selectedDate}</>}
                      {selectedTime && <> @ {format24To12(selectedTime)}</>}
                    </>
                  )}
                </>
              )}
            </>
          ) : null
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

      {mode === 'create' && (
        <div className="rakie-guided-progress mx-1 mt-3">
          <div className="rakie-step-track" aria-label="Booking progress">
            {[
              { n: 1, label: 'Who' },
              { n: 2, label: 'Service' },
              { n: 3, label: 'Date & time' },
              { n: 4, label: 'Review' },
            ].map((step) => (
              <button
                type="button"
                key={step.n}
                className={`rakie-step ${guidedStep === step.n ? 'is-current' : ''} ${guidedStep > step.n ? 'is-complete' : ''}`}
                onClick={() => {
                  if (step.n === 1) setGuidedStep(1);
                  if (step.n === 2) setGuidedStep(2);
                  if (step.n === 3 && serviceBasket.length > 0 && (!workerRequired || current.workerId)) setGuidedStep(3);
                  if (step.n === 4 && selectedDate && selectedTime) setGuidedStep(4);
                }}
                disabled={(step.n === 3 && (serviceBasket.length === 0 || (workerRequired && !current.workerId))) || (step.n === 4 && (!selectedDate || !selectedTime))}
              >
                <span className="rakie-step-number">{guidedStep > step.n ? '✓' : step.n}</span>
                <span>{step.label}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'create' && effectiveClient?._id && guidedStep === 1 && (
        <div className="mx-1 mt-2">
          {!showFamilyBookingPanel ? (
            <div className="rakie-guided-panel mt-0">
              <div className="rakie-eyebrow">STEP 1 OF 4</div>
              <h2 className="rakie-guided-title">Who is this appointment for?</h2>
              <p className="rakie-guided-copy">Choose yourself or Family Booking.</p>
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => { setGuidedStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                  className="rakie-choice-card"
                >
                  <span className="rakie-choice-title">For myself</span>
                  <span className="rakie-choice-copy">Book your appointment.</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowFamilyBookingPanel(true)}
                  className="rakie-choice-card rakie-family-choice-card"
                  aria-label="Family Booking"
                >
                  <img src={familyHubIcon} alt="" className="h-10 w-10 object-contain" />
                  <span>
                    <span className="rakie-choice-title">Family Booking</span>
                    <span className="rakie-choice-copy">Book up to two people.</span>
                  </span>
                </button>
              </div>
              <div className="mt-4 flex justify-center">
                <button type="button" onClick={handleCancelBooking} className="px-5 py-2 bg-gray-200 hover:bg-gray-300 rounded">Cancel</button>
              </div>
            </div>
          ) : (
            <section className="rounded-lg border border-blue-200 bg-blue-50 p-3 shadow-sm">
              <div className="mb-2 flex items-center justify-end gap-2">
                {Number(familyScheduleSummary?.upcomingCount || 0) > 0 && (
                  <button
                    type="button"
                    onClick={() => setShowFamilyScheduleHub(true)}
                    className="inline-flex h-7 items-center gap-1.5 rounded border border-emerald-200 bg-white px-2 text-xs font-semibold text-emerald-700"
                    aria-label="Open family schedule"
                    title="Family schedule"
                  >
                    <span>Family Schedule</span>
                    <span className="min-w-[18px] rounded-full bg-emerald-600 px-1 text-center text-[10px] font-bold leading-[18px] text-white">
                      {familyScheduleSummary.upcomingCount}
                    </span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (familyBookingDrafts.length > 0) {
                      toast.info('Finish or go back before closing family booking.');
                      return;
                    }
                    setShowFamilyBookingPanel(false);
                  }}
                  className="h-7 rounded border border-blue-200 bg-white px-2 text-xs font-semibold text-blue-700"
                >
                  Hide family options
                </button>
              </div>
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-semibold text-blue-900">Choose who you&apos;re booking for</h3>
              <p className="text-xs text-blue-700">Select up to 2 people.</p>
            </div>
            <button
              type="button"
              onClick={() => setShowAddFamilyMember((value) => !value)}
              className="shrink-0 rounded border border-blue-300 bg-white px-2 py-1 text-xs font-semibold text-blue-700"
            >
              + Family member
            </button>
          </div>

          {selectedBookingClientIds.length > 1 && (() => {
            const selectedPeople = selectedBookingClientIds
              .map((selectedId) => familyBookingPeople.find((person) => String(person._id) === String(selectedId)))
              .filter(Boolean);
            const selectedNames = selectedPeople.map((person) => person.firstName || 'Family member');
            const activePerson = familyBookingPeople.find((person) => String(person._id) === String(activeBookingClientId));
            const progressNumber = Math.min(activeFamilyBookingIndex + 1, selectedBookingClientIds.length);

            return (
              <div className="mt-2 rounded border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
                <div className="font-semibold">{selectedNames.join(' + ')}</div>
                <div className="mt-0.5 text-xs sm:text-sm">
                  {familyBookingDrafts.length > 0 && <span className="mr-1">✓ Previous person saved.</span>}
                  Now booking <strong>{progressNumber} of {selectedBookingClientIds.length}</strong>: <strong>{activePerson?.firstName || 'family member'}</strong>.
                </div>
              </div>
            );
          })()}

          {selectedBookingClientIds.length > 1 && familyBookingDrafts.length === 0 && (
            <div className="mt-2 rounded border border-blue-200 bg-white p-2">
              <div className="text-xs font-semibold text-blue-900">Next: choose how to schedule them</div>
              <div className="mt-2 grid gap-2 sm:grid-cols-2">
                <label className={`cursor-pointer rounded border p-2 text-xs ${familyScheduleMode === 'individual' ? 'border-blue-600 bg-blue-50' : 'border-gray-200'}`}>
                  <input type="radio" name="familyScheduleMode" className="mr-2" checked={familyScheduleMode === 'individual'} onChange={() => setFamilyScheduleMode('individual')} />
                  <strong>Separate times</strong><br />Choose each person&apos;s time separately.
                </label>
                {!effectiveSingleStylist && <label className={`cursor-pointer rounded border p-2 text-xs ${familyScheduleMode === 'together-auto' ? 'border-green-600 bg-green-50' : 'border-gray-200'}`}>
                  <input type="radio" name="familyScheduleMode" className="mr-2" checked={familyScheduleMode === 'together-auto'} onChange={() => setFamilyScheduleMode('together-auto')} />
                  <strong>Best fit together</strong><br />We&apos;ll show the closest available times.
                </label>}
                {!effectiveSingleStylist && <label className={`cursor-pointer rounded border p-2 text-xs ${familyScheduleMode === 'together-same' ? 'border-green-600 bg-green-50' : 'border-gray-200'}`}>
                  <input type="radio" name="familyScheduleMode" className="mr-2" checked={familyScheduleMode === 'together-same'} onChange={() => setFamilyScheduleMode('together-same')} />
                  <strong>Same start time</strong><br />Different available stylists required.
                </label>}
                {effectiveSingleStylist && (
                  <div className="rounded border border-blue-200 bg-blue-50 p-2 text-xs text-blue-800">
                    One stylist is available — choose separate or back-to-back times.
                  </div>
                )}
                <label className={`cursor-pointer rounded border p-2 text-xs ${familyScheduleMode === 'together-back-to-back' ? 'border-green-600 bg-green-50' : 'border-gray-200'}`}>
                  <input type="radio" name="familyScheduleMode" className="mr-2" checked={familyScheduleMode === 'together-back-to-back'} onChange={() => setFamilyScheduleMode('together-back-to-back')} />
                  <strong>Back-to-back</strong><br />Second appointment starts after the first.
                </label>
              </div>
            </div>
          )}

          {familyTogetherMode && activeFamilyBookingIndex > 0 && firstFamilyBookingBlock && (
            <div className="mt-2 rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              Now choose <strong>{activeBookingPerson?.firstName || 'the next person'}</strong>&apos;s time. Available times are already limited to keep the appointments together.
            </div>
          )}

          <div className="mt-2 flex flex-wrap gap-2">
            {familyBookingPeople.map((person) => {
              const personId = String(person._id || '');
              const selected = selectedBookingClientIds.includes(personId);
              const activeCount = Number(person.activeAppointmentCount ?? person.upcomingAppointments?.length ?? 0);
              const atLimit = activeCount >= 2;
              return (
                <button
                  type="button"
                  key={personId}
                  onClick={() => toggleBookingPerson(personId)}
                  disabled={familyBookingDrafts.length > 0 || (!selected && atLimit)}
                  title={atLimit ? 'Two active appointments already. Contact the salon for another appointment.' : ''}
                  aria-pressed={selected}
                  className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-60 ${selected ? `border-green-600 bg-green-600 text-white ${personId === String(activeBookingClientId) ? 'ring-2 ring-green-200 ring-offset-1' : ''}` : 'border-blue-200 bg-white text-blue-800 hover:border-blue-400'}`}
                >
                  {selected && <span aria-hidden="true" className="text-sm leading-none">✓</span>}
                  <span>{person.relationship === 'self' ? 'Me — ' : ''}{person.firstName} {person.lastName}
                  {person.relationship && person.relationship !== 'self' && person.relationship !== 'family' ? ` (${person.relationship})` : ''}</span>
                  {atLimit && <span className="rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-900">2 active</span>}
                </button>
              );
            })}
          </div>

          {selectedFamilyAppointmentRows.length > 0 && (
            <div className="mt-2 space-y-2">
              {selectedFamilyAppointmentRows.map(({ member, appointment, canEdit }) => (
                <div key={`${member._id}-${getEditingId(appointment) || appointment.date || 'active'}`} className="flex flex-wrap items-center justify-between gap-2 rounded border border-emerald-200 bg-white px-3 py-2 text-xs text-gray-800">
                  <div className="min-w-0">
                    <span className="font-semibold text-emerald-800">Active appointment — {member.relationship === 'self' ? 'Me' : (member.firstName || 'Family member')}:</span>{' '}
                    <span>{appointment.service?.name || appointment.service || 'Service'} • {appointment.date} @ {format24To12(appointment.time)}</span>
                    {appointment.status && <span className="ml-1 uppercase text-gray-500">({appointment.status})</span>}
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => editFamilyAppointment(appointment)}
                      className="shrink-0 rounded border border-blue-300 bg-white px-2 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-50"
                    >
                      Edit
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}

          {showAddFamilyMember && (
            <div className="mt-3 grid grid-cols-1 gap-2 rounded border border-blue-200 bg-white p-2 sm:grid-cols-2">
              <label className="text-xs font-semibold text-gray-800">First name <span className="text-red-600">*</span>
                <input className="mt-1 w-full rounded border p-2 text-sm font-normal" placeholder="First name" value={familyMemberForm.firstName} onChange={(e) => setFamilyMemberForm((v) => ({ ...v, firstName: e.target.value }))} />
              </label>
              <label className="text-xs font-semibold text-gray-800">Last name <span className="text-red-600">*</span>
                <input className="mt-1 w-full rounded border p-2 text-sm font-normal" placeholder="Last name" value={familyMemberForm.lastName} onChange={(e) => setFamilyMemberForm((v) => ({ ...v, lastName: e.target.value }))} />
              </label>
              {!familyNoPhoneMode && (
                <label className="text-xs font-semibold text-gray-800">Phone number <span className="text-red-600">*</span>
                  <input ref={familyPhoneInputRef} aria-invalid={Boolean(familyPhoneFieldError)} className={`mt-1 w-full rounded border p-2 text-sm font-normal ${familyPhoneFieldError ? 'border-red-500 ring-1 ring-red-500' : ''}`} inputMode="tel" placeholder="10-digit phone" value={familyMemberForm.phone} onChange={(e) => { setFamilyPhoneFieldError(''); setFamilyMemberForm((v) => ({ ...v, phone: e.target.value })); }} />
                  {familyPhoneFieldError && <span className="mt-1 block text-[11px] font-semibold text-red-600">{familyPhoneFieldError}</span>}
                </label>
              )}
              <label className="text-xs font-semibold text-gray-800">Relationship <span className="text-red-600">*</span>
                <select className="mt-1 w-full rounded border p-2 text-sm font-normal" value={familyMemberForm.relationship} onChange={(e) => setFamilyMemberForm((v) => ({ ...v, relationship: e.target.value }))}>
                  {familyNoPhoneMode ? (
                    <>
                      <option value="child">Child</option>
                      <option value="stepchild">Stepchild</option>
                      <option value="foster_child">Foster child</option>
                      <option value="legal_ward">Legal ward</option>
                      <option value="grandchild">Grandchild in my care</option>
                      <option value="minor_sibling">Minor sibling in my care</option>
                    </>
                  ) : (
                    <>
                      <option value="family">Family</option>
                      <option value="spouse">Spouse</option>
                      <option value="child">Child</option>
                      <option value="parent">Parent</option>
                      <option value="sibling">Sibling</option>
                    </>
                  )}
                </select>
              </label>
              {familyNoPhoneMode && (
                <>
                  <label className="text-xs font-semibold text-gray-800">Date of birth <span className="text-red-600">*</span>
                    <input type="date" className="mt-1 w-full rounded border p-2 text-sm font-normal" value={familyMemberForm.dob} onChange={(e) => setFamilyMemberForm((v) => ({ ...v, dob: e.target.value }))} />
                  </label>
                  <label className="flex items-start gap-2 rounded border bg-amber-50 p-3 text-xs sm:col-span-2">
                    <input type="checkbox" className="mt-0.5" checked={Boolean(familyMemberForm.guardianAttestation)} onChange={(e) => setFamilyMemberForm((v) => ({ ...v, guardianAttestation: e.target.checked }))} />
                    <span>I confirm this person is under 18, does not have their own phone, and I am authorized to manage their salon appointments.</span>
                  </label>
                  <p className="text-[11px] text-gray-600 sm:col-span-2">Adults without a phone must be added by salon staff.</p>
                </>
              )}
              <div className="flex flex-wrap gap-2 sm:col-span-2">
                <button type="button" disabled={familySaving} onClick={addFamilyMember} className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                  {familySaving ? 'Adding…' : (familyNoPhoneMode ? 'Add minor and select' : 'Add and select')}
                </button>
                {familyNoPhoneMode && <button type="button" onClick={() => { setFamilyNoPhoneMode(false); setFamilyPhoneFieldError(''); setFamilyMemberForm((v) => ({ ...v, relationship: 'family', dob: '', guardianAttestation: false })); }} className="rounded border px-3 py-2 text-sm">Use phone number</button>}
                <button type="button" onClick={() => { setShowAddFamilyMember(false); setFamilyNoPhoneMode(false); setFamilyPhoneFieldError(''); }} className="rounded border px-3 py-2 text-sm">Cancel</button>
              </div>
            </div>
          )}

          <div className="mt-4 flex justify-end">
            <button
              type="button"
              className="rakie-primary-button px-5 py-2 text-white"
              disabled={selectedBookingClientIds.length === 0}
              onClick={() => { setGuidedStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
            >
              Continue to services →
            </button>
          </div>

            </section>
          )}
        </div>
      )}

      {pendingServiceToAdd && createPortal(
        <div className="fixed inset-0 flex items-center justify-center bg-black/55 p-4" style={{ zIndex: 100000 }} role="dialog" aria-modal="true" aria-label="Add service">
          <div className="rakie-add-service-modal w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <div className="rakie-eyebrow">{editingBasketItemId ? 'EDIT SERVICE' : 'ADD SERVICE'}</div>
            <h3 className="mt-1 text-xl font-bold text-gray-900">{editingBasketItemId ? `Change to ${pendingServiceToAdd.name}?` : `Add ${pendingServiceToAdd.name}?`}</h3>
            <p className="mt-2 text-sm text-gray-600">
              {editingBasketItemId
                ? <>This will replace the selected service for <strong>{activeBookingPerson?.firstName || 'your'}</strong>{activeBookingPerson?.firstName ? "'s" : ''} appointment.</>
                : <>This service will be added to <strong>{activeBookingPerson?.firstName || 'your'}</strong>{activeBookingPerson?.firstName ? "'s" : ''} appointment.</>}
            </p>
            <div className="mt-5 flex gap-2">
              <button type="button" className="rakie-secondary-button flex-1" onClick={() => setPendingServiceToAdd(null)}>{editingBasketItemId ? 'Keep current' : 'Not yet'}</button>
              <button type="button" className="rakie-primary-button flex-1" onClick={async () => { const service = pendingServiceToAdd; setPendingServiceToAdd(null); await commitServiceSelection(service); }}>{editingBasketItemId ? 'Update service' : 'Add service'}</button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {familyPhonePromptOpen && createPortal(
        <div className="fixed inset-0 flex items-center justify-center bg-black/55 p-4" style={{ zIndex: 100000 }} role="alertdialog" aria-modal="true" aria-label="Phone number required">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900">Phone number required</h3>
            <p className="mt-2 text-sm text-gray-700">{familyPhonePromptMessage}</p>
            <button type="button" onClick={() => { setFamilyPhonePromptOpen(false); setTimeout(() => familyPhoneInputRef.current?.focus(), 0); }} className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-bold text-white">OK</button>
            <button type="button" onClick={() => { setFamilyPhonePromptOpen(false); setFamilyPhoneFieldError(''); setFamilyNoPhoneMode(true); setFamilyMemberForm((v) => ({ ...v, phone: '', relationship: 'child', dob: '', guardianAttestation: false })); }} className="mt-3 text-xs font-semibold text-blue-700 underline">This family member does not have a phone</button>
          </div>
        </div>,
        document.body
      )}

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
  {(mode !== 'create' || guidedStep === 2) && (
    <div className="rakie-guided-panel">
      {mode === 'create' && (
        <div className="mb-4">
          <div className="rakie-eyebrow">STEP 2 OF 4</div>
          <h2 className="rakie-guided-title">Select the service you’d like.</h2>
          {selectedBookingClientIds.length > 1 && (
            <div className="rakie-booking-for">Choosing services for <strong>{activeBookingPerson?.firstName || 'family member'} {activeBookingPerson?.lastName || ''}</strong></div>
          )}
          <p className="rakie-guided-copy">Choose a service, then confirm that you want to add it to this appointment.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={() => { setGuidedStep(1); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="px-4 py-2 rounded border border-blue-300 bg-white text-blue-700 hover:bg-blue-50">← Back</button>
            <button type="button" onClick={handleCancelBooking} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded">Cancel</button>
          </div>
        </div>
      )}
      {mode === 'create' && (
        <div className="mb-4 rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <div className="text-sm font-semibold text-gray-900">
                {activeBookingPerson?.firstName || 'Your'} active appointments
              </div>
              <div className="text-xs text-gray-500">
                {!capacityReadyForActiveClient
                  ? 'Checking current appointments…'
                  : `${appointmentCapacity.count} of ${appointmentCapacity.max} active appointments`}
              </div>
            </div>
            {capacityReadyForActiveClient && appointmentCapacity.canCreate && appointmentCapacity.count > 0 && (
              <span className="rounded-full bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700">
                Booking available
              </span>
            )}
          </div>

          {appointmentCapacity.error && (
            <div className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
              {appointmentCapacity.error}
            </div>
          )}

          {capacityReadyForActiveClient && appointmentCapacity.activeAppointments.length > 0 && (
            <div className="mt-3 space-y-2">
              {appointmentCapacity.activeAppointments.map((appointment) => (
                <div key={getEditingId(appointment) || `${appointment.date}-${appointment.time}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                  <div className="min-w-0 text-xs text-gray-700">
                    <div className="font-semibold text-gray-900">
                      {appointment?.serviceId?.name || appointment?.service?.name || appointment?.service || 'Service'}
                    </div>
                    <div>
                      {appointment.date} @ {format24To12(appointment.time)}
                      {appointment.status && <span className="ml-1 uppercase text-gray-500">({appointment.status})</span>}
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    {appointment?.canEditAppointment !== false && (
                      <button type="button" onClick={() => openActiveAppointmentForEdit(appointment)} className="rakie-review-edit">Edit</button>
                    )}
                    {appointment?.canCancelAppointment !== false && (
                      <button type="button" onClick={() => cancelActiveAppointmentFromStep2(appointment)} className="rakie-review-remove">Cancel</button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}

          {capacityReadyForActiveClient && !appointmentCapacity.canCreate && !appointmentCapacity.error && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              Maximum active appointments reached. Edit or cancel an appointment above before starting another booking.
            </div>
          )}
        </div>
      )}

      {mode === 'create' && serviceBasket.length > 0 && (
        <div className="mb-4 rounded-xl border border-blue-100 bg-blue-50/40 p-3">
          <div className="mb-2">
            <div className="text-sm font-semibold text-gray-900">Selected services for {activeBookingPerson?.firstName || 'you'}</div>
            <div className="text-xs text-gray-600">{serviceBasket.length} of {maxServiceLimit} services selected</div>
          </div>
          <div className="space-y-2">
            {serviceBasket.map((item, index) => (
              <div key={item.id || index} className="flex items-center justify-between gap-3 rounded-lg border border-blue-100 bg-white px-3 py-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-gray-900">{index + 1}. {item.service?.name || 'Service'}</div>
                  <div className="text-xs text-gray-500">
                    {basketItemDuration(item)} min
                    {(item.addOns || []).length ? ` · Add-ons: ${(item.addOns || []).map((addOn) => addOn.name).join(', ')}` : ''}
                  </div>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button type="button" className="rakie-review-edit" onClick={() => beginEditBasketItem(item)}>Edit</button>
                  <button type="button" className="rakie-review-remove" onClick={() => removeBasketItem(item.id)}>Remove</button>
                </div>
              </div>
            ))}
          </div>

          {serviceBasket.length >= maxServiceLimit && (
            <div className="mt-2 text-xs font-medium text-gray-600">Maximum {maxServiceLimit} services per client for online booking.</div>
          )}

          {editingBasketItemId ? (
            <div className="rakie-service-selection-cue">Choose a replacement service below.</div>
          ) : isSelectingAdditionalService ? (
            <div className="rakie-service-selection-cue">Choose your next service below.</div>
          ) : (
            <div className="rakie-service-next-actions">
              {serviceBasket.length < maxServiceLimit && (
                <button
                  type="button"
                  className="rakie-secondary-button"
                  onClick={prepareToAddAnotherService}
                >
                  + Add another service
                </button>
              )}
              {isBackToBackFollower ? (
                <>
                  <button
                    type="button"
                    className="rakie-primary-button rakie-guided-next"
                    disabled={
                      (workerRequired && !current.workerId) ||
                      !selectedDate ||
                      !selectedTime ||
                      selectedDate !== firstFamilyBookingBlock?.date ||
                      selectedTime !== firstFamilyBookingBlock?.endTime
                    }
                    onClick={() => {
                      setServiceAddedPrompt(null);
                      setGuidedStep(4);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    Review & book →
                  </button>
                  <button
                    type="button"
                    className="rakie-secondary-button"
                    onClick={() => {
                      setFamilyScheduleMode('individual');
                      setSelectedTime(null);
                      setGuidedStep(3);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}
                  >
                    Change scheduling
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  className="rakie-primary-button rakie-guided-next"
                  disabled={workerRequired && !current.workerId}
                  onClick={() => { setServiceAddedPrompt(null); setGuidedStep(3); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                >
                  Go to date & time →
                </button>
              )}
            </div>
          )}

          {isBackToBackFollower && serviceBasket.length > 0 && !editingBasketItemId && !isSelectingAdditionalService && (
            <div className="mt-2 rounded border border-green-200 bg-green-50 px-3 py-2 text-center text-xs text-green-800">
              Back-to-back selected. {activeBookingPerson?.firstName || 'This appointment'} will start at <strong>{format24To12(firstFamilyBookingBlock?.endTime)}</strong> on the same day as the first appointment.
              {!selectedTime && current.workerId && <div className="mt-1">Checking that exact time with the selected stylist…</div>}
            </div>
          )}

          {workerRequired && !current.workerId && !editingBasketItemId && !isSelectingAdditionalService && (
            <div className="mt-2 text-center text-xs text-amber-800">Choose a stylist before continuing.</div>
          )}
        </div>
      )}

      {servicePickerLocked && (
        <div className="rakie-service-picker-lock-note" role="status">
          {!capacityReadyForActiveClient
            ? 'Checking active appointments before service selection…'
            : !appointmentCapacity.canCreate
              ? `Service selection is unavailable because ${activeBookingPerson?.firstName || 'this client'} already has the maximum number of active appointments.`
              : serviceBasket.length >= maxServiceLimit
                ? `Maximum ${maxServiceLimit} services selected. Continue to date & time, or edit/remove a selected service.`
                : 'Service selection is paused. Choose “Add another service” or “Go to date & time” above.'}
        </div>
      )}

      <div
        className={`rakie-service-browser flex gap-4 items-start ${servicePickerLocked ? 'rakie-service-browser--locked' : ''}`}
        aria-disabled={servicePickerLocked ? 'true' : undefined}
      >
        <div className="flex flex-col gap-2 w-max">
          <div className={`rakie-step2-prompt ${categorySelectionMade ? 'is-done' : 'is-active'}`}>
            <span className="rakie-step2-number">{categorySelectionMade ? '✓' : '1'}</span>
            <span>
              <span className="rakie-step2-kicker">CATEGORY</span>
              <span className="rakie-step2-help">
                {categorySelectionMade ? `Selected: ${selectedCategory}` : 'Start here — choose a category'}
              </span>
            </span>
          </div>
          {categories.map(cat => (
            <button
              key={cat}
              disabled={servicePickerLocked}
              aria-disabled={servicePickerLocked ? 'true' : undefined}
              className={`rakie-category-pill px-3 py-2 text-sm rounded-full whitespace-nowrap ${selectedCategory === cat ? 'is-selected' : ''} ${servicePickerLocked ? 'cursor-not-allowed opacity-55' : ''}`}
              onClick={() => {
                setSelectedCategory(cat);
                setCategorySelectionMade(true);
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

        <div className="rakie-service-list flex flex-col gap-2 w-max">
          <div className={`rakie-step2-prompt ${categorySelectionMade ? 'is-active' : 'is-muted'}`}>
            <span className="rakie-step2-number">2</span>
            <span>
              <span className="rakie-step2-kicker">SERVICES</span>
              <span className="rakie-step2-help">
                {categorySelectionMade
                  ? `Choose a service${selectedCategory ? ` from ${selectedCategory}` : ''}`
                  : 'Choose a category first'}
              </span>
            </span>
          </div>
          {services.filter(s => s.category === selectedCategory).map(service => {
            const specialDeal = shouldShowClientPromotion ? getSpecialDealForService(service, promotionConfig) : null;
            const isSelected = selectedService?._id === service._id;
            const isInBasket = mode === 'create' && serviceBasket.some((item) => idOf(item.service) === idOf(service));
            const priceOpen = openPriceServiceId === service._id;
            return (
              <div
                key={service._id}
                className="relative flex items-stretch gap-1"
                onMouseLeave={() => setOpenPriceServiceId((current) => current === service._id ? null : current)}
              >
                <button
                  type="button"
                  disabled={servicePickerLocked}
                  aria-disabled={servicePickerLocked ? 'true' : undefined}
                  className={`rakie-service-choice min-w-0 flex-1 px-3 py-2 text-sm rounded-lg text-left ${
                    (isSelected || isInBasket)
                      ? 'bg-blue-600 text-white'
                      : specialDeal
                        ? 'bg-amber-50 border border-amber-300 text-gray-900'
                        : 'bg-gray-100'
                  } ${servicePickerLocked ? 'cursor-not-allowed opacity-55' : ''}`}
                  onClick={() => handleServiceClick(service)}
                >
                  <span className="flex items-center justify-between gap-2"><span>{service.name}</span>{isInBasket && <span aria-hidden="true">✓</span>}</span>
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
                  disabled={servicePickerLocked}
                  title={clientPriceMessage(service)}
                  onMouseEnter={() => setOpenPriceServiceId(service._id)}
                  onFocus={() => setOpenPriceServiceId(service._id)}
                  onBlur={() => setOpenPriceServiceId(null)}
                  onClick={() => setOpenPriceServiceId((current) => current === service._id ? null : service._id)}
                  className={`flex w-9 shrink-0 items-center justify-center rounded border text-base font-bold ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50 text-blue-700'
                      : 'border-emerald-300 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                  } ${servicePickerLocked ? 'cursor-not-allowed opacity-55' : ''}`}
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

      {selectedService && !effectiveSingleStylist && (
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

    </div>
  )}

      {(mode !== 'create' || (guidedStep === 3 && !isBackToBackFollower)) && (
        <div className="rakie-guided-panel">
          {mode === 'create' && (
            <div className="mb-4">
              <div className="rakie-eyebrow">STEP 3 OF 4</div>
              <h2 className="rakie-guided-title">When would you like to come in?</h2>
              {selectedBookingClientIds.length > 1 && <div className="rakie-booking-for">Choosing date and time for <strong>{activeBookingPerson?.firstName || 'family member'} {activeBookingPerson?.lastName || ''}</strong></div>}
              <p className="rakie-guided-copy">Choose a date, then pick an available time. We’ll show only times that work for the selected services.</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => { setGuidedStep(2); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="px-4 py-2 rounded border border-blue-300 bg-white text-blue-700 hover:bg-blue-50">← Back</button>
                <button type="button" onClick={handleCancelBooking} className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded">Cancel</button>
              </div>
            </div>
          )}
      <div className="rakie-calendar-row flex flex-row gap-4 items-start mt-4">
      <div className="rakie-calendar-card border rounded shadow p-1 w-[300px] overflow-hidden">
          <FullCalendar
            key={`family-calendar-${activeBookingClientId || 'self'}-${activeFamilyBookingIndex}`}
            plugins={[dayGridPlugin, interactionPlugin]}
            initialView="dayGridMonth"
            initialDate={selectedDate || undefined}
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

      {mode === 'create' && selectedDate && selectedTime && (
        <div className="rakie-guided-actions mt-5">
          <div className="rakie-selection-confirmation">
            <span className="rakie-selection-check">✓</span>
            <div>
              <div className="font-semibold">{new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })}</div>
              <div className="text-sm text-gray-600">{format24To12(selectedTime)}</div>
            </div>
          </div>
          <button
            type="button"
            className="rakie-primary-button rakie-guided-next"
            onClick={() => { setGuidedStep(4); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
          >
            Continue to review →
          </button>
        </div>
      )}
        </div>
      )}


      {client?.welcomeOffer?.code === 'NEWCLIENT10' && client?.welcomeOffer?.status === 'available' && (
        <div className="mt-4 rounded border border-green-300 bg-green-50 p-3 text-green-800">
          <div className="font-semibold">$10 New Client Credit Available</div>
          <div className="text-sm">It will apply automatically to your first completed booking.</div>
        </div>
      )}

      {(mode !== 'create' || guidedStep === 4) && (
        <div className="rakie-review-wrap">
          {mode === 'create' && familyFinalReviewRows?.length > 0 && (
            <div className="rakie-guided-panel rakie-review-card rakie-family-final-review">
              <div className="rakie-eyebrow">FINAL FAMILY REVIEW</div>
              <h2 className="rakie-guided-title">Review everyone together</h2>
              <p className="rakie-guided-copy">Nothing is sent until you press the final request button below.</p>
              <div className="rakie-family-review-groups">
                {selectedBookingClientIds.map((clientId) => {
                  const person = familyBookingPeople.find((candidate) => String(candidate._id) === String(clientId));
                  const rows = familyFinalReviewRows.filter((row) => String(row.clientId) === String(clientId));
                  if (!rows.length) return null;
                  return (
                    <section key={clientId} className="rakie-family-review-person">
                      <div className="rakie-family-review-person-head">
                        <div>
                          <div className="text-xs uppercase tracking-wide text-gray-500">Appointment for</div>
                          <h3>{person?.firstName || 'Family member'} {person?.lastName || ''}</h3>
                        </div>
                        <button type="button" className="rakie-review-edit" onClick={() => {
                          const index = selectedBookingClientIds.findIndex((id) => String(id) === String(clientId));
                          if (index >= 0) {
                            setFamilyFinalReviewRows(null);
                            setActiveFamilyBookingIndex(index);
                            restoreFamilyStepSelection(familyStepSelections[String(clientId)] || null, rows[0]?.date || null);
                            setGuidedStep(4);
                          }
                        }}>Edit</button>
                      </div>
                      <div className="rakie-review-services">
                        {rows.map((row, index) => (
                          <div key={`${clientId}-${row.serviceId}-${index}`} className="rakie-review-service-line">
                            <div>
                              <strong>{row.service || 'Service'}</strong>
                              <div className="text-xs text-gray-500">{row.duration || 0} min{row.time ? ` · ${format24To12(row.time)}` : ''}</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <div className="rakie-review-details rakie-review-details-compact">
                        <div className="rakie-review-appointment-tile">
                          <strong>{rows[0]?.date ? new Date(`${rows[0].date}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '—'} · {format24To12(rows[0]?.time) || '—'}</strong>
                          <span>Stylist: {familyStepSelections[String(clientId)]?.selectedWorker ? workerDisplayName(familyStepSelections[String(clientId)].selectedWorker) : '—'}</span>
                        </div>
                      </div>
                    </section>
                  );
                })}
              </div>
            </div>
          )}
          {mode === 'create' && !familyFinalReviewRows?.length && (
            <div className="rakie-guided-panel rakie-review-card">
              <div className="rakie-eyebrow">STEP 4 OF 4</div>
              <h2 className="rakie-guided-title">Review and book your appointment</h2>
              {selectedBookingClientIds.length > 1 && <div className="rakie-booking-for">Reviewing appointment for <strong>{activeBookingPerson?.firstName || 'family member'} {activeBookingPerson?.lastName || ''}</strong></div>}
              <p className="rakie-guided-copy">Review this visit before continuing.</p>
              <div className="rakie-review-services">
                <div className="rakie-review-section-label">Services</div>
                {(serviceBasket.length ? serviceBasket : [{ id: 'selected-service', service: selectedService, addOns: selectedAddOns || [] }]).map((item, index) => (
                  <div key={item.id || index} className="rakie-review-service-line">
                    <div className="min-w-0">
                      <strong>{item.service?.name || 'Service'}</strong>
                      <div className="text-xs text-gray-500">
                        {basketItemDuration(item)} min
                        {(item.addOns || []).length ? ` · Add-ons: ${(item.addOns || []).map((addOn) => addOn.name).join(', ')}` : ''}
                      </div>
                    </div>
                    <div className="rakie-review-line-actions">
                      <button
                        type="button"
                        className="rakie-review-edit"
                        onClick={() => {
                          setGuidedStep(2);
                          beginEditBasketItem(item);
                        }}
                      >
                        Edit
                      </button>
                      {serviceBasket.length > 0 && (
                        <button type="button" className="rakie-review-remove" onClick={() => { removeBasketItem(item.id); if (serviceBasket.length <= 1) setGuidedStep(2); }}>Remove</button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
              <div className="rakie-review-details rakie-review-details-compact">
                <div className="rakie-review-appointment-tile">
                  <strong>{selectedDate ? new Date(`${selectedDate}T12:00:00`).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : '—'} · {format24To12(selectedTime) || '—'}</strong>
                  <span>{selectedWorker ? `Stylist: ${workerDisplayName(selectedWorker)}` : 'Stylist: —'}</span>
                </div>
              </div>
              <button type="button" className="rakie-review-edit" onClick={() => setGuidedStep(3)}>Change date or time</button>
            </div>
          )}
      <details className="rakie-coupon-card mt-4 border rounded bg-white p-3 space-y-2">
        <summary className="cursor-pointer text-sm font-semibold">Have a coupon?</summary>
        <div className="mt-3 flex flex-col sm:flex-row gap-2">
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
      </details>

<div className="rakie-final-actions mt-4 flex flex-wrap justify-center gap-3">
  {!bookingCompleteNotice && mode === 'create' && (
    <button
      type="button"
      onClick={() => {
        if (familyFinalReviewRows?.length) {
          const lastIndex = Math.max(0, selectedBookingClientIds.length - 1);
          const lastId = String(selectedBookingClientIds[lastIndex] || '');
          setFamilyFinalReviewRows(null);
          setActiveFamilyBookingIndex(lastIndex);
          restoreFamilyStepSelection(familyStepSelections[lastId] || null, firstFamilyBookingBlock?.date || null);
          setGuidedStep(4);
        } else if (selectedBookingClientIds.length > 1 && activeFamilyBookingIndex > 0) {
          goToPreviousFamilyMember();
        } else {
          setGuidedStep(3);
          window.scrollTo({ top: 0, behavior: 'smooth' });
        }
      }}
      disabled={isSubmitting}
      className="px-5 py-2 rounded border border-blue-300 bg-white text-blue-700 hover:bg-blue-50 disabled:opacity-60"
    >
      ← Back
    </button>
  )}

  {!bookingCompleteNotice && (
  <button
    onClick={handleSubmit}
    disabled={isSubmitting || (!(mode === 'create' && familyFinalReviewRows?.length) && !canSubmit)}
    className={`rakie-primary-button px-6 py-2 rounded text-white ${(isSubmitting || (!(mode === 'create' && familyFinalReviewRows?.length) && !canSubmit)) ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
  >
  
    {mode === 'edit' ? 'Update Appointment'
      : mode === 'rebook' ? 'Rebook'
      : mode === 'create' && familyFinalReviewRows?.length ? 'Request Family Appointments'
      : mode === 'create' && selectedBookingClientIds.length > 1 && activeFamilyBookingIndex < selectedBookingClientIds.length - 1 ? 'Save & Continue to Next Person'
      : mode === 'create' && selectedBookingClientIds.length > 1 ? 'Review All Family Appointments'
      : mode === 'create' ? 'Request Appointment' : 'Book Appointment'}
  </button>
  )}

  {!bookingCompleteNotice && (
  <button
    onClick={handleCancelBooking}
    className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded"
  >
    Cancel
  </button>
  )}
</div>
        </div>
      )}


      {showFamilyScheduleHub && effectiveClient && (
        <FamilyHub
          client={effectiveClient}
          onClose={() => setShowFamilyScheduleHub(false)}
          onBook={(clientIds) => {
            const validIds = (Array.isArray(clientIds) ? clientIds : []).map((id) => String(id)).filter(Boolean).slice(0, 2);
            if (validIds.length) {
              setSelectedBookingClientIds(validIds);
              setActiveFamilyBookingIndex(0);
              setFamilyBookingDrafts([]);
              setFamilyStepSelections({});
              setGuidedStep(1);
              setShowFamilyBookingPanel(true);
            }
            setShowFamilyScheduleHub(false);
          }}
          onEditAppointment={(appointment) => {
            try {
              sessionStorage.setItem('editingAppointment', JSON.stringify(appointment));
            } catch (error) {
              console.error('Unable to prepare family appointment edit:', error);
            }
            window.location.assign('/booking/schedule');
          }}
        />
      )}

      <img src={logo} alt="Rakie Salon Logo" className="fixed bottom-4 right-4 w-16 h-16 opacity-20 pointer-events-none" />
    
    </div>
</div>
  );
}
