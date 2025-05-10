import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ServiceSelector from './ServiceSelector';

export default function ClientDashboard({ client }) {
  const [appointment, setAppointment] = useState(null);
  const [pastAppointment, setPastAppointment] = useState(null);
  const [editing, setEditing] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    // Load upcoming and past appointments
    axios.get(`/api/appointments/client/${client._id}`)
      .then((res) => {
        const now = new Date();
        const upcoming = res.data.find(a => new Date(`${a.date}T${a.time}`) >= now);
        const past = res.data
          .filter(a => new Date(`${a.date}T${a.time}`) < now)
          .sort((a, b) => new Date(b.date + 'T' + b.time) - new Date(a.date + 'T' + a.time))[0];

        setAppointment(upcoming || null);
        setPastAppointment(past || null);
      })
      .catch(err => console.error('Failed to load appointments:', err));
  }, [client._id]);

  const handleCancel = async () => {
    if (!appointment) return;
    if (!window.confirm('Are you sure you want to cancel this appointment?')) return;

    try {
      await axios.delete(`/api/appointments/${appointment._id}`);
      setAppointment(null);
      setConfirmation(null);
    } catch (err) {
      console.error('❌ Cancel failed:', err);
    }
  };

  const handleBooked = (newAppt) => {
    setAppointment(newAppt);
    setConfirmation(newAppt);
    setEditing(false);
  };

  const formatDateTime = (date, time) => {
    return new Date(`${date}T${time}`).toLocaleString();
  };

  return (
    <div className="p-6 max-w-xl mx-auto">
      {/* ✅ Booking Confirmation Screen */}
      {confirmation && (
        <div className="border border-green-400 bg-green-50 rounded p-4 mb-6">
          <h2 className="font-semibold text-green-700 mb-2">Appointment Confirmed ✅</h2>
          <p><strong>Service:</strong> {confirmation.service}</p>
          <p><strong>Date & Time:</strong> {formatDateTime(confirmation.date, confirmation.time)}</p>
          <button
            onClick={() => setConfirmation(null)}
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded"
          >
            Done
          </button>
        </div>
      )}

      {/* ✅ Upcoming Appointment */}
      {appointment && !editing && (
        <div className="border rounded p-4 bg-gray-50 mb-4">
          <h2 className="font-semibold mb-2">Upcoming Appointment</h2>
          <p><strong>Service:</strong> {appointment.service}</p>
          <p><strong>Date & Time:</strong> {formatDateTime(appointment.date, appointment.time)}</p>
          <p><strong>Status:</strong> {appointment.status}</p>

          <div className="mt-4 flex gap-2">
            <button
              onClick={() => setEditing(true)}
              className="bg-yellow-500 text-white px-3 py-1 rounded"
            >
              Edit
            </button>
            <button
              onClick={handleCancel}
              className="bg-red-500 text-white px-3 py-1 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* ✅ Show ServiceSelector to Book/Edit */}
      {(!appointment || editing) && (
        <div>
          <p className="mb-4">
            {appointment ? 'Edit your appointment below:' : 'No appointment found. Please book one.'}
          </p>
          <ServiceSelector client={client} onBooked={handleBooked} />
        </div>
      )}

      {/* ✅ Past Appointment */}
      {pastAppointment && (
        <div className="mt-6 border rounded p-4 bg-gray-100 text-sm">
          <h2 className="font-semibold mb-2">Last Visit</h2>
          <p><strong>Service:</strong> {pastAppointment.service}</p>
          <p><strong>Date & Time:</strong> {formatDateTime(pastAppointment.date, pastAppointment.time)}</p>
          <p><strong>Status:</strong> {pastAppointment.status}</p>
        </div>
      )}
    </div>
  );
}
