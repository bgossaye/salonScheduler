import React, { useState, useEffect } from 'react';
import API from '../../api';

export default function AppointmentFormModal({ isOpen, onClose, onSave, initialData }) {
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
  const [suggestedAddOns, setSuggestedAddOns] = useState([]);
  const [error, setError] = useState('');

  const resetForm = () => {
    setForm({
      clientId: '',
      serviceId: '',
      date: '',
      time: '',
      duration: 60,
      status: 'booked',
      addOns: []
    });
    setAvailableTimes([]);
    setSuggestedAddOns([]);
    setError('');
  };

  useEffect(() => {
    fetchClients();
    fetchServices();
  }, []);

  useEffect(() => {
    if (form.serviceId) {
      API.get(`/services/${form.serviceId}/addons`)
        .then(res => setSuggestedAddOns(res.data || []))
        .catch(err => console.error('Failed to load suggested add-ons', err));
    }
  }, [form.serviceId]);

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
      if (!form.date || !form.serviceId) return;
      try {
        const { data } = await API.get('/availability', {
          params: { date: form.date, serviceId: form.serviceId }
        });
        setAvailableTimes(data);
      } catch (err) {
        console.error('Failed to fetch availability', err);
      }
    };

    fetchAvailability();
  }, [form.date, form.serviceId]);

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

      return {
        ...prev,
        addOns: updatedAddOns,
        duration: baseDuration + totalAddOnDuration
      };
    });
  };

  const toMinutes = (t) => {
    const ampmMatch = t.match(/^([0-9]{1,2}):([0-9]{2})\s?(AM|PM)?$/i);
    if (ampmMatch) {
      let [_, hour, minute, period] = ampmMatch;
      hour = parseInt(hour);
      minute = parseInt(minute);
      if (period) {
        if (period.toUpperCase() === 'PM' && hour !== 12) hour += 12;
        if (period.toUpperCase() === 'AM' && hour === 12) hour = 0;
      }
      return hour * 60 + minute;
    }
    const [h, m] = t.split(':').map(Number);
    return h * 60 + m;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!form.clientId || !form.serviceId || !form.date || !form.time) {
      setError('Please complete all required fields.');
      return;
    }

    try {
      await onSave(form);
      resetForm();
      onClose();
    } catch (err) {
      if (err.response?.status === 409) {
        setError('That time slot is already booked. Please choose another.');
      } else {
        setError('Failed to save appointment.');
      }
    }
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
          <select name="clientId" value={form.clientId} onChange={handleChange} required className="w-full border p-2">
            <option value="">Select Client</option>
            {clients.map(c => (
              <option key={c._id} value={c._id}>
                {c.firstName ? `${c.firstName} ${c.lastName}` : c.fullName}
              </option>
            ))}
          </select>

          <select name="serviceId" value={form.serviceId} onChange={handleChange} required className="w-full border p-2">
            <option value="">Select Service</option>
            {services.map(s => (
              <option key={s._id} value={s._id}>{s.name}</option>
            ))}
          </select>

          <input type="date" name="date" value={form.date} onChange={handleChange} required className="w-full border p-2" />

          {form.date && form.serviceId && (
            <div className="grid grid-cols-3 gap-2">
              {availableTimes.map(({ time, status, start, end, conflict, group }) => {
                const slotMin = toMinutes(time);
                const selectionStart = form.time ? toMinutes(form.time) : null;
                const selectionEnd = selectionStart !== null ? selectionStart + (form.duration || 0) : null;
                const isInSelection = selectionStart !== null && slotMin >= selectionStart && slotMin < selectionEnd;
                const isInBooking = status === 'booked';
                const isOverlap = isInSelection && isInBooking;

                let bgClass = '';

                if (conflict) {
                  bgClass = 'bg-pink-200 text-gray-900';
                } else if (isOverlap) {
                  bgClass = 'bg-pink-200 text-gray-900';
                } else if (status === 'booked') {
                  bgClass = group === 'odd' ? 'bg-yellow-400 text-gray-900' : 'bg-yellow-200 text-gray-900';
                } else if (isInSelection) {
                  bgClass = 'bg-yellow-100 text-gray-900';
                } else {
                  bgClass = 'bg-green-100 hover:bg-green-200';
                }

                return (
                  <button
                    key={time}
                    type="button"
                    onClick={() => setForm(prev => ({ ...prev, time }))}
                    className={`p-2 rounded text-sm border ${bgClass}`}
                  >
                    {time}
                  </button>
                );
              })}
            </div>
          )}

          <input
            type="number"
            name="duration"
            value={form.duration}
            onChange={handleChange}
            required
            className="w-full border p-2"
            placeholder="Duration in minutes"
          />

          {suggestedAddOns.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm">Add-ons:</h4>
              <div className="grid grid-cols-2 gap-1">
                {suggestedAddOns.map(a => (
                  <label key={a._id} className="text-sm">
                    <input
                      type="checkbox"
                      checked={form.addOns.includes(a._id)}
                      onChange={() => handleAddOnToggle(a._id)}
                      className="mr-2"
                    />
                    {a.name} ({a.duration} min)
                  </label>
                ))}
              </div>
            </div>
          )}

          <select name="status" value={form.status} onChange={handleChange} required className="w-full border p-2">
            <option value="booked">Booked</option>
            <option value="completed">Completed</option>
            <option value="canceled">Canceled</option>
            <option value="no-show">No Show</option>
          </select>

          <div className="flex justify-end gap-2 pb-2">
            <button type="button" onClick={handleCancel} className="px-4 py-2 border">Cancel</button>
            <button type="submit" className="px-4 py-2 bg-blue-600 text-white">Save</button>
          </div>
        </form>
      </div>
    </div>
  );
}
