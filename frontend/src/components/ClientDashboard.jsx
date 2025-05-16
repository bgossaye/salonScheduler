import React, { useState, useEffect } from 'react';
import axios from 'axios';
import ServiceSelector from './ServiceSelector';
import { toast } from 'react-toastify';
import { confirmAlert } from 'react-confirm-alert';
import 'react-confirm-alert/src/react-confirm-alert.css';

export default function ClientDashboard({ client }) {
  const [appointment, setAppointment] = useState(null);
  const [pastAppointment, setPastAppointment] = useState(null);
  const [editing, setEditing] = useState(false);
  const [confirmation, setConfirmation] = useState(null);

  useEffect(() => {
    axios.get(`/api/appointments/client/${client._id}`)
      .then((res) => {
        const now = new Date();
        const upcoming = res.data.find(a => new Date(`${a.date} ${a.time}`) >= now);
        const past = res.data
          .filter(a => new Date(`${a.date} ${a.time}`) < now)
          .sort((a, b) => new Date(`${b.date} ${b.time}`) - new Date(`${a.date} ${a.time}`))[0];

        setAppointment(upcoming || null);
        setPastAppointment(past || null);
      })
      .catch(err => {
        console.error('❌ Error fetching client appointments:', err);
      });
  }, [client._id]);

  const handleCancel = () => {
    if (!appointment) return;

    const cancelAppointment = () => {
      axios
        .delete(`/api/appointments/${appointment._id}`)
        .then(() => {
          setAppointment(null);
          setConfirmation(null);
          toast.success('✅ Appointment cancelled.');
        })
        .catch(err => {
          console.error('❌ Cancel failed:', err);
          toast.error('❌ Failed to cancel appointment.');
        });
    };

    confirmAlert({
      title: 'Cancel Appointment',
      message: 'Are you sure you want to cancel this appointment?',
      buttons: [
        { label: 'Yes', onClick: cancelAppointment },
        { label: 'No', onClick: () => toast.info('❎ Appointment not cancelled.') }
      ]
    });
  };

  const handleBooked = (newAppt) => {
    setAppointment(newAppt);
    setConfirmation(newAppt);
    setEditing(false);
  };

  const formatDateTime = (date, time) => {
    return new Date(`${date} ${time}`).toLocaleString();
  };

  const renderAddOns = (addOns) => {
    return Array.isArray(addOns) && addOns.length > 0
      ? addOns.filter(a => a && a.name).map(a => a.name).join(', ')
      : null;
  };

  return (
    <div className="p-6 max-w-3xl mx-auto space-y-6">
      <h1><b>Welcome, {client?.fullName || 'Guest'}</b></h1>

      {confirmation && (
        <div className="border border-green-400 bg-green-50 rounded shadow-md p-6">
          <h2 className="text-xl font-semibold text-green-700 mb-3">Appointment Confirmed ✅</h2>
          <p className="text-lg"><strong>Service:</strong> {confirmation.service}</p>
          {renderAddOns(confirmation.addOns) && (
            <p className="text-lg"><strong>Add-ons:</strong> {renderAddOns(confirmation.addOns)}</p>
          )}
          <p className="text-lg"><strong>Date & Time:</strong> {formatDateTime(confirmation.date, confirmation.time)}</p>
        </div>
      )}

      {appointment && !editing && (
        <div className="border rounded shadow-md p-6 bg-gray-50 space-y-3">
          <h2 className="text-lg font-semibold">Upcoming Appointment</h2>
          <p><strong>Service:</strong> {appointment.service}</p>
          {renderAddOns(appointment.addOns) && (
            <p><strong>Add-ons:</strong> {renderAddOns(appointment.addOns)}</p>
          )}
          <p><strong>Date & Time:</strong> {formatDateTime(appointment.date, appointment.time)}</p>
          <p><strong>Status:</strong> {appointment.status}</p>
          <button
            onClick={() => window.location.href = 'https://rakiesalon.com'}
            className="mt-6 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded text-lg"
          >
            Done
          </button>
          <div className="flex gap-3 mt-4">
            <button
              onClick={() => setEditing(true)}
              className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded"
            >
              Edit
            </button>
            <button
              onClick={handleCancel}
              className="bg-red-500 hover:bg-red-600 text-white px-4 py-2 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {(!appointment || editing) && (
        <div>
          <p className="mb-3 text-gray-600">
            {appointment ? 'Edit your appointment below:' : 'No appointment found. Please book one.'}
          </p>
          <ServiceSelector client={client} onBooked={handleBooked} />
        </div>
      )}

      {pastAppointment && (
        <div className="border rounded shadow-md p-4 bg-gray-100 text-sm">
          <h2 className="font-semibold mb-1">Last Visit</h2>
          <p><strong>Service:</strong> {pastAppointment.service}</p>
          {renderAddOns(pastAppointment.addOns) && (
            <p><strong>Add-ons:</strong> {renderAddOns(pastAppointment.addOns)}</p>
          )}
          <p><strong>Date & Time:</strong> {formatDateTime(pastAppointment.date, pastAppointment.time)}</p>
          <p><strong>Status:</strong> {pastAppointment.status}</p>
        </div>
      )}
    </div>
  );
}
