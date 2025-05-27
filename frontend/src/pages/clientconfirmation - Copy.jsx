import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { toast } from 'react-toastify';

export default function ClientConfirmation({ client }) {
  const [data, setData] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    const saved = sessionStorage.getItem('confirmedAppointment');
    if (saved) {
      setData(JSON.parse(saved));
    }
  }, []);

  if (!data) return <p className="p-4">Loading confirmation...</p>;

  return (
    <div className="p-6 max-w-xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold text-green-700">Appointment Confirmed ✅</h2>
      <p><strong>Service:</strong> {data.service}</p>
      {data.addOns.length > 0 && (
        <p><strong>Add-ons:</strong> {data.addOns.map(a => a.name).join(', ')}</p>
      )}
      <p><strong>Date & Time:</strong> {data.date} at {data.time}</p>

      <div className="flex gap-3 mt-6">
        <button
          onClick={() => navigate('/schedule')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          Edit Appointment
        </button>
        <button
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
          onClick={async () => {
            try {
              await API.delete(`/appointments/${id}`);
              sessionStorage.removeItem('confirmedAppointment');
              toast.success('Appointment canceled');
              navigate('/schedule');
            } catch (err) {
              toast.error('Failed to cancel appointment');
            }
          }}
        >
          Cancel Appointment
        </button>
        <button
          onClick={() => window.location.href = 'https://rakiesalon.com'}
          className="bg-gray-600 hover:bg-gray-700 text-white px-4 py-2 rounded"
        >
          Done
        </button>
      </div>
    </div>
  );
}
