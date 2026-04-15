import React, { useState, useEffect, useMemo } from 'react';
import API from '../../api';
import ServiceFormModal from './AdminServiceFormModal';

export default function AdminServices() {
  const [services, setServices] = useState([]);
  const [editingService, setEditingService] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showAddOns, setShowAddOns] = useState(null);

  useEffect(() => { fetchServices(); }, []);

  const fetchServices = async () => {
    const { data } = await API.get('/admin/services');
    setServices(data);
  };

  const handleEdit = (service) => {
    setEditingService(service);
    setShowForm(true);
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure?')) {
      await API.delete(`/admin/services/${id}`);
      fetchServices();
    }
  };

  const handleFormSave = () => {
    setShowForm(false);
    setEditingService(null);
    fetchServices();
  };

  // Derived: sorted by Category (A→Z), then order (asc), then name (A→Z)
  const sortedServices = useMemo(() => {
    const addOnRx = /add[\s\u2010-\u2015-]*ons?/i; // treat "Add-ons" as a category variant
    return [...services].sort((a, b) => {
      const ca = a.category || '';
      const cb = b.category || '';
      // push Add-ons to the very bottom
      const aIs = addOnRx.test(ca);
      const bIs = addOnRx.test(cb);
      if (aIs && !bIs) return 1;
      if (!aIs && bIs) return -1;

      const catCmp = ca.localeCompare(cb, undefined, { sensitivity: 'base' });
      if (catCmp) return catCmp;

      const ordCmp = (a.order ?? 0) - (b.order ?? 0);
      if (ordCmp) return ordCmp;

      return (a.name || '').localeCompare((b.name || ''), undefined, { sensitivity: 'base' });
    });
  }, [services]);

  // NEW: Download all services as JSON (client-side)
  const handleDownloadJSON = () => {
    const cleaned = services.map(s => {
      const priceNum = typeof s.price === 'number'
        ? s.price
        : Number(String(s.price || '0').replace(/[^0-9.]/g, '')) || 0;

      return {
        _id: s._id,
        name: s.name,
        slug: s.slug,
        category: s.category,
        price: priceNum,
        priceCents: Math.round(priceNum * 100),
        duration: s.duration,
        steps: s.steps?.map(st => ({ name: st.name, duration: st.duration })) || [],
        suggestedAddOns: s.suggestedAddOns?.map(a => ({ _id: a._id, name: a.name })) || [],
        active: s.active ?? true,
        order: s.order ?? 0,
      };
    });

    const payload = {
      exportedAt: new Date().toISOString(),
      count: cleaned.length,
      services: cleaned,
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10);
    a.href = url;
    a.download = `services-${date}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4">
      {/* Header with Create + Download JSON */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
        <h2 className="text-xl font-bold">Services</h2>
        <div className="flex gap-2">
          <button
            onClick={handleDownloadJSON}
            className="px-4 py-2 rounded bg-slate-700 text-white hover:brightness-110"
            title="Download all services as JSON"
          >
            ⬇️ Download JSON
          </button>
          <button
            onClick={() => { setEditingService(null); setShowForm(true); }}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            + Create
          </button>
        </div>
      </div>

      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 border">Name</th>
            <th className="p-2 border">Category</th>
            <th className="p-2 border">Price</th>
            <th className="p-2 border">Duration</th>
            <th className="p-2 border">Steps</th>
            <th className="p-2 border">Add-ons</th>
            <th className="p-2 border">Actions</th>
          </tr>
        </thead>
        <tbody>
          {sortedServices.map((s) => (
            <tr key={s._id}>
              <td className="p-2 border">{s.name}</td>
              <td className="p-2 border">{s.category}</td>
              <td className="p-2 border">${s.price}</td>
              <td className="p-2 border">{s.duration} min</td>
              <td className="p-2 border">
                <ul className="list-disc list-inside text-sm">
                  {s.steps?.map((step, idx) => (
                    <li key={idx}>{step.name} ({step.duration} min)</li>
                  )) || '—'}
                </ul>
              </td>
              <td className="p-2 border text-sm">
                <button
                  onClick={() => setShowAddOns(showAddOns === s._id ? null : s._id)}
                  className="text-blue-600 hover:underline"
                >
                  {showAddOns === s._id ? 'Hide' : 'View'}
                </button>
                {showAddOns === s._id && (
                  <ul className="mt-1 list-disc list-inside">
                    {s.suggestedAddOns?.length > 0
                      ? s.suggestedAddOns.map(a => <li key={a._id}>{a.name}</li>)
                      : <li className="text-gray-400 italic">None</li>}
                  </ul>
                )}
              </td>
              <td className="p-2 border space-x-2">
                <button onClick={() => handleEdit(s)} className="text-blue-600">✏️</button>
                <button onClick={() => handleDelete(s._id)} className="text-red-600">🗑</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {showForm && (
        <ServiceFormModal
          service={editingService}
          onClose={() => setShowForm(false)}
          onSave={handleFormSave}
          allServices={services}
        />
      )}
    </div>
  );
}
