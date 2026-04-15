// Finalized ServiceSelector.jsx with frozen top banner and preserved layout
import React, { useState, useEffect, useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import dayGridPlugin from '@fullcalendar/daygrid';
import interactionPlugin from '@fullcalendar/interaction';
import API from '../api';
import { toast } from 'react-toastify';
import logo from '../assets/TheRSlogo.png';


export default function ServiceSelector({ client }) {
  const [categories, setCategories] = useState([]);
  const [services, setServices] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [selectedService, setSelectedService] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [selectedTime, setSelectedTime] = useState(null);
  const [addOns, setAddOns] = useState([]);
  const [selectedAddOns, setSelectedAddOns] = useState([]);
  const [editingAppointment, setEditingAppointment] = useState(null);
  const [showAddOnModal, setShowAddOnModal] = useState(false);
  const [storeHours, setStoreHours] = useState([]);
  const [mode, setMode] = useState('create'); // 'create' | 'edit' | 'rebook'
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    API.get('/services')
      .then(({ data }) => {
        setServices(data);
        const ordered = ['Color', 'Haircut', 'Style', 'Texturizing', 'Treatment', 'Hair-Removal', 'Add-ons'];
        const unique = [...new Set(data.map(s => s.category))];
        const sorted = ordered.filter(c => unique.includes(c));
        setCategories(sorted);
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
  const addOnIds = selectedAddOns.length
    ? selectedAddOns.map(a => a._id)
    : (baseline?.addOnIds || []);
  const clientId = effectiveClient?._id || baseline?.clientId || null;
  return { clientId, serviceId: svcId, date, time, addOnIds };
}, [selectedService, selectedDate, selectedTime, selectedAddOns, baseline, effectiveClient?._id]);

const isEdit = mode === 'edit' && !!baseline;

// “Changed” = any diff vs baseline (service/date/time/add-ons)
const changed = useMemo(() => {
  if (!isEdit || !baseline) return false;
  const sameService = baseline.serviceId === current.serviceId;
  const sameDate = baseline.date === current.date;
  const sameTime = baseline.time === current.time;
  const arrEq = (a, b) =>
    JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
  const sameAddOns = arrEq(baseline.addOnIds || [], current.addOnIds || []);
  return !(sameService && sameDate && sameTime && sameAddOns);
}, [isEdit, baseline, current]);

// Validity and button state
const hasAllRequired = !!(current.clientId && current.serviceId && current.date && current.time);
const canSubmit = isEdit ? (hasAllRequired && changed) : hasAllRequired;

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
  API.get('/admin/store-hours').then(({ data }) => setStoreHours(data));
}, []);


useEffect(() => {
  if (selectedService && selectedDate) {
    const extra = selectedAddOns.reduce((sum, a) => sum + (a.duration || 0), 0);
    const totalDuration = (selectedService.duration || 0) + extra;

   const params = { date: selectedDate, serviceId: selectedService._id, duration: totalDuration };
 if (isEdit && editingAppointment) params.excludeId = getEditingId(editingAppointment);
 API.get('/availability', { params })
      .then(({ data }) => {
        const mapped = data.map(t => ({ time: t.time, available: t.status === 'free' }));
        setAvailableTimes(mapped);
      })
      .catch(() => setAvailableTimes([]));
  }
}, [selectedService, selectedDate, selectedAddOns, isEdit, editingAppointment]);


  const handleServiceClick = async (service) => {
    setSelectedService(service);
    setSelectedDate(null);
    setSelectedTime(null);
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


const handleSubmit = async () => {
  if (isSubmitting) return;

 if (!hasAllRequired) {
   if (!current.clientId) toast.error('Missing client — please (re)identify yourself.');
   else toast.error('Please select service, date, and time.');
    return;
  }

  setIsSubmitting(true);

  try {
    // Derive service object for name/duration (fallback to baseline/service list)
    const svcObj =
      selectedService ||
      services.find(s => s._id === current.serviceId) ||
      null;

    const baseDuration = (svcObj?.duration ?? editingAppointment?.duration ?? 0);
    const extraDuration = (selectedAddOns.length ? selectedAddOns
                          : addOns.filter(a => current.addOnIds.includes(a._id)))
                          .reduce((sum, a) => sum + (a.duration || 0), 0);
    const duration = baseDuration + extraDuration;

   const payload = {      
      clientId: current.clientId,
      serviceId: current.serviceId,
      service: svcObj?.name || baseline?.serviceName || undefined,
      date: current.date,
      time: current.time,
      duration,
      addOns: current.addOnIds,
      status: 'pending',
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
  toast.error(
    'Update failed: ' +
      (err?.response?.data?.message || err?.message || 'No matching update endpoint')
  );
  setIsSubmitting(false);
}
    }
   console.log('[client post] /appointments payload =', payload);

    // Create / Rebook
    await API.post('/appointments', payload);
    // ✅ show success immediately after DB save
    toast.success('Appointment successfully saved');
    // ✅ persist and go to dashboard

    persistClientForDashboard();
    sessionStorage.removeItem('rebookAppointment');
    window.location.replace('/booking/dashboard');
  } catch (err) {
    console.error('[save error]', err?.response?.data || err?.message || err);
    toast.error('Failed to save appointment');
    setIsSubmitting(false);
  }
};

  const handleDateClick = ({ dateStr }) => {
const selectedDay = new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long' });
const storeDay = storeHours.find(h => h.day.toLowerCase() === selectedDay.toLowerCase());


  if (storeDay?.closed) {
    toast.warning('The store is closed on this day.');
    return;
  }

  const today = new Date().toISOString().split('T')[0];
   if (dateStr > maxISO) {
     toast.warning('You can book up to 3 months ahead.');
     return;
   }

  if (dateStr >= today) setSelectedDate(dateStr);
  else toast.warning('Cannot book in the past');

if (mode === 'rebook' && storeDay?.closed) {
  toast.info('That day is closed. Picking the next open day.');
  // naive next-day bump; you can enhance to scan storeHours
  const next = new Date(dateStr);
  next.setDate(next.getDate() + 1);
  setSelectedDate(next.toISOString().split('T')[0]);
}


};


