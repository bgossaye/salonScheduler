import React, { useState, useEffect } from 'react';
import API from '../../api';

export default function AdminClients() {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    fetchClients();
  }, [search]);

  const fetchClients = async () => {
    const { data } = await API.get('/admin/clients', {
      params: { search },
    });
    setClients(data);
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Clients</h2>
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
              <td className="p-2 border">
                <a href={`/admin/client/${c._id}`} className="text-blue-600">View</a>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
