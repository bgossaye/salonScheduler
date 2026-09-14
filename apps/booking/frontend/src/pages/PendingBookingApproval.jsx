import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import API from '../api';
import logo from '../assets/TheRSlogo.png';

export default function PendingBookingApproval() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [appointment, setAppointment] = useState(null);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await API.get(`/pending-booking-approval/${encodeURIComponent(token)}`);
        if (!active) return;
        const next = response?.data?.appointment || null;
        setAppointment(next);
        if (String(next?.status || '').toLowerCase() === 'booked') setConfirmed(true);
      } catch (err) {
        if (!active) return;
        setError(err?.response?.data?.error || 'Unable to open this booking approval link.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [token]);

  async function confirmAppointment() {
    if (confirming || confirmed) return;
    setConfirming(true);
    setError('');
    try {
      const response = await API.post(`/pending-booking-approval/${encodeURIComponent(token)}/confirm`);
      setAppointment(response?.data?.appointment || appointment);
      setConfirmed(true);
    } catch (err) {
      const code = err?.response?.data?.code;
      const message = err?.response?.data?.error || 'Unable to confirm this appointment.';
      if (code === 'APPOINTMENT_ALREADY_RESOLVED' && err?.response?.data?.currentStatus === 'booked') {
        setConfirmed(true);
      } else {
        setError(message);
      }
    } finally {
      setConfirming(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-100 flex items-start justify-center px-4 py-10">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-6 text-center">
        <img src={logo} alt="Rakie Salon" className="w-24 h-24 object-contain mx-auto mb-3" />
        <h1 className="text-2xl font-semibold text-gray-900">Booking Request</h1>

        {loading && <p className="mt-6 text-gray-600">Loading appointment…</p>}

        {!loading && appointment && (
          <div className="mt-6 text-left rounded-xl border border-gray-200 p-4 space-y-2">
            <div><span className="font-semibold">Client:</span> {appointment.clientName}</div>
            <div><span className="font-semibold">Service:</span> {appointment.serviceName}</div>
            <div><span className="font-semibold">Date:</span> {appointment.dateLabel}</div>
            <div><span className="font-semibold">Time:</span> {appointment.timeLabel}</div>
            {appointment.workerName ? <div><span className="font-semibold">Stylist:</span> {appointment.workerName}</div> : null}
          </div>
        )}

        {!loading && confirmed && (
          <div className="mt-6 rounded-xl bg-green-50 border border-green-200 p-4 text-green-800 font-medium">
            Appointment confirmed. The customer confirmation text has been sent.
          </div>
        )}

        {!loading && !confirmed && appointment && String(appointment.status || '').toLowerCase() === 'pending' && (
          <button
            type="button"
            onClick={confirmAppointment}
            disabled={confirming}
            className="mt-6 w-full rounded-xl bg-black text-white py-3 px-4 font-semibold disabled:opacity-60"
          >
            {confirming ? 'Confirming…' : 'Confirm Appointment'}
          </button>
        )}

        {!loading && appointment && !confirmed && String(appointment.status || '').toLowerCase() !== 'pending' && (
          <div className="mt-6 rounded-xl bg-gray-50 border border-gray-200 p-4 text-gray-700">
            This booking is already {appointment.status || 'resolved'}.
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl bg-red-50 border border-red-200 p-4 text-red-700">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
