// AdminClients.jsx (with checkbox, bulk delete, and export CSV)
import React, { useState, useEffect } from 'react';
import axios from 'axios';
import API from '../../api';
import { toast } from 'react-toastify';
import { Link } from 'react-router-dom';
import Papa from 'papaparse';
import { useRef } from 'react';
import AppointmentFormModal from './AppointmentFormModal';
import { coercePhone10, isTenDigit, prettyPhone, toDigits } from '../../utils/phone';

const api = (API && typeof API.get === 'function')
  ? API
  : axios.create({
      baseURL: String(
        process.env.REACT_APP_API_URL ||
        process.env.REACT_APP_API_BASE ||
        '/api'
      ).replace(/\/*$/, '')
    });
 
export default function AdminClients() {
  const [apptModalOpen, setApptModalOpen] = useState(false);
  const [selectedClient, setSelectedClient] = useState(null);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [newClient, setNewClient] = useState({ firstName: '', lastName: '', phone: '', email: '' });
  const [selectedIds, setSelectedIds] = useState([]);

  useEffect(() => {
    fetchClients();
  }, [search]);

const fetchClients = async () => {
    try {
      const { data } = await api.get('/admin/clients', { params: { search } });
      setClients(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('fetchClients failed:', err?.response?.data || err?.message || err);
      setClients([]);
      toast.error(err?.response?.data?.error || 'Failed to load clients');
    }
  };

const handleImportCSV = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        complete: async function (results) {
            const importedClients = results.data.map((row) => ({
                firstName: row["First Name"]?.trim() || '',
                lastName: row["Last Name"]?.trim() || '',
                phone: coercePhone10(row["Phone"]?.trim() || ''),
                email: row["Email"]?.trim() || '',
                dob: row["DOB"]?.trim() || '',
                notes: row["Notes"]?.trim() || '',
                visitFrequency: row["Visit Frequency"]?.trim() || '',
                servicePreferences: {
                    services: row["Service Preferences"]?.split(',').map(s => s.trim()) || []
                },
                paymentInfo: row["Payment Info"]?.trim() || '',
                contactPreferences: {
                    optInPromotions: row["Receive SMS"]?.toLowerCase() === 'true',
                    emailDisabled: row["Receive Email"]?.toLowerCase() === 'false' ? true : false
                }
            }));

            for (const client of importedClients) {
                try {
                    if (!client.firstName || !client.lastName || !client.phone) {
                        console.warn("⚠️ Skipped invalid client:", client);
                        continue;
                    }
                    const res = await api.post('/admin/clients', client);
                    console.log("✅ Imported:", res.data);
                } catch (err) {
                    console.error("❌ Failed to import:", client, err.response?.data || err.message);
                }
            }

            toast.success('Clients imported successfully!');
            fetchClients();
        },
        error: function (err) {
            console.error('❌ Parse error:', err);
            toast.error('Failed to parse CSV.');
        }
    });
};


  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this client?')) {
      try {
        await api.delete(`/admin/clients/${id}`);
        fetchClients();
      } catch (err) {
        toast.error('Failed to delete client');
      }
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm('Delete selected clients?')) return;
    try {
      await Promise.all(selectedIds.map(id => api.delete(`/admin/clients/${id}`)));
      toast.success("Selected clients deleted.");
      setSelectedIds([]);
      fetchClients();
    } catch {
      toast.error("Failed to delete selected clients.");
    }
  };

  // ─── Admin PIN controls ──────────────────────────────────
  const handleUnlockPin = async (id) => {
    try {
      await api.post(`/admin/clients/${id}/pin/unlock`);
      toast.success('PIN unlocked');
    } catch {
      toast.error('Failed to unlock PIN');
    }
  };

  const handleSetPin = async (id) => {
    const newPin = window.prompt('Enter new 4-digit PIN');
    if (!newPin) return;
    if (!/^\d{4}$/.test(newPin)) return toast.warning('PIN must be 4 digits');
    try {
      await api.patch(`/admin/clients/${id}/pin/reset`, { newPin });
      toast.success('PIN updated');
    } catch {
      toast.error('Failed to update PIN');
    }
  };

  const handleSendResetOtp = async (id) => {
    try {
      await api.post(`/admin/clients/${id}/pin/send-reset-otp`);
      toast.success('Reset code sent');
    } catch (err) {
      const status = err?.response?.status;
      const message = err?.response?.data?.error || (status === 401 ? 'Unauthorized. Please log out and sign back in as admin.' : 'Failed to send reset code');
      toast.error(message);
    }
  };

  const handleAddClient = async () => {
    const { firstName, lastName, phone, email } = newClient;
    if (!firstName || !lastName || !phone) {
      toast.warning("First name, last name, and phone are required.");
      return;
    }
    if (!isTenDigit(phone)) {
      toast.warning("Enter a valid 10-digit US phone number.");
      return;
    }
    try {
	const payload = {
        firstName: newClient.firstName,
        lastName: newClient.lastName,
        phone: newClient.phone,
        email: newClient.email
      };
      if (newClient.email?.trim()) {
        payload.email = newClient.email.trim();
      }
      const res = await api.post('/admin/clients', payload);

      toast.success("Client added!");
      setNewClient(payload);
      setNewClient({ firstName: '', lastName: '', phone: '', email: '' });

      fetchClients();
    } catch (err) {
      const existingClient = err?.response?.data?.existingClient;
      if (err?.response?.status === 409 && existingClient?._id) {
        toast.info('A client with that phone already exists. Opening the existing record instead.');
        setNewClient({ firstName: '', lastName: '', phone: '', email: '' });
        fetchClients();
        return;
      }
      toast.error(err?.response?.data?.error || "Failed to add client.");
    }
  };

  const handleCheck = (id) => {
    setSelectedIds(prev => prev.includes(id) ? prev.filter(_id => _id !== id) : [...prev, id]);
  };

  const handleCheckAll = () => {
    if (selectedIds.length === clients.length) {
      setSelectedIds([]);
    } else {
      setSelectedIds(clients.map(c => c._id));
    }
  };

const handleSaveAppointment = async (form) => {
  try {
    await api.post('/admin/appointments', form);
    toast.success('Appointment scheduled!');
    setApptModalOpen(false);
    setSelectedClient(null);
  } catch (err) {
    toast.error('Failed to schedule appointment');
  }
};

  const handleExportCSV = () => {
    const headers = ['First Name', 'Last Name', 'Phone', 'Email'];
    const rows = clients.map(c => [c.firstName, c.lastName, c.phone, c.email]);
    const csv = [headers, ...rows].map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'clients.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

    const fileInputRef = useRef(null);
  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Clients</h2>

      {/* Add New Client Form */}
      <div className="mb-6 space-y-2">
        <h3 className="font-semibold">Add New Client</h3>
        <div className="flex gap-2 flex-wrap">
          <input type="text" placeholder="First Name" className="border px-2 py-1"
            value={newClient.firstName} onChange={(e) => setNewClient({ ...newClient, firstName: e.target.value })} />
          <input type="text" placeholder="Last Name" className="border px-2 py-1"
            value={newClient.lastName} onChange={(e) => setNewClient({ ...newClient, lastName: e.target.value })} />

 <input
   type="tel"
   inputMode="numeric"
   placeholder="Phone (10 digits)"
   className="border px-2 py-1"
   value={newClient.phone}
   onChange={(e) => setNewClient({ ...newClient, phone: coercePhone10(e.target.value) })}
   maxLength={10}              
   aria-invalid={!!newClient.phone && !isTenDigit(newClient.phone)}
 />
          <input type="email" placeholder="Email (optional)" className="border px-2 py-1"
            value={newClient.email} onChange={(e) => setNewClient({ ...newClient, email: e.target.value })} />
          <button className="bg-green-600 text-white px-3 py-1 rounded" onClick={handleAddClient}>Add Client</button>
        </div>
      </div>

      {/* Bulk Actions */}
      <div className="flex gap-4 mb-4">
        <button className="bg-red-600 text-white px-3 py-1 rounded" onClick={handleBulkDelete}>
          Delete Selected
        </button>
        <button className="bg-blue-600 text-white px-3 py-1 rounded" onClick={handleExportCSV}>
          Export CSV
              </button>
              <button
                  onClick={() => fileInputRef.current.click()}
                  className="bg-purple-600 text-white px-3 py-1 rounded"
              >
                  Import CSV
              </button>
              <input
                  type="file"
                  accept=".csv"
                  onChange={handleImportCSV}
                  ref={fileInputRef}
                  className="hidden"
              />

      </div>

      {/* Search and Table */}
      <input placeholder="Search by name or phone" className="border px-2 py-1 mb-4"
        value={search} onChange={(e) => setSearch(e.target.value)} />

      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 border">
              <input type="checkbox" checked={selectedIds.length === clients.length}
                onChange={handleCheckAll} />
            </th>
            <th className="p-2 border">Name</th>
            <th className="p-2 border">Phone</th>
            <th className="p-2 border">Actions</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c._id}>
              <td className="p-2 border text-center">
                <input type="checkbox" checked={selectedIds.includes(c._id)}
                  onChange={() => handleCheck(c._id)} />
              </td>
<td className="p-2 border">
  {([c.firstName, c.lastName].filter(Boolean).join(' ') || 'N/A')}
  {c.nickname && (
    <span className="ml-1 text-gray-500 italic">
      ({c.nickname})
    </span>
  )}
</td>

                  <td className="p-2 border">{c.phone}</td>
		<td className="p-2 border flex gap-2 items-center">
		<Link to={`../client/${c._id}`} className="text-blue-600 hover:text-blue-800" title="Edit"> ✏️ </Link>
		<button onClick={() => handleDelete(c._id)} className="text-red-600 hover:text-red-800" title="Delete">🗑️</button>
		<button onClick={() => { setSelectedClient(c); setApptModalOpen(true); }} className="text-green-600 hover:text-green-800" title="Schedule Appointment">📅 </button>
                <button onClick={() => handleUnlockPin(c._id)} className="text-yellow-700 hover:text-yellow-900" title="Unlock PIN">🔓</button>
                <button onClick={() => handleSetPin(c._id)} className="text-indigo-700 hover:text-indigo-900" title="Set PIN">🔑</button>
                <button onClick={() => handleSendResetOtp(c._id)} className="text-purple-700 hover:text-purple-900" title="Send PIN Help Text">📨</button>
		
</td>

            </tr>
          ))}
        </tbody>
      </table>
<AppointmentFormModal
  isOpen={apptModalOpen}
  onClose={() => {
    setApptModalOpen(false);
    setSelectedClient(null);
  }}
  onSave={async (form) => {
    try {
      await api.post('/admin/appointments', form);
      toast.success("Appointment scheduled!");
      setApptModalOpen(false);
      setSelectedClient(null);
    } catch {
      toast.error("Failed to schedule appointment");
    }
  }}
  initialData={selectedClient ? { clientId: selectedClient } : null}
/>
    </div>

  );
}
