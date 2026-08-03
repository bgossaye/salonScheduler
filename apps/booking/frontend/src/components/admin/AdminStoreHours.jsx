import React, { useState, useEffect } from 'react';
import API from '../../api';

const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const blankException = {
  title: '',
  reason: 'holiday',
  startDate: '',
  endDate: '',
  storeClosed: true,
  onlineBookingOff: true,
  phoneCallRequired: true,
  open: '',
  close: '',
  customerMessage: '',
  internalNote: '',
  active: true,
};

function formatDateRange(row) {
  if (!row?.startDate) return '';
  return row.startDate === row.endDate ? row.startDate : `${row.startDate} → ${row.endDate}`;
}

export default function AdminStoreHours() {
  const [hours, setHours] = useState([]);
  const [exceptions, setExceptions] = useState([]);
  const [activeTab, setActiveTab] = useState('weekly');
  const [form, setForm] = useState(blankException);
  const [editingId, setEditingId] = useState(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchHours();
    fetchExceptions();
  }, []);

  const fetchHours = async () => {
    const { data } = await API.get('/admin/store-hours');
    setHours(data || []);
  };

  const fetchExceptions = async () => {
    const { data } = await API.get('/admin/store-hours/calendar');
    setExceptions(data || []);
  };

  const handleChange = async (day, field, value) => {
    const updatedHours = [...hours];
    const index = updatedHours.findIndex(h => h.day === day);
    const updatedDay = index !== -1 ? { ...updatedHours[index] } : { day };

    updatedDay[field] = field === 'closed' ? Boolean(value) : value;

    if (index !== -1) updatedHours[index] = updatedDay;
    else updatedHours.push(updatedDay);

    setHours(updatedHours);
    await API.put(`/admin/store-hours/${day}`, updatedDay);
  };

  const updateForm = (field, value) => {
    setMessage('');
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === 'storeClosed' && value) {
        next.onlineBookingOff = true;
        next.open = '';
        next.close = '';
      }
      if (field === 'onlineBookingOff' && value) next.phoneCallRequired = true;
      if (field === 'startDate' && !next.endDate) next.endDate = value;
      return next;
    });
  };

  const resetForm = () => {
    setForm(blankException);
    setEditingId(null);
    setMessage('');
  };

  const editException = (row) => {
    setActiveTab('calendar');
    setEditingId(row._id);
    setForm({
      ...blankException,
      title: row.title || '',
      reason: row.reason || 'custom',
      startDate: row.startDate || '',
      endDate: row.endDate || row.startDate || '',
      storeClosed: row.storeClosed === true,
      onlineBookingOff: row.onlineBookingOff === true,
      phoneCallRequired: row.phoneCallRequired === true,
      open: row.open || '',
      close: row.close || '',
      customerMessage: row.customerMessage || '',
      internalNote: row.internalNote || '',
      active: row.active !== false,
    });
  };

  const saveException = async (e) => {
    e.preventDefault();
    setSaving(true);
    setMessage('');
    try {
      const payload = {
        ...form,
        endDate: form.endDate || form.startDate,
      };
      if (editingId) await API.put(`/admin/store-hours/calendar/${editingId}`, payload);
      else await API.post('/admin/store-hours/calendar', payload);
      await fetchExceptions();
      resetForm();
      setMessage(editingId ? 'Calendar exception updated.' : 'Calendar exception added.');
    } catch (err) {
      setMessage(err?.response?.data?.error || 'Failed to save calendar exception.');
    } finally {
      setSaving(false);
    }
  };

  const deleteException = async (row) => {
    if (!window.confirm(`Delete "${row.title}"?`)) return;
    await API.delete(`/admin/store-hours/calendar/${row._id}`);
    await fetchExceptions();
    if (editingId === row._id) resetForm();
  };

  return (
    <div className="p-4 space-y-4">
      <div>
        <h2 className="text-xl font-bold">Store Hours & Booking Calendar</h2>
        <p className="text-sm text-gray-600">Weekly hours are the normal schedule. Calendar exceptions override specific dates for holidays, maintenance, special hours, or phone-only booking.</p>
      </div>

      <div className="flex gap-2 border-b">
        <button
          className={`px-3 py-2 text-sm ${activeTab === 'weekly' ? 'border-b-2 border-blue-600 font-semibold' : 'text-gray-600'}`}
          onClick={() => setActiveTab('weekly')}
        >
          Weekly Hours
        </button>
        <button
          className={`px-3 py-2 text-sm ${activeTab === 'calendar' ? 'border-b-2 border-blue-600 font-semibold' : 'text-gray-600'}`}
          onClick={() => setActiveTab('calendar')}
        >
          Calendar Exceptions
        </button>
      </div>

      {activeTab === 'weekly' && (
        <table className="w-full border bg-white">
          <thead>
            <tr className="bg-gray-100">
              <th className="p-2 border">Day</th>
              <th className="p-2 border">Open</th>
              <th className="p-2 border">Close</th>
              <th className="p-2 border">Closed?</th>
            </tr>
          </thead>
          <tbody>
            {days.map((day) => {
              const h = hours.find(d => d.day === day) || {};
              const isClosed = !!h.closed;
              return (
                <tr key={day} className={isClosed ? 'bg-gray-200 text-gray-500' : ''}>
                  <td className="p-2 border font-medium">{day}</td>
                  <td className="p-2 border">
                    <input type="time" step="1800" value={h.open || ''} onChange={e => handleChange(day, 'open', e.target.value)} className="border px-2 py-1" disabled={isClosed} />
                  </td>
                  <td className="p-2 border">
                    <input type="time" step="1800" value={h.close || ''} onChange={e => handleChange(day, 'close', e.target.value)} className="border px-2 py-1" disabled={isClosed} />
                  </td>
                  <td className="p-2 border text-center">
                    <input type="checkbox" checked={isClosed} onChange={e => handleChange(day, 'closed', e.target.checked)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}

      {activeTab === 'calendar' && (
        <div className="grid gap-4 lg:grid-cols-[360px_1fr]">
          <form onSubmit={saveException} className="border rounded bg-white p-4 space-y-3">
            <div>
              <h3 className="font-semibold">{editingId ? 'Edit exception' : 'Add exception'}</h3>
              <p className="text-xs text-gray-500">Use this for holidays, maintenance, special hours, or online booking off.</p>
            </div>

            <input className="w-full border px-2 py-1 rounded" placeholder="Title, e.g. Christmas Day" value={form.title} onChange={(e) => updateForm('title', e.target.value)} />

            <select className="w-full border px-2 py-1 rounded" value={form.reason} onChange={(e) => updateForm('reason', e.target.value)}>
              <option value="holiday">Holiday</option>
              <option value="maintenance">Maintenance</option>
              <option value="emergency">Emergency</option>
              <option value="staff_event">Staff event/training</option>
              <option value="weather">Weather</option>
              <option value="online_off">Online booking off only</option>
              <option value="custom">Custom</option>
            </select>

            <div className="grid grid-cols-2 gap-2">
              <label className="text-sm">Start date
                <input required type="date" className="w-full border px-2 py-1 rounded" value={form.startDate} onChange={(e) => updateForm('startDate', e.target.value)} />
              </label>
              <label className="text-sm">End date
                <input type="date" className="w-full border px-2 py-1 rounded" value={form.endDate} onChange={(e) => updateForm('endDate', e.target.value)} />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.storeClosed} onChange={(e) => updateForm('storeClosed', e.target.checked)} />
              Store is closed
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.onlineBookingOff} onChange={(e) => updateForm('onlineBookingOff', e.target.checked)} />
              Turn online booking off
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.phoneCallRequired} onChange={(e) => updateForm('phoneCallRequired', e.target.checked)} />
              Ask customers to call
            </label>

            {!form.storeClosed && (
              <div className="grid grid-cols-2 gap-2">
                <label className="text-sm">Special open
                  <input type="time" className="w-full border px-2 py-1 rounded" value={form.open} onChange={(e) => updateForm('open', e.target.value)} />
                </label>
                <label className="text-sm">Special close
                  <input type="time" className="w-full border px-2 py-1 rounded" value={form.close} onChange={(e) => updateForm('close', e.target.value)} />
                </label>
              </div>
            )}

            <textarea className="w-full border px-2 py-1 rounded" rows="3" placeholder="Customer message shown online" value={form.customerMessage} onChange={(e) => updateForm('customerMessage', e.target.value)} />
            <textarea className="w-full border px-2 py-1 rounded" rows="2" placeholder="Internal note optional" value={form.internalNote} onChange={(e) => updateForm('internalNote', e.target.value)} />

            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={form.active} onChange={(e) => updateForm('active', e.target.checked)} />
              Active
            </label>

            {message && <div className="rounded bg-blue-50 p-2 text-sm text-blue-800">{message}</div>}

            <div className="flex gap-2">
              <button type="submit" disabled={saving} className="rounded bg-blue-600 px-3 py-2 text-sm text-white disabled:opacity-50">{saving ? 'Saving...' : editingId ? 'Update' : 'Add'}</button>
              {editingId && <button type="button" onClick={resetForm} className="rounded border px-3 py-2 text-sm">Cancel</button>}
            </div>
          </form>

          <div className="border rounded bg-white overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-100 text-left">
                  <th className="p-2 border">Date</th>
                  <th className="p-2 border">Title</th>
                  <th className="p-2 border">Store</th>
                  <th className="p-2 border">Online</th>
                  <th className="p-2 border">Message</th>
                  <th className="p-2 border">Actions</th>
                </tr>
              </thead>
              <tbody>
                {exceptions.length === 0 && (
                  <tr><td colSpan="6" className="p-4 text-center text-gray-500">No calendar exceptions yet.</td></tr>
                )}
                {exceptions.map((row) => (
                  <tr key={row._id} className={row.active === false ? 'bg-gray-100 text-gray-500' : ''}>
                    <td className="p-2 border whitespace-nowrap">{formatDateRange(row)}</td>
                    <td className="p-2 border"><div className="font-medium">{row.title}</div><div className="text-xs text-gray-500">{row.reason}</div></td>
                    <td className="p-2 border">{row.storeClosed ? 'Closed' : row.open && row.close ? `${row.open}–${row.close}` : 'Normal hours'}</td>
                    <td className="p-2 border">{row.onlineBookingOff ? 'Off / call' : 'On'}</td>
                    <td className="p-2 border max-w-xs truncate">{row.customerMessage || '—'}</td>
                    <td className="p-2 border whitespace-nowrap">
                      <button onClick={() => editException(row)} className="mr-2 text-blue-700 underline">Edit</button>
                      <button onClick={() => deleteException(row)} className="text-red-700 underline">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
