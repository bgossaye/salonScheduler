import React, { useState, useEffect } from 'react';
import axios from 'axios';

export default function AdminServices() {
  const [services, setServices] = useState([]);
  const [form, setForm] = useState({
    name: '',
    category: '',
    price: '',
    duration: '',
    steps: [{ name: '', duration: '' }],
    suggestedAddOns: []
  });
  const [editingId, setEditingId] = useState(null);
  const [showAddOns, setShowAddOns] = useState(null);

  useEffect(() => {
    fetchServices();
  }, []);

  const fetchServices = async () => {
    const { data } = await axios.get('/api/admin/services');
    setServices(data);
  };

  const handleAddOrUpdate = async () => {
    const cleanedSteps = form.steps.filter(step => step.name.trim());
    const payload = { ...form, steps: cleanedSteps };

    if (editingId) {
      await axios.patch('/api/admin/services/' + editingId, payload);
    } else {
      await axios.post('/api/admin/services', payload);
    }

    setForm({ name: '', category: '', price: '', duration: '', steps: [{ name: '', duration: '' }], suggestedAddOns: [] });
    setEditingId(null);
    fetchServices();
  };

  const handleDelete = async (id) => {
    if (window.confirm('Are you sure?')) {
      await axios.delete('/api/admin/services/' + id);
      fetchServices();
    }
  };

  const handleEdit = (service) => {
    setForm({
      name: service.name,
      category: service.category,
      price: service.price,
      duration: service.duration,
      steps: service.steps?.map(step => ({ name: step.name, duration: step.duration })) || [{ name: '', duration: '' }],
      suggestedAddOns: service.suggestedAddOns?.map(a => a._id) || []
    });
    setEditingId(service._id);
  };

  const handleStepChange = (index, key, value) => {
    const newSteps = [...form.steps];
    newSteps[index][key] = value;
    setForm({ ...form, steps: newSteps });
  };

  const addStepField = () => {
    setForm({ ...form, steps: [...form.steps, { name: '', duration: '' }] });
  };

  const toggleAddOn = (id) => {
    setForm(prev => {
      const exists = prev.suggestedAddOns.includes(id);
      return {
        ...prev,
        suggestedAddOns: exists ? prev.suggestedAddOns.filter(a => a !== id) : [...prev.suggestedAddOns, id]
      };
    });
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Services</h2>

      <div className="mb-6 space-y-4">
        <h3 className="text-lg font-semibold">Service Edit Form</h3>
        <div className="grid grid-cols-4 gap-4 items-end">
          <div>
            <label className="block text-sm font-medium mb-1">Service:</label>
            <input
              value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Service"
              className="border px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Category:</label>
            <input
              value={form.category}
              onChange={e => setForm({ ...form, category: e.target.value })}
              placeholder="Category"
              className="border px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Price:</label>
            <input
              value={form.price}
              onChange={e => setForm({ ...form, price: e.target.value })}
              placeholder="Price"
              className="border px-2 py-1 w-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Duration (min):</label>
            <input
              value={form.duration}
              onChange={e => setForm({ ...form, duration: e.target.value })}
              placeholder="Duration"
              className="border px-2 py-1 w-full"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 mt-4">Steps:</label>
          {form.steps.map((step, index) => (
            <div key={index} className="grid grid-cols-2 gap-2 mb-1">
              <input
                value={step.name}
                onChange={e => handleStepChange(index, 'name', e.target.value)}
                placeholder={`Step ${index + 1}`}
                className="border px-2 py-1 w-full"
              />
              <input
                type="number"
                value={step.duration}
                onChange={e => handleStepChange(index, 'duration', e.target.value)}
                placeholder="Min"
                className="border px-2 py-1 w-full"
              />
            </div>
          ))}
          <button onClick={addStepField} className="text-sm text-blue-600 mt-1">+ Add Step</button>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1 mt-4">Suggested Add-ons:</label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
            {services.map(s => (
              <label key={s._id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={form.suggestedAddOns.includes(s._id)}
                  onChange={() => toggleAddOn(s._id)}
                />
                {s.name}
              </label>
            ))}
          </div>
        </div>

        <button onClick={handleAddOrUpdate} className="bg-blue-500 text-white px-4 py-2 rounded mt-4">
          {editingId ? 'Update' : 'Add'}
        </button>
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
          {services.map((s) => (
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
    </div>
  );
}
