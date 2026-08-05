import React, { useState, useEffect, useRef } from 'react';
import API from '../../api';
import { formatTime } from '../../utils/formatHelper';
import { toast } from 'react-toastify';
import { normalizePhone10, coercePhone10, isTenDigit } from '../../utils/phone';
import { getAdminUser } from '../../utils/permissions';
import {
  doesDateQualifyForDeal,
  getDealAppliesOnlyText,
  getDealQualifiedText,
  getSpecialDealForService,
  usePromotionConfig,
} from '../../utils/specialDeals';

const idOf = (value) => String(value?._id || value || '');

const getWorkerDisplayName = (worker) =>
  worker?.displayName || [worker?.firstName, worker?.lastName].filter(Boolean).join(' ') || 'Stylist';

const getWorkerAssignment = (worker, serviceId) => {
  if (!worker || !serviceId) return null;
  return (worker.serviceAssignments || []).find((assignment) => idOf(assignment.serviceId) === idOf(serviceId));
};

const calcAddOnDuration = (addOns, selectedIds) =>
  (addOns || [])
    .filter((a) => (selectedIds || []).includes(idOf(a)))
    .reduce((sum, a) => sum + (Number(a.duration) || 0), 0);

export default function AppointmentFormModal({ isOpen, onClose, onSave, initialData }) {
  const phoneInputRef = useRef(null);
  const prevDateRef = useRef(''); // remember last accepted date to allow revert on cancel
  const availabilityRequestRef = useRef(0);

  const [form, setForm] = useState({
    clientId: '',
    serviceId: '',
    workerId: '',
    workerTierKey: '',
    date: '',
    time: '',
    duration: 60,
    status: 'booked',
    addOns: []
  });
  const [groupMode, setGroupMode] = useState(false);
  const [groupInfo, setGroupInfo] = useState({ groupType: 'family', groupLabel: '', bookedByContactName: '', bookedByContactPhone: '', coordinationNotes: '' });
  const [groupItems, setGroupItems] = useState([]);
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [workersLoading, setWorkersLoading] = useState(false);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [storeHours, setStoreHours] = useState([]);
  const [calendarStatus, setCalendarStatus] = useState(null);
  const [suggestedAddOns, setSuggestedAddOns] = useState([]);
  const [showAddOnPrompt, setShowAddOnPrompt] = useState(false);
  const [error, setError] = useState('');
  const [addingClient, setAddingClient] = useState(false);
  const [newClient, setNewClient] = useState({ firstName: '', lastName: '', phone: '', email: null });
  const [groupRowMode, setGroupRowMode] = useState('existing');
  const [eventGuest, setEventGuest] = useState({ firstName: '', lastName: '', phone: '', role: '', notes: '' });
  const [phoneSearch, setPhoneSearch] = useState('');
  const [, setDuplicatePhone] = useState(false);
  const [matchedClient, setMatchedClient] = useState(null);
  const [stylistSwitchRequest, setStylistSwitchRequest] = useState(null);
  const [effectiveSingleStylist, setEffectiveSingleStylist] = useState(false);
  const [defaultStylistNoticeKey, setDefaultStylistNoticeKey] = useState('');
  const { promotionConfig } = usePromotionConfig();
  const shouldShowWorkerPromotion = promotionConfig.enabled && promotionConfig.showWorkerBadges;
  const isNewAppointment = !initialData?._id;

  const [loading, setLoading] = useState({ find:false, addClient:false, save:false });
  const [newClientErrors, setNewClientErrors] = useState({});

  const Spinner = ({ className = '' }) => (
    <span
      aria-hidden
      className={`inline-block align-middle h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    />
  );

  const selectedClient = matchedClient || clients.find((c) => idOf(c) === idOf(form.clientId)) || initialData?.clientId || null;
  const assignedStylistId = idOf(selectedClient?.assignedStylistId);
  const assignedStylistName = selectedClient?.assignedStylistId
    ? getWorkerDisplayName(selectedClient.assignedStylistId)
    : '';
  const selectedWorkerMatchesDefault = !!assignedStylistId && !!form.workerId && idOf(form.workerId) === assignedStylistId;
  const selectedWorkerDiffersFromDefault = !!assignedStylistId && !!form.workerId && idOf(form.workerId) !== assignedStylistId;
  const defaultStylistAvailableForSelectedService = !!assignedStylistId && workers.some((worker) => idOf(worker) === assignedStylistId);
  const adminUser = getAdminUser();
  const currentBookerWorkerId = idOf(adminUser?.workerId);
  const currentRoleKey = String(adminUser?.roleKey || adminUser?.role || '').toLowerCase();
  const adminPermissions = adminUser?.permissions || {};
  const hasSchedulingAuthority = ['owner', 'admin', 'manager', 'frontdesk'].includes(currentRoleKey)
    || adminPermissions.appointmentsCreateForOthers === true
    || adminPermissions.appointmentsCreate === true;
  const isStylistBookingAnotherStylist = isNewAppointment
    && !!currentBookerWorkerId
    && !!form.workerId
    && idOf(form.workerId) !== currentBookerWorkerId
    && !hasSchedulingAuthority;
  const showDefaultStylistNotice = (clientObj, workerObj) => {
    const assignedId = idOf(clientObj?.assignedStylistId);
    if (!isNewAppointment || !assignedId) return;
    const adminUser = getAdminUser();
    const currentBookerWorkerId = idOf(adminUser?.workerId);
    if (currentBookerWorkerId && currentBookerWorkerId === assignedId) return;
    const key = `${idOf(clientObj)}:${assignedId}`;
    if (defaultStylistNoticeKey === key) return;
    setDefaultStylistNoticeKey(key);
    const stylistName = workerObj ? getWorkerDisplayName(workerObj) : getWorkerDisplayName(clientObj.assignedStylistId);
    window.alert(`${stylistName} is this client’s default stylist and has been selected for this appointment. You may choose another stylist for this appointment only; client ownership will not change.`);
  };

  const buildStylistSwitchRequest = (requestedWorkerId) => {
    if (!isNewAppointment || !selectedClient || !requestedWorkerId) return null;
    const requestedWorker = workers.find((w) => idOf(w) === idOf(requestedWorkerId));
    const selectedId = idOf(requestedWorkerId);
    const oneTimeDifferentFromDefault = assignedStylistId && selectedId !== assignedStylistId;
    const pendingForReceivingStylist = currentBookerWorkerId && selectedId !== currentBookerWorkerId && !hasSchedulingAuthority;
    const ownerStylistWillBeNotified = !!assignedStylistId
      && oneTimeDifferentFromDefault
      && !!currentBookerWorkerId
      && selectedId === currentBookerWorkerId
      && !hasSchedulingAuthority;
    if (!oneTimeDifferentFromDefault && !pendingForReceivingStylist && !ownerStylistWillBeNotified) return null;
    return {
      client: selectedClient,
      phone: normalizePhone10(selectedClient.phone || phoneSearch),
      fromWorkerId: assignedStylistId,
      fromWorkerName: assignedStylistName || 'the client’s default stylist',
      requestedWorkerId: selectedId,
      requestedWorkerName: requestedWorker ? getWorkerDisplayName(requestedWorker) : 'the selected stylist',
      oneTimeDifferentFromDefault,
      pendingForReceivingStylist,
      ownerStylistWillBeNotified,
    };
  };
  const resetForm = () => {
    setForm({ clientId: '', serviceId: '', workerId: '', workerTierKey: '', date: '', time: '', duration: 60, status: 'booked', addOns: [] });
    setAvailableTimes([]);
    setSuggestedAddOns([]);
    setError('');
    setAddingClient(false);
    setNewClient({ firstName: '', lastName: '', phone: '', email: '' });
    setGroupRowMode('existing');
    setEventGuest({ firstName: '', lastName: '', phone: '', role: '', notes: '' });
    setPhoneSearch('');
    setMatchedClient(null);
    setStylistSwitchRequest(null);
    setDefaultStylistNoticeKey('');
    setNewClientErrors({});
    setGroupMode(false);
    setGroupInfo({ groupType: 'family', groupLabel: '', bookedByContactName: '', bookedByContactPhone: '', coordinationNotes: '' });
    setGroupItems([]);
  };

  useEffect(() => {
    API.get('/booking-status')
      .then(({ data }) => setEffectiveSingleStylist(Boolean(data?.shopMode?.effectiveSingleStylist)))
      .catch(() => setEffectiveSingleStylist(false));
  }, []);

  useEffect(() => {
    fetchClients();
    fetchServices();
    fetchStoreHours();
  }, []);

  const fetchStoreHours = async () => {
    try {
      const { data } = await API.get('/admin/store-hours');
      setStoreHours(data);
    } catch (err) {
      console.error('Failed to fetch store hours', err);
    }
  };

  useEffect(() => {
    if (form.serviceId) {
      API.get(`/services/${form.serviceId}/addons`)
        .then(res => {
          setSuggestedAddOns(res.data || []);
          setShowAddOnPrompt((res.data || []).length > 0);
        })
        .catch(err => {
          console.error('Failed to load suggested add-ons', err);
          setShowAddOnPrompt(false);
        });
    }
  }, [form.serviceId]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => phoneInputRef.current?.focus(), 100);
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && initialData) {
      const normalized = {
        ...initialData,
        clientId: initialData.clientId?._id || '',
        serviceId: initialData.serviceId?._id || '',
        workerId: idOf(initialData.workerId || initialData.worker || initialData.priceSnapshot?.workerId),
        workerTierKey: initialData.workerTierKey || initialData.workerId?.tierKey || initialData.priceSnapshot?.workerTierKey || '',
        addOns: (initialData.addOns || []).map(a => a._id || a),
        time: initialData.time?.slice(0, 5) || ''
      };
      setForm(normalized);

    } else if (isOpen) {
      resetForm();
    }
  }, [isOpen, initialData]);

   useEffect(() => {
    const requestId = ++availabilityRequestRef.current;
    let cancelled = false;

    const fetchAvailability = async () => {
      if (!form.date || !form.serviceId || !storeHours.length) {
        if (!cancelled && requestId === availabilityRequestRef.current) setAvailableTimes([]);
        return;
      }

      const dateObj = new Date(`${form.date}T12:00:00`);
      if (Number.isNaN(dateObj.getTime())) return;

      const selectedDay = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
      const storeDay = storeHours.find((h) => h.day === selectedDay);
      const duration = Math.max(1, Number(form.duration || 60));

      try {
        const params = {
          date: form.date,
          serviceId: form.serviceId,
          duration,
          ...(form.workerId ? { workerId: form.workerId } : {}),
          ...(initialData?._id ? { excludeId: initialData._id } : {}),
        };

        const [statusResponse, availabilityResponse] = await Promise.all([
          API.get('/availability/status', { params: { date: form.date } }),
          API.get('/availability', { params }),
        ]);

        if (cancelled || requestId !== availabilityRequestRef.current) return;

        const dateStatus = statusResponse?.data || null;
        setCalendarStatus(dateStatus);
        const backendRows = Array.isArray(availabilityResponse?.data) ? availabilityResponse.data : [];
        const backendByTime = new Map(backendRows.map((row) => [String(row.time).slice(0, 5), row]));

        let openMin = null;
        let closeMin = null;
        if (!dateStatus?.storeClosed) {
          if (dateStatus?.hasSpecialHours && dateStatus.open && dateStatus.close) {
            openMin = toMinutes(dateStatus.open);
            closeMin = toMinutes(dateStatus.close);
          } else if (storeDay && !storeDay.closed && storeDay.open && storeDay.close) {
            openMin = toMinutes(storeDay.open);
            closeMin = toMinutes(storeDay.close);
          }
        }

        const DAY_START_MIN = 6 * 60;
        const DAY_END_MIN = 21 * 60;
        const times = [];
        for (let min = DAY_START_MIN; min + duration <= DAY_END_MIN; min += 15) {
          const time = `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
          const backend = backendByTime.get(time);
          const inStoreHours = openMin !== null && closeMin !== null && min >= openMin && min + duration <= closeMin;
          times.push({
            time,
            status: backend?.status || 'closed',
            reason: backend?.reason || '',
            inStoreHours,
          });
        }

        setAvailableTimes(times);
      } catch (err) {
        if (cancelled || requestId !== availabilityRequestRef.current) return;
        console.error('Failed to fetch availability:', err);
        setAvailableTimes([]);
      }
    };

    fetchAvailability();
    return () => { cancelled = true; };
  }, [form.date, form.serviceId, form.workerId, form.duration, storeHours, initialData?._id]);



  const fetchClients = async () => {
    const { data } = await API.get('/admin/clients');
    setClients(data);
  };

  const fetchServices = async () => {
    const { data } = await API.get('/admin/services');
    setServices(data);
  };

  useEffect(() => {
    if (!form.serviceId) {
      setWorkers([]);
      return;
    }

    let cancelled = false;
    const fetchWorkersForService = async () => {
      try {
        setWorkersLoading(true);
        const { data } = await API.get('/admin/workers', {
          params: { serviceId: form.serviceId, active: true },
        });
        if (cancelled) return;
        const list = data?.workers || data || [];
        setWorkers(list);

        setForm((prev) => {
          if (prev.serviceId !== form.serviceId) return prev;
          const assignedId = isNewAppointment ? idOf((matchedClient || clients.find((c) => idOf(c) === idOf(prev.clientId)))?.assignedStylistId) : '';
          const assignedWorker = assignedId ? list.find((worker) => idOf(worker) === assignedId) : null;
          const existing = list.find((worker) => idOf(worker) === idOf(prev.workerId));
          const nextWorker = assignedWorker || existing || (list.length === 1 ? list[0] : null);
          if (!nextWorker) {
            return { ...prev, workerId: '', workerTierKey: '' };
          }
          const assignment = getWorkerAssignment(nextWorker, prev.serviceId);
          const baseDuration = Number(assignment?.duration || prev.duration || 60);
          const addOnDuration = calcAddOnDuration(suggestedAddOns, prev.addOns);
          if (assignedWorker) {
            setStylistSwitchRequest(null);
            setTimeout(() => showDefaultStylistNotice(matchedClient || clients.find((c) => idOf(c) === idOf(prev.clientId)), assignedWorker), 0);
          }
          return {
            ...prev,
            workerId: idOf(nextWorker),
            workerTierKey: nextWorker.tierKey || '',
            duration: baseDuration + addOnDuration,
          };
        });
      } catch (err) {
        console.error('Failed to fetch workers for service', err);
        if (!cancelled) setWorkers([]);
      } finally {
        if (!cancelled) setWorkersLoading(false);
      }
    };

    fetchWorkersForService();
    return () => { cancelled = true; };
  }, [form.serviceId, form.clientId, matchedClient, clients, suggestedAddOns, isNewAppointment]);

 const handleChange = (e) => {
  const { name, value } = e.target;

  if (isNewAppointment && name === 'workerId') {
    const switchReq = buildStylistSwitchRequest(value);
    setStylistSwitchRequest(switchReq);
    if (switchReq) {
      toast.info(
        switchReq.pendingForReceivingStylist
          ? `This will be booked as pending until ${switchReq.requestedWorkerName} confirms their schedule.`
          : switchReq.ownerStylistWillBeNotified
            ? `${switchReq.requestedWorkerName} will be used for this one appointment. ${switchReq.fromWorkerName} will be notified. Client ownership will not change.`
            : `${switchReq.requestedWorkerName} will be used for this one appointment. Client ownership stays with ${switchReq.fromWorkerName}.`
      );
    }
  } else if (isNewAppointment && name === 'serviceId') {
    setStylistSwitchRequest(null);
  }

  setForm((prev) => {
    const isServiceChange = name === 'serviceId';
    const isDateChange = name === 'date';
    const isWorkerChange = name === 'workerId';
    const selectedService = isServiceChange ? services.find((s) => idOf(s) === value) : services.find((s) => idOf(s) === prev.serviceId);
    const selectedWorker = isWorkerChange ? workers.find((w) => idOf(w) === value) : workers.find((w) => idOf(w) === idOf(prev.workerId));
    const selectedAssignment = getWorkerAssignment(selectedWorker, isServiceChange ? value : prev.serviceId);
    const baseDuration = Number(selectedAssignment?.duration || selectedService?.duration || prev.duration || 60);
    const addOnDuration = calcAddOnDuration(suggestedAddOns, prev.addOns);


    return {
      ...prev,
      [name]: value,
      time: isServiceChange || isDateChange || isWorkerChange ? '' : prev.time,
      workerId: isServiceChange ? '' : (isWorkerChange ? value : prev.workerId),
      workerTierKey: isServiceChange ? '' : (isWorkerChange ? (selectedWorker?.tierKey || '') : prev.workerTierKey),
      duration: isServiceChange || isWorkerChange ? baseDuration + addOnDuration : prev.duration,
      service: isServiceChange ? selectedService?.name || prev.service : prev.service,
    };
  });
};

