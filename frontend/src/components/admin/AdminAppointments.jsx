import React, { useState, useEffect } from 'react';
import axios from 'axios';
import AppointmentFormModal from './AppointmentFormModal';

const formatTime12hr = (timeStr) => {
  if (!timeStr) return '';
  const [hourStr, minuteStr] = timeStr.split(':');
  let hour = parseInt(hourStr, 10);
  const minute = minuteStr.padStart(2, '0');
  const ampm = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${minute} ${ampm}`;
};

const formatDateMMDDYY = (dateStr) => {
  if (!dateStr) return '';
  const [year, month, day] = dateStr.split('-');
  return `${parseInt(month)}/${parseInt(day)}/${year.slice(2)}`;
};

const sortAppointments = (appointments) => {
  return appointments.slice().sort((a, b) => {
    const dateA = new Date(`${a.date}T${a.time}`);
    const dateB = new Date(`${b.date}T${b.time}`);
    return dateA - dateB;
  });
};

const renderAddOns = (addOns) => {
  return Array.isArray(addOns) && addOns.length > 0
    ? addOns.filter(a => a && a.name).map(a => a.name).join(', ')
    : '—';
};

export default function AdminAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [filters, setFilters] = useState({ date: '', status: '', client: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState(null);

  useEffect(() => {
    fetchAppointments();
  }, [filters]);

  const fetchAppointments = async () => {
    const { data } = await axios.get('/api/admin/appointments', { params: filters });
    setAppointments(sortAppointments(data));
  };

  const handleUpdate = async (id, update) => {
    await axios.patch(`/api/admin/appointments/${id}`, update);
    fetchAppointments();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure?')) {
      await axios.delete(`/api/admin/appointments/${id}`);
      fetchAppointments();
    }
  };

  const handleSave = async (form) => {
    if (selectedAppt?._id) {
      await axios.patch(`/api/admin/appointments/${selectedAppt._id}`, form);
    } else {
      await axios.post('/api/admin/appointments', form);
    }
    fetchAppointments();
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Appointments</h2>

      <div className="mb-4 flex gap-2 flex-wrap">
        <input
          type="date"
          value={filters.date}
          onChange={(e) => setFilters({ ...filters, date: e.target.value })}
          className="border px-2 py-1"
        />
        <select
          value={filters.status}
          onChange={(e) => setFilters({ ...filters, status: e.target.value })}
          className="border px-2 py-1"
        >
          <option value="">All</option>
          <option value="booked">Booked</option>
          <option value="completed">Completed</option>
          <option value="canceled">Canceled</option>
          <option value="no-show">No Show</option>
        </select>
        <input
          placeholder="Client name or phone"
          value={filters.client}
          onChange={(e) => setFilters({ ...filters, client: e.target.value })}
          className="border px-2 py-1"
        />
        <button onClick={() => { setSelectedAppt(null); setModalOpen(true); }} className="bg-blue-600 text-white px-4 py-2 ml-auto">+ Add Appointment</button>
      </div>

      <table className="w-full border text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 border">Date</th>
            <th className="p-2 border">Time</th>
            <th className="p-2 border">Client</th>
            <th className="p-2 border">Service</th>
            <th className="p-2 border">Add-ons</th>
            <th className="p-2 border">Status</th>
            <th className="p-2 border">Actions</th>
          </tr>
        </thead>
        <tbody>
          {appointments.map((appt) => (
            <tr key={appt._id}>
              <td className="p-2 border">{formatDateMMDDYY(appt.date)}</td>
              <td className="p-2 border">
                {formatTime12hr(appt.time)}
                {appt.duration ? ` (${appt.duration} min)` : ''}
              </td>
              <td className="p-2 border flex items-center gap-2">
                {appt.clientId?.profilePhoto && (
                  <img
                    src={appt.clientId.profilePhoto}
                    alt="Profile"
                    className="w-6 h-6 rounded-full object-cover"
                  />
                )}
                {appt.clientId?.fullName || 'N/A'}
              </td>
              <td className="p-2 border">{appt.serviceId?.name || appt.service || 'N/A'}</td>
              <td className="p-2 border">{renderAddOns(appt.addOns)}</td>
              <td className="p-2 border capitalize">{appt.status}</td>
              <td className="p-2 border space-x-2">
                <button onClick={() => handleUpdate(appt._id, { status: 'completed' })} className="text-green-600">✔</button>
                <button onClick={() => handleUpdate(appt._id, { status: 'no-show' })} className="text-yellow-600">🚫</button>
                <button onClick={() => handleDelete(appt._id)} className="text-red-600">🗑</button>
                <button onClick={() => { setSelectedAppt(appt); setModalOpen(true); }} className="text-blue-600">✏️</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <AppointmentFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        initialData={selectedAppt}
      />
    </div>
  );
}
