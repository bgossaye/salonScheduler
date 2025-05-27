// Cleanly built ClientDashboard.jsx according to updated spec
import React, { useEffect, useState } from 'react';
import API from '../api';
import { toast } from 'react-toastify';
import logo from '../assets/RSlogo.jpg';

export default function ClientDashboard({ client }) {
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!client) return;
    API.get(`/appointments/client/${client._id}`)
      .then((res) => {
        setAppointments(Array.isArray(res.data) ? res.data : []);
        setLoading(false);
      })
      .catch((err) => {
        console.error("❌ Failed to fetch appointments:", err);
        toast.error('Failed to fetch appointments');
        setLoading(false);
      });
  }, [client]);

  const handleCancel = async (id) => {
    try {
      await API.delete(`/appointments/${id}`);
      setAppointments(prev => prev.filter(appt => appt._id !== id));
      toast.success('Appointment canceled');
    } catch (err) {
      console.error("❌ Failed to cancel appointment:", err);
      toast.error('Failed to cancel appointment');
    }
  };

  const handleEdit = (appointment) => {
    sessionStorage.setItem('editingAppointment', JSON.stringify(appointment));
    window.location.href = '/booking/schedule';
  };

  const handleExit = () => {
    window.location.href = 'https://rakiesalon.com';
  };
const handleRebook = () => {
        window.location.href = '/booking/schedule';
  };


  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <header className="flex justify-between items-right mb-4">
        <img src={logo} alt="Rakie Salon Logo" className="h-12" />
<div className="text-right mb-6">
  <h2 className="text-2xl font-semibold">Welcome back, {client?.fullName}</h2>
  <button
    onClick={() => {
      sessionStorage.clear();
      window.location.href = '/booking';
    }}
    className="mt-1 text-sm text-blue-600 underline hover:text-blue-800"
  >
    Not you?
  </button>
</div>

        <button
          onClick={handleExit}
          className="text-sm text-blue-500 hover:underline"
        >
          Exit
        </button>
      </header>

      {loading ? (
        <p>Loading appointments...</p>
      ) : appointments.length > 0 ? (
        appointments.map((appt) => (
          <div key={appt._id} className="bg-white shadow-md rounded p-4 mb-4">
            <p><strong>Service:</strong> {appt.service}</p>
            <p><strong>Date:</strong> {appt.date}</p>
            <p><strong>Time:</strong> {appt.time}</p>
            {appt.addOns?.length > 0 && (
              <p><strong>Add-ons:</strong> {appt.addOns.map(a => a.name).join(', ')}</p>
            )}
            <div className="flex gap-2 mt-4">
              <button onClick={() => handleEdit(appt)} className="bg-blue-500 text-white px-4 py-2 rounded">Edit</button>
              <button onClick={() => handleCancel(appt._id)} className="bg-red-500 text-white px-4 py-2 rounded">Cancel</button>
              <button onClick={handleExit} className="bg-gray-500 text-white px-4 py-2 rounded">Exit</button>
            </div>
          </div>
        ))
      ) : (
        <div className="bg-white shadow-md rounded p-4 text-center">
  <p className="mb-4">You have no upcoming appointments.</p>
  <div className="flex justify-center gap-4">
    <button onClick={() => handleRebook()} className="bg-blue-500 text-white px-4 py-2 rounded">
      Rebook
    </button>
    <button onClick={handleExit} className="bg-gray-500 text-white px-4 py-2 rounded">
      Exit
    </button>
  </div>
</div>
      )}

      <img
        src={logo}
        alt="Rakie Salon Logo"
        className="fixed bottom-4 right-4 w-16 h-16 opacity-30 pointer-events-none"
      />
    </div>
  );
}
