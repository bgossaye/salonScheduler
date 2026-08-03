import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { toast } from 'react-toastify';
import {
  doesAppointmentQualifyForSpecial,
  getSpecialAppointmentBadgeText,
  usePromotionConfig,
} from '../utils/specialDeals';

export default function ClientConfirmation({ client }) {
  const [data, setData] = useState(null);
  const { promotionConfig } = usePromotionConfig();
  const shouldShowClientPromotion = promotionConfig.enabled && promotionConfig.showClientBadges;
  const navigate = useNavigate();

  useEffect(() => {
    const saved = sessionStorage.getItem('confirmedAppointment');
    if (saved) {
      setData(JSON.parse(saved));
    }
  }, []);

  if (!data) return <p className="p-4">Loading confirmation...</p>;

  const { id, service, addOns, date, time } = data;
  const cancelAuth = {
    clientId: data?.clientId || data?.client?._id || client?._id,
    phone: data?.client?.phone || client?.phone || '',
  };
  const appointmentForPromotion = { service, date };
  const qualifiesForSpecial = shouldShowClientPromotion && doesAppointmentQualifyForSpecial(appointmentForPromotion, promotionConfig);
  const specialBadgeText = qualifiesForSpecial ? getSpecialAppointmentBadgeText(appointmentForPromotion, promotionConfig) : '';

  return (
    <div className="p-6 max-w-xl mx-auto space-y-4">
      <h2 className="text-2xl font-bold text-green-700">Appointment Confirmed ✅</h2>
      {qualifiesForSpecial && (
        <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">
          {specialBadgeText}
        </div>
      )}
      <p><strong>Service:</strong> {service}</p>
      {addOns.length > 0 && (
        <p><strong>Add-ons:</strong> {addOns.map(a => a.name).join(', ')}</p>
      )}
      <p><strong>Date & Time:</strong> {date} at {time}</p>

      <div className="flex gap-3 mt-6">
        <button
          onClick={() => {
            sessionStorage.setItem('editingAppointment', JSON.stringify({ service, addOns, date, time }));
            navigate('/schedule');
          }}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded"
        >
          Edit Appointment
        </button>
        <button
          className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded"
          onClick={async () => {
            try {
              await API.delete(`/appointments/${id}`, { data: cancelAuth });
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
