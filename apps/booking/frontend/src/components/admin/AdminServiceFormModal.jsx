import React, { useState, useEffect } from 'react';
import API from '../../api';
import { toast } from 'react-toastify';

export default function ServiceFormModal({ service, onClose, onSave, allServices }) {
  const isEdit = !!service;
  const [form, setForm] = useState({
    name: '',
    category: '',
    price: '',
    duration: '',
    steps: [],
    suggestedAddOns: [],
    isAddOn: false
  });

  const [allAddOns, setAllAddOns] = useState([]);
  const [stepInput, setStepInput] = useState({ name: '', duration: '' });
  const [error] = useState('');

  useEffect(() => {
    if (isEdit && service) {
      setForm({
        name: service.name || '',
        category: service.category || '',
        price: service.price || '',
        duration: service.duration || '',
        steps: service.steps || [],
        suggestedAddOns: (service.suggestedAddOns || []).map(a => a._id || a),
        isAddOn: service.isAddOn || false
      });
    }
    fetchAddOns();
  }, [service]);

  const fetchAddOns = async () => {
    try {
      const { data } = await API.get('/admin/services?isAddOn=true');
      setAllAddOns(data);
    } catch (err) {
      console.error('Failed to load add-ons');
    }
  };

  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setForm(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleStepAdd = () => {
    if (!stepInput.name || !stepInput.duration) return;
    setForm(prev => ({
      ...prev,
      steps: [...prev.steps, stepInput]
    }));
    setStepInput({ name: '', duration: '' });
  };

  const handleStepRemove = idx => {
    const steps = [...form.steps];
    steps.splice(idx, 1);
    setForm(prev => ({ ...prev, steps }));
  };

  const handleAddOnToggle = (addOnId) => {
    setForm(prev => {
      const exists = prev.suggestedAddOns.includes(addOnId);
      return {
        ...prev,
        suggestedAddOns: exists
          ? prev.suggestedAddOns.filter(id => id !== addOnId)
          : [...prev.suggestedAddOns, addOnId]
      };
    });
  };

  const handleSubmit = async () => {
    try {
      const payload = { ...form };
      if (payload.category === '__custom') {
        payload.category = form.customCategory || '';
      }
      if (isEdit) {
        await API.put(`/admin/services/${service._id}`, payload);
        toast.success('Service updated');
      } else {
        await API.post('/admin/services', payload);
        toast.success('Service created');
      }
      onSave();
    } catch (err) {
      console.error(err);
      toast.error('Failed to save service');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-4">{isEdit ? 'Edit Service' : 'New Service'}</h3>

        <label className="block mb-2">
          <span className="block font-medium">Service Name</span>
          <input name="name" value={form.name} onChange={handleChange}
  className= {`w-full border p-2 ${error && !form.date ? 'bg-yellow-100 border-yellow-400' : ''}`}
 />
        </label>

        <label className="block mb-2">
          <span className="block font-medium">Category</span>
          <select
            name="category"
            value={form.category}
            onChange={handleChange}
            className={`w-full border p-2 mb-2 ${error && !form.category ? 'bg-yellow-100 border-yellow-400' : ''}`}
          >
            <option value="">Select category</option>
            {[...new Set(allServices.map(s => s.category).filter(Boolean))].map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
            <option value="__custom">Other</option>
          </select>

          {form.category === '__custom' && (
            <input
              name="customCategory"
              placeholder="Enter new category"
              value={form.customCategory || ''}
              onChange={e => setForm(prev => ({ ...prev, customCategory: e.target.value }))}
              className={`w-full border p-2 ${error && !form.customCategory ? 'bg-yellow-100 border-yellow-400' : ''}`}
            />
          )}
        </label>

        <div className="flex gap-2 mb-2">
          <input name="price" value={form.price} onChange={handleChange} placeholder="Price" type="number" 
  className={`w-full border p-2 w-1/2 ${error && !form.date ? 'bg-yellow-100 border-yellow-400' : ''}`}
/>
          <input name="duration" value={form.duration} onChange={handleChange} placeholder="Duration (min)" type="number"  className={`w-full border p-2 w-1/2 ${error && !form.date ? 'bg-yellow-100 border-yellow-400' : ''}`}
/>
        </div>

        <label className="block mb-4">
          <input
            type="checkbox"
            name="isAddOn"
            checked={form.isAddOn}
            onChange={handleChange}
            className="mr-2"
          />
          <span className="text-sm">Mark this service as an add-on</span>
        </label>

        <div className="mt-2">
          <h4 className="font-semibold mb-1">Steps</h4>
          <div className="flex gap-2 mb-2">
            <input value={stepInput.name} onChange={e => setStepInput(prev => ({ ...prev, name: e.target.value }))} placeholder="Step name" className="border p-2 w-1/2" />
            <input value={stepInput.duration} onChange={e => setStepInput(prev => ({ ...prev, duration: e.target.value }))} placeholder="Duration" type="number" className="border p-2 w-1/2" />
            <button onClick={handleStepAdd} className="bg-green-500 text-white px-3 rounded">+</button>
          </div>
          <ul className="list-disc pl-5 text-sm">
            {form.steps.map((step, idx) => (
              <li key={idx} className="flex justify-between items-center">
                {step.name} ({step.duration} min)
                <button onClick={() => handleStepRemove(idx)} className="text-red-500 ml-2">✖</button>
              </li>
            ))}
          </ul>
        </div>

        {!form.isAddOn && allAddOns.length > 0 && (
          <div className="mt-4">
            <h4 className="font-semibold text-sm">Suggested Add-ons</h4>
            <div className="grid grid-cols-2 gap-1">
              {allAddOns.map(a => (
                <label key={a._id} className="text-sm">
                  <input
                    type="checkbox"
                    checked={form.suggestedAddOns.includes(a._id)}
                    onChange={() => handleAddOnToggle(a._id)}
                    className="mr-2"
                  />
                  {a.name} ({a.duration} min)
                </label>
              ))}
            </div>
          </div>
        )}

        <div className="flex justify-end mt-6 space-x-2">
          <button onClick={onClose} className="bg-gray-400 text-white px-4 py-2 rounded">Cancel</button>
          <button onClick={handleSubmit} className="bg-blue-600 text-white px-4 py-2 rounded">{isEdit ? 'Update' : 'Create'}</button>
        </div>
      </div>
    </div>
  );
}
