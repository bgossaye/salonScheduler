import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../../api';
import { toast } from 'react-toastify';
import { normalizeDateForInput } from '../../utils/formatHelper'; 
import { coercePhone10, isTenDigit } from '../../utils/phone';
import {
  doesAppointmentQualifyForSpecial,
  getAppointmentServiceName,
  getSpecialAppointmentBadgeText,
  usePromotionConfig,
} from '../../utils/specialDeals';

export default function AdminClientProfile() {
  const { id: clientId } = useParams();
  const [client, setClient] = useState(null);
  const navigate = useNavigate();
  const fileInputRef = useRef();
  const [appointments, setAppointments] = useState([]);
  const [nextAppointment, setNextAppointment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const { promotionConfig } = usePromotionConfig();
  const shouldShowWorkerPromotion = promotionConfig.enabled && promotionConfig.showWorkerBadges;

useEffect(() => {
    const fetchClient = async () => {
      try {
	console.log("fetchClient...")
if (!clientId || clientId.length !== 24) {
  console.warn("Invalid clientId:", clientId);
  return;
}
else
{  console.log("clientId:", clientId);}

        const { data } = await API.get(`/admin/clients/${clientId}/details`);
        const clientData = data.client || data;
        clientData.dob = normalizeDateForInput(clientData.dob); // normalize once
        setClient(clientData);
	console.log("post get fetchClient...")

        const phone = clientData.phone;
        if (phone) {
          const apptRes = await API.get('/admin/appointments', { params: { client: phone } });
          const sorted = apptRes.data.sort(
            (a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`)
          );
          setAppointments(sorted);
          const upcoming = sorted.find(a => a.status === 'booked' || a.status === 'confirmed');
          if (upcoming) {
            setNextAppointment(`${upcoming.date} at ${upcoming.time}`);
          }
        }
      } catch (err) {
        console.error("Client fetch error:", err);
        setError('Failed to load client data.');
      } finally {
        setLoading(false);
      }
    };

    if (clientId) fetchClient();
  }, [clientId]);

  const handleChange = (field, value) => {
    setClient({
      ...client,
      [field]: field === 'phone' ? coercePhone10(value) : value,
    });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    try {
      const { data } = await API.post(`/admin/clients/${client._id}/upload-photo`, formData);
      setClient({ ...client, profilePhoto: data.url });
    } catch (err) {
      alert('Failed to upload image.');
    }
  };

const handleSave = async () => {
  if (!isTenDigit(client?.phone || '')) {
    alert('Phone must be a valid 10-digit number.');
    return;
  }

  setSaving(true);
  try {
      await API.patch(`/admin/clients/${client._id}`, {
          ...client,
          servicePreferences: client.servicePreferences || {}
      });
    alert('Client profile updated.');
    navigate('/admin/clients'); // 👈 redirect here
  } catch (err) {
    alert('Failed to save changes.');
  } finally {
    setSaving(false);
  }
};

  const handleToggle = (field) => {
    API.patch(`/admin/clients/${clientId}`, {
      [`contactPreferences.${field}`]: !client.contactPreferences[field]
    })
      .then(res => setClient(res.data))
      .catch(err => toast.error('Failed to update preferences'));
  };

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!client) return <div className="p-4">Client not found.</div>;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Client Profile</h2>
<div className="p-4 space-y-4">
<h2 className="text-xl font-bold">
  Client Profile: {`${client.firstName || ''} ${client.lastName || ''}`.trim()}
</h2>
      <p>Email: {client.email}</p>
      <p>Phone: {client.phone}</p>

      <div className="space-y-2">
        <label>
          <input
            type="checkbox"
            checked={!!client.contactPreferences.optInPromotions}
            onChange={() => handleToggle('optInPromotions')}
          />
          Receive SMS (consent)
        </label>
        <br />
        <label>
          <input
            type="checkbox"
            checked={!client.contactPreferences.emailDisabled}
            onChange={() => handleToggle('emailDisabled')}
          />
          Receive Email
        </label>
      </div>
    </div>

      <div className="flex items-center gap-4 mb-6">
        <div className="relative">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
            accept="image/*"
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer"
            title="Click to upload image"
          >
            {client.profilePhoto ? (
              <img
                src={client.profilePhoto}
                alt="Profile"
                className="w-24 h-24 rounded-full object-cover border"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gray-300 flex items-center justify-center text-gray-600">
                No Image
              </div>
            )}
          </div>
        </div>
        <div>
          <h3 className="text-xl font-semibold">
{[client.firstName, client.lastName].filter(Boolean).join(' ') || 'N/A'}
          </h3>
          <p className="text-sm text-gray-600">ID: {client._id}</p>
        </div>
      </div>

      <table className="w-full text-sm border mb-6">
              <tbody>
                  <tr>
                      <td className="p-2 border font-medium">First Name:</td>
                      <td className="p-2 border">
                          <input
                              value={client.firstName || ''}
                              onChange={(e) => handleChange('firstName', e.target.value)}
                              className="w-full border px-2 py-1"
                          />
                      </td>
                  </tr>
                  <tr>
                      <td className="p-2 border font-medium">Last Name:</td>
                      <td className="p-2 border">
                          <input
                              value={client.lastName || ''}
                              onChange={(e) => handleChange('lastName', e.target.value)}
                              className="w-full border px-2 py-1"
                          />
                      </td>
                  </tr>
                  <tr>
                      <td className="p-2 border font-medium">Nickname!:</td>
                      <td className="p-2 border">
                          <input
                              value={client.nickname || ''}
                              onChange={(e) => handleChange('nickname', e.target.value)}
                              className="w-full border px-2 py-1"
                          />
                      </td>
                  </tr>

          <tr>
            <td className="p-2 border font-medium">Phone:</td>
            <td className="p-2 border">
              <input value={client.phone || ''} onChange={(e) => handleChange('phone', e.target.value)} className="w-full border px-2 py-1" />
            </td>
          </tr>
          <tr>
            <td className="p-2 border font-medium">Email:</td>
            <td className="p-2 border">
              <input value={client.email || ''} onChange={(e) => handleChange('email', e.target.value)} className="w-full border px-2 py-1" />
            </td>
          </tr>
          <tr>
            <td className="p-2 border font-medium">Date of Birth:</td>
            <td className="p-2 border">
            <input type="date" value={client.dob || ''}
                              onChange={(e) => handleChange('dob', e.target.value)}
                              className="w-full border px-2 py-1"/>
            </td>
          </tr>
          <tr>
            <td className="p-2 border font-medium">Visit Frequency:</td>
            <td className="p-2 border">
              <input value={client.visitFrequency || ''} onChange={(e) => handleChange('visitFrequency', e.target.value)} className="w-full border px-2 py-1" />
            </td>
          </tr>
          <tr>
            <td className="p-2 border font-medium">Next Appointment:</td>
            <td className="p-2 border">
              <input value={nextAppointment || 'N/A'} disabled className="w-full border bg-gray-100 px-2 py-1 text-gray-500" />
            </td>
          </tr>
          <tr>
            <td className="p-2 border font-medium">Service Preferences:</td>
            <td className="p-2 border">
                          <input
                              value={(client.servicePreferences?.services || []).join(', ')}
                              onChange={(e) =>
                                  handleChange('servicePreferences', {
                                      ...client.servicePreferences,
                                      services: e.target.value.split(',').map(p => p.trim())
                                  })
                              }
                              className="w-full border px-2 py-1"
                          />
            </td>
          </tr>
          <tr>
            <td className="p-2 border font-medium">Notes:</td>
            <td className="p-2 border">
              <textarea value={client.notes || ''} onChange={(e) => handleChange('notes', e.target.value)} className="w-full border px-2 py-1" rows={4} />
            </td>
          </tr>
          <tr>
            <td className="p-2 border font-medium">Payment Info:</td>
            <td className="p-2 border">
              <input value={client.paymentInfo || ''} onChange={(e) => handleChange('paymentInfo', e.target.value)} className="w-full border px-2 py-1" />
            </td>
          </tr>
        </tbody>
      </table>

      <button onClick={handleSave} disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded">
        {saving ? 'Saving...' : 'Save Changes'}
      </button>

      <h3 className="text-xl font-bold mt-8 mb-2">Appointment History</h3>
      <table className="w-full text-sm border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 border">Date</th>
            <th className="p-2 border">Time</th>
            <th className="p-2 border">Service</th>
            <th className="p-2 border">Status</th>
          </tr>
        </thead>
        <tbody>
          {appointments.length === 0 ? (
            <tr><td colSpan="4" className="p-2 text-center">No appointments found.</td></tr>
          ) : (
            appointments.map(appt => {
              const qualifiesForSpecial = shouldShowWorkerPromotion && doesAppointmentQualifyForSpecial(appt, promotionConfig);
              const specialBadgeText = qualifiesForSpecial ? getSpecialAppointmentBadgeText(appt, promotionConfig) : '';
              const serviceName = getAppointmentServiceName(appt);
              return (
                <tr key={appt._id}>
                  <td className="p-2 border">{appt.date}</td>
                  <td className="p-2 border">{appt.time}</td>
                  <td className="p-2 border">
                    <div>{serviceName}</div>
                    {qualifiesForSpecial && (
                      <span className="mt-1 inline-block rounded-full border border-amber-300 bg-amber-50 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                        {specialBadgeText}
                      </span>
                    )}
                  </td>
                  <td className="p-2 border capitalize">{appt.status}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
