
import React, { useEffect, useState } from 'react';
import api from './api';

function Appointments() {
  const [appointments, setAppointments] = useState([]);
  const [form, setForm] = useState({ customer: '', service: '', date: '' });
  const [editingId, setEditingId] = useState(null);

  useEffect(() => {
    fetchAppointments();
  }, []);

  const fetchAppointments = async () => {
    const res = await api.get('/appointments');
    setAppointments(res.data);
  };

  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  const handleAdd = async () => {
    if (!form.customer || !form.service || !form.date) return;
    const res = await api.post('/appointments', { ...form, status: 'scheduled' });
    setAppointments([...appointments, res.data]);
    setForm({ customer: '', service: '', date: '' });
  };

  const handleDelete = async (id) => {
    await api.delete(`/appointments/${id}`);
    setAppointments(appointments.filter(a => a.id !== id));
  };

  const handleUpdateStatus = async (id) => {
    const appt = appointments.find(a => a.id === id);
    const res = await api.put(`/appointments/${id}`, { ...appt, status: appt.status === 'scheduled' ? 'completed' : 'scheduled' });
    setAppointments(appointments.map(a => a.id === id ? res.data : a));
  };

  const handleEdit = (appt) => {
    setForm({ customer: appt.customer, service: appt.service, date: appt.date.slice(0, 16) });
    setEditingId(appt.id);
  };

  const handleSaveEdit = async () => {
    const res = await api.put(`/appointments/${editingId}`, form);
    setAppointments(appointments.map(a => a.id === editingId ? res.data : a));
    setForm({ customer: '', service: '', date: '' });
    setEditingId(null);
  };

  return (
    <div style={{ padding: '1rem' }}>
      <h2>Appointments</h2>

      <div style={{ marginBottom: '1rem' }}>
        <input name="customer" placeholder="Customer" value={form.customer} onChange={handleChange} />
        <input name="service" placeholder="Service" value={form.service} onChange={handleChange} />
        <input name="date" type="datetime-local" value={form.date} onChange={handleChange} />
        {editingId ? (
          <button onClick={handleSaveEdit}>Save</button>
        ) : (
          <button onClick={handleAdd}>Add</button>
        )}
      </div>

      <ul>
        {appointments.map(appt => (
          <li key={appt.id}>
            <b>{appt.customer}</b> - {appt.service} - {new Date(appt.date).toLocaleString()} - <i>{appt.status}</i>
            <button onClick={() => handleUpdateStatus(appt.id)}>Toggle Status</button>
            <button onClick={() => handleEdit(appt)}>Edit</button>
            <button onClick={() => handleDelete(appt.id)}>Cancel</button>
          </li>
        ))}
      </ul>
    </div>
  );
}

export default Appointments;