const handleNotYou = () => {
  localStorage.removeItem('client');
  sessionStorage.removeItem('clientData');
  sessionStorage.removeItem('editingAppointment');
  sessionStorage.removeItem('rebookAppointment');
  window.location.href = '/booking';
};

  const today = new Date();
  const minISO = today.toISOString().split('T')[0];
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



return (
<div className="p-2 relative max-w-screen-md mx-auto">
    {tightCalendarCSS}

  <div className="p-2 relative max-w-screen-md mx-auto">
    <div className="sticky top-0 z-40 bg-white border-b py-3 px-4 shadow-sm flex flex-col gap-1">
      <div className="flex justify-between items-center">
        <div className="text-sm font-semibold text-gray-700">
          Welcome, {`${effectiveClient?.firstName || ''} ${effectiveClient?.lastName || ''}`.trim() || 'Client'}<br />
        </div>
        <img src={logo} alt="Logo" className="h-8 w-8" />
      </div>

      {/* Selected service / date / time + mode badge */}
      <div className="text-center font-medium text-sm text-gray-800">
        {selectedService?.name || 'Select a Service'}
        {selectedDate && <> → {selectedDate}</>}
        {selectedTime && <> @ {format24To12(selectedTime)}</>}
        {mode !== 'create' && (
          <span className="ml-2 inline-block text-[11px] px-2 py-[2px] rounded bg-gray-100 text-gray-600 uppercase tracking-wide">
            {mode}
          </span>
        )}
      </div>

      {editingAppointment && (
        <div className="text-center text-xs text-yellow-600">
 <span className="font-semibold">Original:</span> {editingAppointment.service} → {editingAppointment.date} @ {format24To12(editingAppointment.time)}
        </div>
      )}

      </div>

      {showAddOnModal && (
        <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
          <div className="bg-white p-6 rounded shadow-md w-full max-w-md">
            <h2 className="text-lg font-bold mb-2">Suggested Add-ons</h2>
            <div className="flex flex-wrap gap-2 mb-4">
              {addOns.map(add => (
                <label key={add._id} className="text-sm">
                  <input
                    type="checkbox"
                    className="mr-1"
                    checked={selectedAddOns.includes(add)}
                    onChange={() => {
                      setSelectedAddOns(prev => prev.includes(add)
                        ? prev.filter(a => a !== add)
                        : [...prev, add]
                      );
                    }}
                  />
                  {add.name}
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
                setSelectedService(null);
                setSelectedTime(null);
              }}
            >{cat}</button>
          ))}
        </div>

        <div className="flex flex-col gap-2 w-max">
          <div className="text-sm font-semibold">Services</div>
          {services.filter(s => s.category === selectedCategory).map(service => (
            <button
              key={service._id}
              className={`px-2 py-1 text-sm rounded whitespace-nowrap ${selectedService?._id === service._id ? 'bg-blue-600 text-white' : 'bg-gray-100'}`}
              onClick={() => handleServiceClick(service)}
            >{service.name}</button>
          ))}
        </div>
      </div>

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
 {availableTimes.map(({ time, available }) => {
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

<div className="mt-4 flex justify-center gap-3">
  <button onClick={handleSubmit} disabled={!canSubmit || isSubmitting}
  className={`px-6 py-2 rounded text-white ${(!canSubmit || isSubmitting) ? 'bg-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}>
  
    {mode === 'edit' ? 'Update Appointment'
      : mode === 'rebook' ? 'Rebook'
      : 'Book Appointment'}
  </button>

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
        window.history.length > 1 ? window.history.back() : (window.location.href = '/booking');
      }
    }}
    className="px-6 py-2 bg-gray-200 hover:bg-gray-300 rounded"
  >
    Cancel
  </button>
</div>


      <img src={logo} alt="Rakie Salon Logo" className="fixed bottom-4 right-4 w-16 h-16 opacity-20 pointer-events-none" />
    
    </div>
</div>
  );
}
