import React, { useState, useEffect } from 'react';
import API from '../../api';
import { toast } from 'react-toastify';

export default function AdminClients() {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [newClient, setNewClient] = useState({ firstName: '', lastName: '', phone: '', email: '' });

  useEffect(() => {
    fetchClients();
  }, [search]);

  const fetchClients = async () => {
    const { data } = await API.get('/admin/clients', { params: { search } });
    setClients(data);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure you want to delete this client?')) {
      try {
        await API.delete(`/admin/clients/${id}`);
        fetchClients();
      } catch (err) {
        toast.error('Failed to delete client');
      }
    }
  };

  const handleAddClient = async () => {
    const { firstName, lastName, phone, email } = newClient;
    if (!firstName || !lastName || !phone) {
      toast.warning("First name, last name, and phone are required.");
      return;
    }
    try {
      await API.post('/admin/clients', {
        firstName,
        lastName,
        phone,
        email
      });
      toast.success("Client added!");
      setNewClient({ firstName: '', lastName: '', phone: '', email: '' });
      fetchClients();
    } catch (err) {
      toast.error("Failed to add client.");
    }
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Clients</h2>

      {/* Add New Client Form */}
      <div className="mb-6 space-y-2">
        <h3 className="font-semibold">Add New Client</h3>
        <div className="flex gap-2 flex-wrap">
          <input
            type="text"
            placeholder="First Name"
            className="border px-2 py-1"
            value={newClient.firstName}
            onChange={(e) => setNewClient({ ...newClient, firstName: e.target.value })}
          />
          <input
            type="text"
            placeholder="Last Name"
            className="border px-2 py-1"
            value={newClient.lastName}
            onChange={(e) => setNewClient({ ...newClient, lastName: e.target.value })}
          />
          <input
            type="text"
            placeholder="Phone"
            className="border px-2 py-1"
            value={newClient.phone}
            onChange={(e) => setNewClient({ ...newClient, phone: e.target.value })}
          />
          <input
            type="email"
            placeholder="Email (optional)"
            className="border px-2 py-1"
            value={newClient.email}
            onChange={(e) => setNewClient({ ...newClient, email: e.target.value })}
          />
          <button
            className="bg-green-600 text-white px-3 py-1 rounded"
            onClick={handleAddClient}
          >
            Add Client
          </button>
        </div>
      </div>

      {/* Search and Table */}
      <input
        placeholder="Search by name or phone"
        className="border px-2 py-1 mb-4"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 border">Name</th>
            <th className="p-2 border">Phone</th>
            <th className="p-2 border">Email</th>
            <th className="p-2 border">Actions</th>
          </tr>
        </thead>
        <tbody>
          {clients.map((c) => (
            <tr key={c._id}>
              <td className="p-2 border">{c.fullName}</td>
              <td className="p-2 border">{c.phone}</td>
              <td className="p-2 border">{c.email}</td>
              <td className="p-2 border flex gap-2 items-center">
                <a href={`./client/${c._id}`} className="text-blue-600 hover:text-blue-800" title="Edit">✏️</a>
                <button
                  onClick={() => handleDelete(c._id)}
                  className="text-red-600 hover:text-red-800"
                  title="Delete"
                >
                  🗑️
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