// Run closed-day confirm only after user actually picked a date (onBlur), not on month nav
const confirmClosedIfNeeded = (dateStr) => {
  if (!dateStr || !storeHours.length) return;
  const selectedDate = new Date(dateStr + 'T12:00:00');
  if (isNaN(selectedDate)) return;
  const selectedDay = selectedDate.toLocaleDateString('en-US', { weekday: 'long' });
  const storeDay = storeHours.find(h => h.day === selectedDay);
  if (storeDay?.closed) {
    const ok = window.confirm(`${selectedDay} is marked as closed. Continue anyway?`);
    if (!ok) {
      // revert to previous accepted value
      setForm(prev => ({ ...prev, date: prevDateRef.current, time: '' }));
      return;
    }
  }
  // accept this date going forward
  prevDateRef.current = dateStr;
};

const handlePhoneSearch = async () => {
   if (loading.find) return;

    const normalizedPhone = normalizePhone10(phoneSearch);
    if (!isTenDigit(normalizedPhone)) {
      toast.error("Please enter a valid 10-digit phone number.");
      return;
    }

   try {
     setLoading(l => ({ ...l, find:true }));
     setError('');

     // Always ask the backend. The local clients list can be stale or still loading
     // when the admin opens the appointment modal, which caused false "not selected" states.
     const adminUser = getAdminUser();
     const requestedWorkerId = form.workerId || adminUser?.workerId || '';
     const { data } = await API.get('/admin/clients', {
       params: { phone: normalizedPhone, ...(requestedWorkerId ? { requestedWorkerId } : {}) }
     });

     const match = Array.isArray(data) ? data[0] : data;

     if (match?._id) {
       setClients(prev => {
         const exists = prev.some(c => c._id === match._id);
         return exists ? prev.map(c => (c._id === match._id ? match : c)) : [match, ...prev];
       });
       setForm(prev => ({ ...prev, clientId: match._id }));
       setMatchedClient(match);
          setStylistSwitchRequest(null);
       setAddingClient(false);
       setNewClientErrors({});
       toast.success("Client found and selected.");
     } else {
       setForm(prev => ({ ...prev, clientId: '' }));
       setMatchedClient(null);
          setStylistSwitchRequest(null);
       if (window.confirm("Client not found. Create a new client profile?")) {
         setNewClient(prev => ({ ...prev, phone: normalizedPhone }));
         setAddingClient(true);
         setNewClientErrors({});
       } else {
         setAddingClient(false);
         toast.info("No client selected.");
       }
     }
   } catch (err) {
     console.error('Client lookup failed:', err);
     const data = err?.response?.data || {};
     if (err?.response?.status === 409 && data.code === 'CLIENT_ASSIGNED_TO_OTHER_STYLIST' && data.client?._id) {
       const client = data.client;
       setClients(prev => prev.some(c => idOf(c) === idOf(client)) ? prev : [client, ...prev]);
       setForm(prev => ({ ...prev, clientId: client._id }));
       setMatchedClient(client);
       setAddingClient(false);
       toast.info('Existing client selected. This booking can continue as a one-time appointment; ownership will not change.');
       return;
     }
     toast.error(data.error || 'Failed to check client phone. Please try again.');
   } finally {
     setLoading(l => ({ ...l, find:false }));
   }
  };

  const handleAddOnToggle = (addOnId) => {
    setForm(prev => {
      const exists = prev.addOns.includes(addOnId);
      const updatedAddOns = exists
        ? prev.addOns.filter(id => id !== addOnId)
        : [...prev.addOns, addOnId];

      const totalAddOnDuration = suggestedAddOns
        .filter(a => updatedAddOns.includes(a._id))
        .reduce((sum, a) => sum + (a.duration || 0), 0);

      const worker = workers.find((w) => idOf(w) === idOf(prev.workerId));
      const assignment = getWorkerAssignment(worker, prev.serviceId);
      const baseDuration = Number(assignment?.duration || services.find(s => s._id === prev.serviceId)?.duration || 60);

      return { ...prev, addOns: updatedAddOns, duration: baseDuration + totalAddOnDuration };
    });
  };

