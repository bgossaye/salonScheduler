import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function AdminClientManager() {
  const [clients, setClients] = useState([]);
  const [selectedClient, setSelectedClient] = useState(null);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchClients();
  }, []);

  const fetchClients = async () => {
    try {
      const res = await axios.get('/api/clients/all');
      setClients(res.data);
    } catch (err) {
      console.error('Failed to fetch clients:', err);
    }
  };

  const handleSave = async () => {
    try {
      await axios.put(`/api/clients/${selectedClient._id}`, selectedClient);
      alert('Client updated');
      fetchClients();
      setSelectedClient(null);
    } catch (err) {
      console.error('Update failed:', err);
    }
  };

  const filtered = clients.filter(c =>
    c.fullName.toLowerCase().includes(search.toLowerCase()) ||
    c.phone.includes(search)
  );

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Client Manager</h1>
      <input
        placeholder="Search by name or phone"
        className="border p-2 mb-4 w-full"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="grid grid-cols-3 gap-4">
        {filtered.map(client => (
          <div key={client._id} className="border p-4 rounded shadow">
            <h2 className="font-semibold">{client.fullName}</h2>
            <p>{client.phone}</p>
            <p>{client.email}</p>
            <button
              onClick={() => setSelectedClient(client)}
              className="text-blue-600 mt-2 underline"
            >
              Edit
            </button>
          </div>
        ))}
      </div>

      {selectedClient && (
        <div className="mt-8 p-4 border rounded bg-gray-50">
          <h2 className="text-xl font-bold mb-2">Edit Client: {selectedClient.fullName}</h2>
          <input
            className="w-full p-2 mb-2 border"
            value={selectedClient.fullName}
            onChange={(e) => setSelectedClient({ ...selectedClient, fullName: e.target.value })}
          />
          <input
            className="w-full p-2 mb-2 border"
            value={selectedClient.email}
            onChange={(e) => setSelectedClient({ ...selectedClient, email: e.target.value })}
          />
          <textarea
            className="w-full p-2 mb-2 border"
            placeholder="Special instructions"
            value={selectedClient.notes?.specialInstructions || ''}
            onChange={(e) =>
              setSelectedClient({
                ...selectedClient,
                notes: { ...selectedClient.notes, specialInstructions: e.target.value }
              })
            }
          />
          <div className="flex gap-4">
            <button
              onClick={handleSave}
              className="bg-green-600 text-white px-4 py-2 rounded"
            >
              Save Changes
            </button>
            <button
              onClick={() => setSelectedClient(null)}
              className="bg-gray-500 text-white px-4 py-2 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}