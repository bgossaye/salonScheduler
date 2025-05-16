import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import API from '../../api';

export default function AdminClientProfile() {
  const { id } = useParams();
  const fileInputRef = useRef();
  const [client, setClient] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [nextAppointment, setNextAppointment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetchClient();
  }, [id]);

  const fetchClient = async () => {
    try {
      const { data } = await API.get(`/admin/clients/${id}`);
      const clientData = data.client || data;
      setClient(clientData);

      const phone = clientData.phone;
      if (phone) {
        const apptRes = await API.get('/admin/appointments', { params: { client: phone } });
        const sorted = apptRes.data.sort((a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`));
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

  const handleChange = (field, value) => {
    setClient({ ...client, [field]: value });
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
    setSaving(true);
    try {
      await API.patch(`/admin/clients/${client._id}`, client);
      alert('Client profile updated.');
    } catch (err) {
      alert('Failed to save changes.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!client) return <div className="p-4">Client not found.</div>;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Client Profile</h2>

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
            {[client.fullName].filter(Boolean).join(' ') || 'N/A'}
          </h3>
          <p className="text-sm text-gray-600">ID: {client._id}</p>
        </div>
      </div>

      <table className="w-full text-sm border mb-6">
        <tbody>
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
              <input type="date" value={client.dob || ''} onChange={(e) => handleChange('dob', e.target.value)} className="w-full border px-2 py-1" />
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
              <input value={(client.preferences || []).join(', ')} onChange={(e) => handleChange('preferences', e.target.value.split(',').map(p => p.trim()))} className="w-full border px-2 py-1" />
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
            appointments.map(appt => (
              <tr key={appt._id}>
                <td className="p-2 border">{appt.date}</td>
                <td className="p-2 border">{appt.time}</td>
                <td className="p-2 border">{appt.serviceId?.name || appt.service || 'N/A'}</td>
                <td className="p-2 border capitalize">{appt.status}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