const toMinutes = (t) => {
  if (!t) return 0;
  const s = String(t).trim();

  // Supports "HH:MM", "HH:MM:SS", "H:MM AM/PM"
  const ampm = s.match(/^(\d{1,2}):(\d{2})(?::\d{2})?\s*(AM|PM)?$/i);
  if (ampm) {
    let hour = parseInt(ampm[1], 10);
    const minute = parseInt(ampm[2], 10);
    const period = ampm[3]?.toUpperCase();

    if (period === 'PM' && hour !== 12) hour += 12;
    if (period === 'AM' && hour === 12) hour = 0;

    return hour * 60 + minute;
  }

  // Fallback
  const [h, m] = s.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
};



  const addCurrentAppointmentToGroup = () => {
    setError('');
    const usingGuest = groupMode && groupRowMode === 'guest';
    if ((!form.clientId && !usingGuest) || !form.serviceId || !form.date || !form.time || !form.workerId) {
      setError(usingGuest
        ? 'Complete guest name, service, stylist, date, and time before adding this row to the group.'
        : 'Complete client, service, stylist, date, and time before adding this row to the group.');
      return;
    }
    if (usingGuest && !eventGuest.firstName.trim()) {
      setError('Quick-added event guest needs at least a first name.');
      return;
    }
    const clientObj = selectedClient || clients.find((c) => idOf(c) === idOf(form.clientId));
    const serviceObj = services.find((svc) => idOf(svc) === idOf(form.serviceId));
    const workerObj = workers.find((w) => idOf(w) === idOf(form.workerId));
    const guestName = [eventGuest.firstName, eventGuest.lastName].filter(Boolean).join(' ').trim();
    const row = {
      ...form,
      ...(usingGuest ? { clientId: '', guestClient: { ...eventGuest }, participantStatus: 'event_guest' } : {}),
      participant: {
        participantRole: usingGuest ? eventGuest.role : '',
        participantNotes: usingGuest ? eventGuest.notes : '',
      },
      status: isStylistBookingAnotherStylist ? 'pending' : (form.status || 'booked'),
      _clientName: usingGuest ? `${guestName} (event guest)` : ([clientObj?.firstName, clientObj?.lastName].filter(Boolean).join(' ') || 'Selected client'),
      _serviceName: serviceObj?.name || form.service || 'Selected service',
      _workerName: workerObj ? getWorkerDisplayName(workerObj) : 'Selected stylist',
      _participantRole: usingGuest ? eventGuest.role : '',
    };
    setGroupItems((prev) => [...prev, row]);
    setForm((prev) => ({
      ...prev,
      clientId: '',
      serviceId: '',
      workerId: '',
      workerTierKey: '',
      time: '',
      duration: 60,
      addOns: [],
    }));
    setMatchedClient(null);
    setPhoneSearch('');
    setGroupRowMode('existing');
    setEventGuest({ firstName: '', lastName: '', phone: '', role: '', notes: '' });
    setSuggestedAddOns([]);
    setShowAddOnPrompt(false);
    setStylistSwitchRequest(null);
    toast.success('Appointment row added to group. Add the next client/service or save the group.');
  };

  const removeGroupItem = (index) => {
    setGroupItems((prev) => prev.filter((_, i) => i !== index));
  };

 const handleNewClientSubmit = async () => {
   if (loading.addClient) return;

   const errors = {};
   if (!newClient.firstName?.trim()) errors.firstName = true;
   if (!newClient.lastName?.trim()) errors.lastName = true;
   if (!isTenDigit(newClient.phone)) errors.phone = true;

   setNewClientErrors(errors);

   if (errors.phone) {
      toast.error("Phone number must be 10 digits.");
      return;
    }
    if (errors.firstName || errors.lastName) {
      toast.error("First and last name are required.");
      return;
    }

    const normalizedPhone = normalizePhone10(newClient.phone);
    if (clients.find(c => normalizePhone10(c.phone) === normalizedPhone)) {
      setDuplicatePhone(true);
      setNewClientErrors({ phone: true });
      toast.error("Client with this phone number already exists.");
      return;
    }
    try {

      const payload = {
        firstName: newClient.firstName.trim(),
        lastName: newClient.lastName.trim(),
        phone: normalizedPhone,
      };
      if (newClient.email?.trim()) {
        payload.email = newClient.email.trim();
      }
     setLoading(l => ({ ...l, addClient:true }));

      const res = await API.post('/admin/clients', payload);
      const createdClient = res?.data || payload;
      await fetchClients();
      setAddingClient(false);
      setMatchedClient(createdClient);
      setPhoneSearch(createdClient.phone || normalizedPhone);
      setNewClientErrors({});
      setError('');
      toast.success("New client added and selected.");
      setForm(prev => ({ ...prev, clientId: createdClient._id || prev.clientId }));
    } catch (err) {
      console.error("❌ Client creation failed:", err);
      const existingClient = err?.response?.data?.existingClient;
      if (err?.response?.status === 409 && existingClient?._id) {
        await fetchClients();
        setAddingClient(false);
        setMatchedClient(existingClient);
        setPhoneSearch(existingClient.phone || normalizedPhone);
        setDuplicatePhone(true);
        setNewClientErrors({});
        setError('That phone already belongs to an existing client, so the existing client was selected.');
        toast.info('Existing client selected.');
        setForm(prev => ({ ...prev, clientId: existingClient._id }));
        return;
      }
      setError(err?.response?.data?.error || 'Failed to add new client.');
       } finally {
        setLoading(l => ({ ...l, addClient:false }));
       }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (loading.save) return; // guard
    if (groupMode && groupItems.length >= 2) {
      try {
        setLoading(l => ({ ...l, save:true }));
        await onSave({ groupBooking: true, group: groupInfo, appointments: groupItems });
        resetForm();
        onClose();
      } catch (err) {
        const data = err?.response?.data || {};
        setError(data.error || 'Failed to save group booking.');
      } finally {
        setLoading(l => ({ ...l, save:false }));
      }
      return;
    }

    if (groupMode) {
      setError(groupItems.length === 0
        ? 'Add at least two appointment rows before saving a group booking. Use “Add this row” after completing each client/service.'
        : 'Group booking needs at least two appointment rows. Add another row or turn off group booking.');
      return;
    }

    if (!form.clientId || !form.serviceId || !form.date || !form.time) {
      setError('Please complete all required fields.');
      return;
    }
    if (isNewAppointment && form.workerId) {
      setStylistSwitchRequest(buildStylistSwitchRequest(form.workerId));
    }
    if (workers.length > 0 && !form.workerId) {
      setError('Please select a stylist/worker for this appointment.');
      return;
    }
    try {
     setLoading(l => ({ ...l, save:true }));
      const submitPayload = { ...form, status: isStylistBookingAnotherStylist ? 'pending' : (form.status || 'booked') };
      await onSave(submitPayload);
      resetForm();
      onClose();
    } catch (err) {
      const data = err?.response?.data || {};
      if (data.code === 'CLIENT_ASSIGNED_TO_OTHER_STYLIST') {
        setError(data.error || 'Unable to save this one-time booking. Please check the selected stylist and try again.');
      } else {
        setError(err.response?.status === 409 ? 'That time slot is already booked. Please choose another.' : (data.error || 'Failed to save appointment.'));
      }
     } finally {
     setLoading(l => ({ ...l, save:false }));}
  };

  const handleCancel = () => {
    resetForm();
    onClose();
  };

  const selectedService = services.find((s) => s._id === form.serviceId);
  useEffect(() => {
    if (effectiveSingleStylist && workers.length === 1 && !form.workerId) {
      setForm((current) => ({ ...current, workerId: idOf(workers[0]) }));
    }
  }, [effectiveSingleStylist, workers, form.workerId]);

  const selectedWorker = workers.find((w) => idOf(w) === idOf(form.workerId));
  const selectedAssignment = getWorkerAssignment(selectedWorker, form.serviceId);
  const selectedSpecialDeal = shouldShowWorkerPromotion ? getSpecialDealForService(selectedService, promotionConfig) : null;
  const selectedDateQualifiesForSpecial = selectedSpecialDeal && doesDateQualifyForDeal(form.date, selectedSpecialDeal);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded p-6 w-full max-w-lg shadow-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">{initialData ? 'Edit' : 'Add'} Appointment</h2>
        {error && <p className="text-red-600 mb-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          {!initialData && (
            <div className="rounded border border-purple-200 bg-purple-50 p-3 text-sm text-purple-900">
              <label className="flex items-center gap-2 font-semibold">
                <input
                  type="checkbox"
                  checked={groupMode}
                  onChange={(e) => {
                    setGroupMode(e.target.checked);
                    if (!e.target.checked) setGroupItems([]);
                  }}
                />
                Phone / desk coordinated group booking
              </label>
              <p className="mt-1 text-xs">
                Use this only when staff has already talked with the client and coordinated multiple clients or group services. Online clients are still directed to call.
              </p>
              {groupMode && (
                <div className="mt-3 grid gap-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      value={groupInfo.groupType}
                      onChange={(e) => setGroupInfo(prev => ({ ...prev, groupType: e.target.value }))}
                      className="border p-2 bg-white"
                    >
                      <option value="family">Family / household</option>
                      <option value="caregiver">Caregiver / elderly</option>
                      <option value="nursing_home">Nursing home</option>
                      <option value="wedding">Wedding party</option>
                      <option value="event">Event group</option>
                      <option value="other">Other</option>
                    </select>
                    <input
                      placeholder="Group label, e.g. Smith family"
                      value={groupInfo.groupLabel}
                      onChange={(e) => setGroupInfo(prev => ({ ...prev, groupLabel: e.target.value }))}
                      className="border p-2 bg-white"
                    />
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <input
                      placeholder="Booking contact name"
                      value={groupInfo.bookedByContactName}
                      onChange={(e) => setGroupInfo(prev => ({ ...prev, bookedByContactName: e.target.value }))}
                      className="border p-2 bg-white"
                    />
                    <input
                      placeholder="Booking contact phone"
                      value={groupInfo.bookedByContactPhone}
                      onChange={(e) => setGroupInfo(prev => ({ ...prev, bookedByContactPhone: coercePhone10(e.target.value) }))}
                      className="border p-2 bg-white"
                    />
                  </div>
                  <textarea
                    placeholder="Coordination notes, ready-by time, special care, same vehicle, etc."
                    value={groupInfo.coordinationNotes}
                    onChange={(e) => setGroupInfo(prev => ({ ...prev, coordinationNotes: e.target.value }))}
                    className="border p-2 bg-white min-h-[70px]"
                  />
                </div>
              )}
            </div>
          )}
          {initialData ? (
            <p className="text-gray-700 font-medium mb-2">
		Client: {(initialData.clientId?.firstName || '') + ' ' + (initialData.clientId?.lastName || '') || 'N/A'}
            </p>
          ) : !addingClient ? (
            <>
              {groupMode && (
                <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm">
                  <p className="font-semibold mb-2">This group row is for:</p>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="groupRowMode"
                        checked={groupRowMode === 'existing'}
                        onChange={() => setGroupRowMode('existing')}
                      />
                      Existing client
                    </label>
                    <label className="flex items-center gap-2">
                      <input
                        type="radio"
                        name="groupRowMode"
                        checked={groupRowMode === 'guest'}
                        onChange={() => {
                          setGroupRowMode('guest');
                          setMatchedClient(null);
                          setPhoneSearch('');
                          setForm(prev => ({ ...prev, clientId: '' }));
                        }}
                      />
                      Quick-add event guest
                    </label>
                  </div>
                  {groupRowMode === 'guest' && (
                    <div className="mt-3 grid gap-2">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          placeholder="Guest first name"
                          value={eventGuest.firstName}
                          onChange={(e) => setEventGuest(prev => ({ ...prev, firstName: e.target.value }))}
                          className="border p-2 bg-white"
                        />
                        <input
                          placeholder="Guest last name (optional)"
                          value={eventGuest.lastName}
                          onChange={(e) => setEventGuest(prev => ({ ...prev, lastName: e.target.value }))}
                          className="border p-2 bg-white"
                        />
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <input
                          placeholder="Guest phone (optional)"
                          value={eventGuest.phone}
                          onChange={(e) => setEventGuest(prev => ({ ...prev, phone: coercePhone10(e.target.value) }))}
                          className="border p-2 bg-white"
                        />
                        <input
                          placeholder="Role, e.g. bride, bridesmaid"
                          value={eventGuest.role}
                          onChange={(e) => setEventGuest(prev => ({ ...prev, role: e.target.value }))}
                          className="border p-2 bg-white"
                        />
                      </div>
                      <textarea
                        placeholder="Guest notes (optional)"
                        value={eventGuest.notes}
                        onChange={(e) => setEventGuest(prev => ({ ...prev, notes: e.target.value }))}
                        className="border p-2 bg-white min-h-[60px]"
                      />
                      <p className="text-xs text-gray-600">Guests are saved as event-only clients first. Staff can convert them to full clients later if they return.</p>
                    </div>
                  )}
                </div>
              )}
              {(!groupMode || groupRowMode === 'existing') && (
              <div className="flex gap-2">
                <input
                  ref={phoneInputRef}
                  placeholder="Search by Phone"
                  value={phoneSearch}
                  onChange={e => {
                    const nextPhone = coercePhone10(e.target.value);
                    setPhoneSearch(nextPhone);
                    if (matchedClient && normalizePhone10(matchedClient.phone) !== normalizePhone10(nextPhone)) {
                      setMatchedClient(null);
                                        setStylistSwitchRequest(null);
                      setForm(prev => ({ ...prev, clientId: '' }));
                    }
                  }}
  className="w-full border p-2"

                />
                <button
                  type="button"
                  onClick={handlePhoneSearch}
                  disabled={loading.find || !isTenDigit(phoneSearch)}
                  className={`bg-blue-500 text-white px-4 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2`}>
                  {loading.find && <Spinner />}
                  {loading.find ? 'Finding…' : 'Find'}
                </button>
              </div>
              )}
              {(!groupMode || groupRowMode === 'existing') && matchedClient && (
<p className="text-green-700 text-sm ml-1">
  Client Name:{' '}
  {([matchedClient.firstName, matchedClient.lastName].filter(Boolean).join(' ') || 'N/A')}
  {matchedClient.nickname && (
    <span className="ml-1 text-gray-500 italic">
      ({matchedClient.nickname})
    </span>
  )}
</p>

              )}
              {isNewAppointment && assignedStylistId && selectedWorkerMatchesDefault && (
                <div className="mt-2 rounded border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
                  <p className="font-semibold">Default stylist auto-selected</p>
                  <p>{assignedStylistName || 'The client’s default stylist'} is this client’s stylist. You may choose another stylist for this appointment; client ownership will not change.</p>
                </div>
              )}
              {isNewAppointment && assignedStylistId && selectedWorkerDiffersFromDefault && !stylistSwitchRequest && (
                <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">One-time stylist selected</p>
                  <p>
                    {defaultStylistAvailableForSelectedService
                      ? `${assignedStylistName || 'The client’s default stylist'} is this client’s stylist, but this appointment will be booked with the selected stylist only. Client ownership will not change.`
                      : `${assignedStylistName || 'The client’s default stylist'} is this client’s stylist, but is not assigned to this service. This appointment will be booked with the selected stylist only. Client ownership will not change.`}
                  </p>
                </div>
              )}
              {stylistSwitchRequest && (
                <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900">
                  <p className="font-semibold">
                    {stylistSwitchRequest.pendingForReceivingStylist ? 'Pending stylist confirmation' : stylistSwitchRequest.ownerStylistWillBeNotified ? 'One-time booking — owner notified' : 'One-time stylist change'}
                  </p>
                  <p>
                    {stylistSwitchRequest.pendingForReceivingStylist
                      ? `This appointment will be saved as pending until ${stylistSwitchRequest.requestedWorkerName} confirms their schedule.`
                      : stylistSwitchRequest.ownerStylistWillBeNotified
                        ? `${stylistSwitchRequest.requestedWorkerName} will be used for this appointment only. ${stylistSwitchRequest.fromWorkerName} will be notified, and client ownership will not change.`
                        : `${stylistSwitchRequest.requestedWorkerName} will be used for this appointment only. Client ownership stays with ${stylistSwitchRequest.fromWorkerName}.`}
                  </p>
                </div>
              )}
            </>
          ) : (
            <div className="space-y-2">
 <input
   name="firstName"
   type="text"
   autoComplete="given-name"
   placeholder="First Name"
   value={newClient.firstName}
   onChange={e => {
     setNewClient({ ...newClient, firstName: e.target.value });
     if (newClientErrors.firstName) setNewClientErrors(prev => ({ ...prev, firstName: false }));
   }}
    className={`w-full border p-2 ${newClientErrors.firstName ? 'bg-yellow-100 border-yellow-400' : ''}`}
 />

 <input
   name="lastName"
   type="text"
   autoComplete="family-name"
   placeholder="Last Name"
   value={newClient.lastName}
   onChange={e => {
     setNewClient({ ...newClient, lastName: e.target.value });
     if (newClientErrors.lastName) setNewClientErrors(prev => ({ ...prev, lastName: false }));
   }}
   className={`w-full border p-2 ${newClientErrors.lastName ? 'bg-yellow-100 border-yellow-400' : ''}`}
/>
 <input
   name="phone"
   type="tel"
   inputMode="numeric"
   autoComplete="tel"
   placeholder="Phone"
   value={newClient.phone}
   onChange={e => {
     setNewClient({ ...newClient, phone: coercePhone10(e.target.value) });
     if (newClientErrors.phone) setNewClientErrors(prev => ({ ...prev, phone: false }));
   }}
   className={`w-full border p-2 ${newClientErrors.phone ? 'bg-yellow-100 border-yellow-400' : ''}`}
 />
   <input className="w-full border p-2" placeholder="Email (optional)" value={newClient.email} 
                onChange={e => setNewClient({ ...newClient, email: e.target.value })} />
              <div className="flex gap-2">
   <button
     type="button"
     onClick={handleNewClientSubmit}
     disabled={loading.addClient}
     className="bg-green-600 text-white px-4 py-2 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
   >
     {loading.addClient && <Spinner />}
     {loading.addClient ? 'Saving…' : 'Save Client'}
   </button>
                <button
                  type="button"
                  className="border px-4 py-2"
                  onClick={() => {
                    setAddingClient(false);
                    setNewClientErrors({});
                    setError('');
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block font-medium">Select Service</label>
            <select name="serviceId" value={form.serviceId} onChange={handleChange} required className="w-full border p-2">
              <option value="">Service</option>
              {services.map(s => {
                const specialDeal = shouldShowWorkerPromotion ? getSpecialDealForService(s, promotionConfig) : null;
                return (
                  <option key={s._id} value={s._id}>
                    {s.name}{specialDeal ? ` — ${specialDeal.shortLabel || specialDeal.appointmentLabel || 'Special'}` : ''}
                  </option>
                );
              })}
            </select>
            {selectedSpecialDeal && (
              <div
                className={`mt-2 rounded border p-2 text-xs ${
                  selectedDateQualifiesForSpecial
                    ? 'border-amber-300 bg-amber-50 text-amber-800'
                    : 'border-gray-200 bg-gray-50 text-gray-600'
                }`}
              >
                {selectedDateQualifiesForSpecial
                  ? getDealQualifiedText(selectedSpecialDeal)
                  : `This is a promotion service. ${getDealAppliesOnlyText(selectedSpecialDeal)}`}
              </div>
            )}
          </div>

          {form.serviceId && !effectiveSingleStylist && (
            <div>
              <label className="block font-medium">Stylist / Worker</label>
              <select
                name="workerId"
                value={form.workerId || ''}
                onChange={handleChange}
                disabled={workersLoading}
                className={`w-full border p-2 ${workers.length > 0 && !form.workerId ? 'bg-yellow-50 border-yellow-300' : ''}`}
              >
                <option value="">{workersLoading ? 'Loading stylists…' : 'Select stylist'}</option>
                {workers.map((worker) => {
                  const assignment = getWorkerAssignment(worker, form.serviceId);
                  return (
                    <option key={worker._id} value={worker._id}>
                      {getWorkerDisplayName(worker)} — {worker.title || worker.tierKey || 'Stylist'} — ${Number(assignment?.price || 0).toFixed(2)} · {assignment?.duration || selectedService?.duration || form.duration} min
                    </option>
                  );
                })}
              </select>
              {form.workerId && selectedWorker && (
                <div className="mt-2 rounded border bg-gray-50 p-2 text-xs text-gray-700">
                  <strong>{getWorkerDisplayName(selectedWorker)}</strong>
                  {selectedWorker.title ? ` · ${selectedWorker.title}` : ''}
                  {selectedAssignment?.price != null ? ` · $${Number(selectedAssignment.price).toFixed(2)}` : ''}
                  {selectedAssignment?.duration ? ` · ${selectedAssignment.duration} min` : ''}
                </div>
              )}
              {!workersLoading && form.serviceId && workers.length === 0 && (
                <p className="mt-1 text-xs text-yellow-700">No active worker pricing is assigned to this service yet. The backend will use the default Rakeb migration if available.</p>
              )}
            </div>
          )}
<div className="mb-4">
  <label htmlFor="date" className="block font-medium leading-none">
    Select Date
  </label>          
	<input 
	type="date" name="date" value={form.date} onChange={handleChange} onBlur={() => confirmClosedIfNeeded(form.date)} required  className={`w-full border p-2 ${error && !form.date ? 'bg-yellow-100 border-yellow-400' : ''}`}
/></div>


{form.date && form.serviceId && (
<>
  {calendarStatus?.storeClosed && (
    <div className="mb-2 rounded bg-red-50 p-2 text-sm text-red-700">
      {calendarStatus.customerMessage || 'Store is closed on this date. Admin can still review the day, but should not book unless overriding intentionally.'}
    </div>
  )}
  {calendarStatus?.onlineBookingOff && !calendarStatus?.storeClosed && (
    <div className="mb-2 rounded bg-yellow-50 p-2 text-sm text-yellow-800">
      {calendarStatus.customerMessage || 'Online booking is off for this date. Staff can still book manually.'}
    </div>
  )}
<div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-x-1 sm:gap-y-0">
    {availableTimes.map(({ time, status, inStoreHours }) => {
      const slotMin = toMinutes(time);
      const selectionStart = form.time ? toMinutes(form.time) : null;
      const selectionEnd = selectionStart !== null ? selectionStart + (form.duration || 0) : null;
      const isInSelection = selectionStart !== null && slotMin >= selectionStart && slotMin < selectionEnd;

      let bgClass = '';

      if (status === 'overbooked') {
        bgClass = 'bg-pink-300 text-gray-900';
      } else if (status === 'booked' || status === 'blocked') {
        bgClass = 'bg-yellow-300 text-gray-900 cursor-not-allowed';
      } else if (status === 'closed') {
        bgClass = inStoreHours ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-green-50 hover:bg-green-100 text-gray-800';
      } else if (isInSelection) {
        // current selection window → stronger green
        bgClass = 'bg-green-200 text-gray-900';
      } else if (inStoreHours) {
        // inside store hours → normal green as today
        bgClass = 'bg-green-100 hover:bg-green-200';
      } else {
        // outside store hours → lighter grayish green but still clickable
        bgClass = 'bg-green-50 hover:bg-green-100 text-gray-800';
      }

      return (
        <button
  key={time}
  type="button"
  onClick={() => {
    if (status === 'free' || (status === 'closed' && !inStoreHours)) {
      setForm(prev => ({ ...prev, time }));
    }
  }}
  disabled={status === 'booked' || status === 'blocked' || (status === 'closed' && inStoreHours)}
  title={status === 'blocked' ? 'Unavailable' : status === 'booked' ? 'Conflicts with an active appointment' : ''}
  className={`
    m-0 w-full rounded border
    px-2 py-2 text-sm leading-tight
    sm:px-1 sm:py-0 sm:text-[11px] sm:leading-none
    ${bgClass}
  `}
>
  {formatTime(time)}
</button>

      );
    })}
  </div>
</>
)}


          <label className="block font-medium leading-none mb-2">
  Service duration: {form.duration} minutes
</label>

          {showAddOnPrompt && suggestedAddOns.length > 0 && (
            <div className="border p-3 rounded bg-gray-50 shadow-inner">
              <h4 className="font-semibold text-sm mb-2">Suggested Add-ons</h4>
              <div className="grid grid-cols-2 gap-2">
                {suggestedAddOns.map(a => (
                  <label key={a._id} className="text-sm flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={form.addOns.includes(a._id)}
                      onChange={() => handleAddOnToggle(a._id)}
                    />
                    {a.name} ({a.duration} min)
                  </label>
                ))}
              </div>
            </div>
          )}

          {groupMode && !initialData && (
            <div className="rounded border bg-gray-50 p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div>
                  <p className="font-semibold text-sm">Group booking rows</p>
                  <p className="text-xs text-gray-600">Add each coordinated client/service row, then save the group.</p>
                </div>
                <button
                  type="button"
                  onClick={addCurrentAppointmentToGroup}
                  className="px-3 py-2 rounded bg-purple-600 text-white text-sm"
                >
                  Add this row
                </button>
              </div>
              {groupItems.length === 0 ? (
                <p className="text-xs text-gray-500">No group rows added yet.</p>
              ) : (
                <div className="space-y-2">
                  {groupItems.map((item, index) => (
                    <div key={`${item.clientId}-${item.serviceId}-${item.date}-${item.time}-${index}`} className="flex items-start justify-between gap-2 rounded border bg-white p-2 text-xs">
                      <div>
                        <p className="font-semibold">{index + 1}. {item._clientName}{item._participantRole ? ` · ${item._participantRole}` : ''}</p>
                        <p>{item._serviceName} · {item._workerName}</p>
                        <p>{item.date} at {formatTime(item.time)} · {item.duration} min</p>
                      </div>
                      <button type="button" onClick={() => removeGroupItem(index)} className="text-red-600 underline">Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2 pb-2">
            <button type="button" onClick={handleCancel} className="px-4 py-2 border">Cancel</button>
   <button
     type="submit"
     disabled={loading.save}
     className="px-4 py-2 bg-blue-600 text-white disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
   >
     {loading.save && <Spinner />}
     {loading.save ? 'Saving…' : (groupMode ? 'Save Group' : 'Save')}
   </button>          </div>
        </form>
      </div>
    </div>
  );
}
