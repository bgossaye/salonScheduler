import React, { useState, useEffect, useRef } from 'react';
import API from '../../api';
import { formatTime } from '../../utils/formatHelper';
import { toast } from 'react-toastify';
import { normalizePhone10, coercePhone10, isTenDigit } from '../../utils/phone';

export default function AppointmentFormModal({ isOpen, onClose, onSave, initialData }) {
  const phoneInputRef = useRef(null);
  const prevDateRef = useRef(''); // remember last accepted date to allow revert on cancel

  const [form, setForm] = useState({
    clientId: '',
    serviceId: '',
    date: '',
    time: '',
    duration: 60,
    status: 'booked',
    addOns: []
  });
  const [clients, setClients] = useState([]);
  const [services, setServices] = useState([]);
  const [availableTimes, setAvailableTimes] = useState([]);
  const [storeHours, setStoreHours] = useState([]);
  const [suggestedAddOns, setSuggestedAddOns] = useState([]);
  const [showAddOnPrompt, setShowAddOnPrompt] = useState(false);
  const [error, setError] = useState('');
  const [addingClient, setAddingClient] = useState(false);
  const [newClient, setNewClient] = useState({ firstName: '', lastName: '', phone: '', email: null });
  const [phoneSearch, setPhoneSearch] = useState('');
  const [, setDuplicatePhone] = useState(false);
  const [matchedClient, setMatchedClient] = useState(null);

  const [loading, setLoading] = useState({ find:false, addClient:false, save:false });
  const [newClientErrors, setNewClientErrors] = useState({});

  const Spinner = ({ className = '' }) => (
    <span
      aria-hidden
      className={`inline-block align-middle h-4 w-4 rounded-full border-2 border-current border-t-transparent animate-spin ${className}`}
    />
  );
  const resetForm = () => {
    setForm({ clientId: '', serviceId: '', date: '', time: '', duration: 60, status: 'booked', addOns: [] });
    setAvailableTimes([]);
    setSuggestedAddOns([]);
    setError('');
    setAddingClient(false);
    setNewClient({ firstName: '', lastName: '', phone: '', email: '' });
    setPhoneSearch('');
    setMatchedClient(null);
    setNewClientErrors({});
  };

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
        addOns: (initialData.addOns || []).map(a => a._id || a),
        time: initialData.time?.slice(0, 5) || ''
      };
      setForm(normalized);

      if (initialData.date && initialData.serviceId?._id) {
        API.get('/availability', {
          params: {
            date: initialData.date,
            serviceId: initialData.serviceId._id
          }
        }).then(res => setAvailableTimes(res.data))
          .catch(err => console.error('Failed to fetch availability (edit open)', err));
      }
    } else if (isOpen) {
      resetForm();
    }
  }, [isOpen, initialData]);

   useEffect(() => {
    const fetchAvailability = async () => {
      if (!form.date || !form.serviceId || !storeHours.length) return;

      const dateObj = new Date(form.date + 'T12:00:00'); // <- important to fix timezone issues
      if (isNaN(dateObj)) return;

      const selectedDay = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
      const storeDay = storeHours.find(h => h.day === selectedDay);

      // 🔁 Always show 5:00–24:00 for admin
      const DAY_START_MIN = 6 * 60;     // 6:00 AM
      const DAY_END_MIN   = 21 * 60;    // 9pm
      const interval = 15;              // 15-minute blocks

      // Compute active store window if any (and not closed)
      let openMin = null;
      let closeMin = null;
      if (storeDay && !storeDay.closed && storeDay.open && storeDay.close) {
        openMin = toMinutes(storeDay.open);
        closeMin = toMinutes(storeDay.close);
      }

      const duration = form.duration || 0;
      const times = [];

      // Generate the whole day from 5:00 → 24:00
      for (let min = DAY_START_MIN; min + duration <= DAY_END_MIN; min += interval) {
        const hours = String(Math.floor(min / 60)).padStart(2, '0');
        const minutes = String(min % 60).padStart(2, '0');
        const timeStr = `${hours}:${minutes}`;

        const inStoreHours =
          openMin !== null &&
          closeMin !== null &&
          min >= openMin &&
          min + duration <= closeMin;

        times.push({
          time: timeStr,
          status: 'free',
          inStoreHours, // 🌈 used for coloring later
        });
      }

      // fetch all appointments for that date
      try {
        const { data: appts } = await API.get('/admin/appointments', {
          params: { date: form.date }
        });

        // filter to only active ones
        const active = appts.filter(a => ['booked', 'pending'].includes(a.status));

        // mark booked/overbooked slots
        for (const appt of active) {
          const startMin = toMinutes(appt.time);
          const endMin = startMin + (appt.duration || 60);

          for (const slot of times) {
            const slotMin = toMinutes(slot.time);
            const inRange = slotMin >= startMin && slotMin < endMin;
            if (inRange) {
              slot.count = (slot.count || 0) + 1;
              slot.status = slot.count > 1 ? 'overbooked' : 'booked';
            }
          }
        }
      } catch (err) {
        console.error('Failed to fetch day appointments:', err);
      }

      setAvailableTimes(times);
    };

    // ⏳ Slight delay to ensure latest state
    const timer = setTimeout(fetchAvailability, 0);
    return () => clearTimeout(timer);
  }, [form.date, form.serviceId, form.duration, storeHours]);


  const fetchClients = async () => {
    const { data } = await API.get('/admin/clients');
    setClients(data);
  };

  const fetchServices = async () => {
    const { data } = await API.get('/admin/services');
    setServices(data);
  };

 const handleChange = (e) => {
  const { name, value } = e.target;

  setForm((prev) => {
    const isServiceChange = name === 'serviceId';
    const isDateChange = name === 'date';
    return {
	...prev,
	[name]: value,
	time: isServiceChange || isDateChange ? '' : prev.time,
	duration: isServiceChange
	? services.find((s) => s._id === value)?.duration || prev.duration
	: prev.duration,
	service: isServiceChange
	? services.find((s) => s._id === value)?.name || prev.service
	: prev.service
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
    if (!isTenDigit(phoneSearch)) {
      toast.error("Please enter a valid 10-digit phone number.");
      return;
    }
 const match = clients.find(c => c.phone === normalizePhone10(phoneSearch));
   try {
     setLoading(l => ({ ...l, find:true }));
     const match = clients.find(c => c.phone === normalizePhone10(phoneSearch));
     if (match) {
       setForm(prev => ({ ...prev, clientId: match._id }));
       setMatchedClient(match);
       toast.success("Client found and selected.");
     } else {
       if (window.confirm("Not found! Create?")) {
         setNewClient(prev => ({ ...prev, phone: phoneSearch }));
         setAddingClient(true);
         setMatchedClient(null);
         setNewClientErrors({});
         setError('');
       } else {
         toast.info("No client selected.");
       }
     }
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

      const baseDuration = services.find(s => s._id === prev.serviceId)?.duration || 60;

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
    if (clients.find(c => c.phone === normalizedPhone)) {
      setDuplicatePhone(true);
      setNewClientErrors({ phone: true });
      toast.error("Client with this phone number already exists.");
      return;
    }
    try {

      const payload = {
        firstName: newClient.firstName.trim(),
        lastName: newClient.lastName.trim(),
        phone: normalizedPhone
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
      setError(err?.response?.data?.error || 'Failed to add new client.');
       } finally {
        setLoading(l => ({ ...l, addClient:false }));
       }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (loading.save) return; // guard
    if (!form.clientId || !form.serviceId || !form.date || !form.time) {
      setError('Please complete all required fields.');
      return;
    }
    try {
     setLoading(l => ({ ...l, save:true }));
      await onSave(form);
      resetForm();
      onClose();
    } catch (err) {
      setError(err.response?.status === 409 ? 'That time slot is already booked. Please choose another.' : 'Failed to save appointment.');
     } finally {
     setLoading(l => ({ ...l, save:false }));}
  };

  const handleCancel = () => {
    resetForm();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded p-6 w-full max-w-lg shadow-lg max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">{initialData ? 'Edit' : 'Add'} Appointment</h2>
        {error && <p className="text-red-600 mb-2">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-4">
          {initialData ? (
            <p className="text-gray-700 font-medium mb-2">
		Client: {(initialData.clientId?.firstName || '') + ' ' + (initialData.clientId?.lastName || '') || 'N/A'}
            </p>
          ) : !addingClient ? (
            <>
              <div className="flex gap-2">
                <input
                  ref={phoneInputRef}
                  placeholder="Search by Phone"
                  value={phoneSearch}
                  onChange={e => setPhoneSearch(coercePhone10(e.target.value))}
  className="w-full border p-2"

                />
                <button
                  type="button"
                  onClick={handlePhoneSearch}
                  disabled={loading.find || !isTenDigit(phoneSearch)}
                  className={`bg-blue-500 text-white px-4 disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2`}>
                  {loading.find && <Spinner />}
                  {loading.find ? 'Finding…' : 'Find'}

                  Find
                </button>
              </div>
              {matchedClient && (
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
                <button type="button" className="border px-4 py-2" onClick={() => setAddingClient(false)}>Cancel</button>
              </div>
            </div>
          )}

          <div>
            <label className="block font-medium">Select Service</label>
            <select name="serviceId" value={form.serviceId} onChange={handleChange} required className="w-full border p-2">
              <option value="">Service</option>
              {services.map(s => (
                <option key={s._id} value={s._id}>{s.name}</option>
              ))}
            </select>
          </div>
<div className="mb-4">
  <label htmlFor="date" className="block font-medium leading-none">
    Select Date
  </label>          
	<input 
	type="date" name="date" value={form.date} onChange={handleChange} onBlur={() => confirmClosedIfNeeded(form.date)} required  className={`w-full border p-2 ${error && !form.date ? 'bg-yellow-100 border-yellow-400' : ''}`}
/></div>


{form.date && form.serviceId && (
<div className="grid grid-cols-3 sm:grid-cols-4 gap-2 sm:gap-x-1 sm:gap-y-0">
    {availableTimes.map(({ time, status, inStoreHours }) => {
      const slotMin = toMinutes(time);
      const selectionStart = form.time ? toMinutes(form.time) : null;
      const selectionEnd = selectionStart !== null ? selectionStart + (form.duration || 0) : null;
      const isInSelection = selectionStart !== null && slotMin >= selectionStart && slotMin < selectionEnd;

      let bgClass = '';

      if (status === 'overbooked') {
        // overlapping bookings → pink
        bgClass = 'bg-pink-300 text-gray-900';
      } else if (status === 'booked') {
        // already booked → yellow
        bgClass = 'bg-yellow-300 text-gray-900';
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
  onClick={() => setForm(prev => ({ ...prev, time }))}
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

          <div className="flex justify-end gap-2 pb-2">
            <button type="button" onClick={handleCancel} className="px-4 py-2 border">Cancel</button>
   <button
     type="submit"
     disabled={loading.save}
     className="px-4 py-2 bg-blue-600 text-white disabled:opacity-60 disabled:cursor-not-allowed flex items-center gap-2"
   >
     {loading.save && <Spinner />}
     {loading.save ? 'Saving…' : 'Save'}
   </button>          </div>
        </form>
      </div>
    </div>
  );
}
