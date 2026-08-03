import React, { useState, useEffect } from 'react';
import API from '../../api';
import { toast } from 'react-toastify';

const blankServiceForm = {
  name: '',
  category: '',
  price: '',
  startingPrice: '',
  duration: '',
  requiresChemicalPermission: false,
  active: true,
  steps: [],
  suggestedAddOns: [],
  isAddOn: false,
  bookableAsSeparateOnline: true
};

export default function ServiceFormModal({ service, onClose, onSave, allServices = [] }) {
  const isEdit = !!service;
  const [form, setForm] = useState({ ...blankServiceForm });

  const [allAddOns, setAllAddOns] = useState([]);
  const [stepInput, setStepInput] = useState({ name: '', duration: '' });
  const [formErrors, setFormErrors] = useState({});

  useEffect(() => {
    if (service) {
      setForm({
        ...blankServiceForm,
        name: service.name || '',
        category: service.category || '',
        price: service.price || '',
        startingPrice: service.startingPrice ?? '',
        duration: service.duration || '',
        requiresChemicalPermission: !!service.requiresChemicalPermission,
        active: service.active !== false,
        steps: service.steps || [],
        suggestedAddOns: (service.suggestedAddOns || []).map(a => a._id || a),
        isAddOn: service.isAddOn || false,
        bookableAsSeparateOnline: service.bookableAsSeparateOnline !== false
      });
    } else {
      setForm({ ...blankServiceForm });
    }

    const fetchAddOns = async () => {
      try {
        const { data } = await API.get('/admin/services?isAddOn=true');
        setAllAddOns(data);
      } catch (err) {
        console.error('Failed to load add-ons');
      }
    };

    fetchAddOns();
  }, [service]);

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

  const validateForm = () => {
    const nextErrors = {};
    const category = form.category === '__custom' ? (form.customCategory || '').trim() : (form.category || '').trim();
    const price = Number(form.price);
    const duration = Number(form.duration);

    if (!form.name?.trim()) nextErrors.name = 'Service name is required';
    if (!category) nextErrors.category = 'Category is required';
    if (form.price === '' || form.price === null || form.price === undefined || !Number.isFinite(price) || price < 0) {
      nextErrors.price = 'Price is required';
    }
    if (form.duration === '' || form.duration === null || form.duration === undefined || !Number.isInteger(duration) || duration < 1) {
      nextErrors.duration = 'Duration is required';
    }

    form.steps.forEach((step, idx) => {
      if (!String(step?.name || '').trim()) nextErrors[`steps.${idx}.name`] = 'Step name is required';
      const stepDuration = Number(step?.duration);
      if (!Number.isFinite(stepDuration) || stepDuration < 1) nextErrors[`steps.${idx}.duration`] = 'Step duration must be at least 1 minute';
    });

    setFormErrors(nextErrors);
    return nextErrors;
  };

  const fieldClass = (field) => `w-full border p-2 ${formErrors[field] ? 'bg-yellow-100 border-yellow-400' : ''}`;

  const handleSubmit = async () => {
    const nextErrors = validateForm();
    if (Object.keys(nextErrors).length) {
      toast.error('Please complete the required service fields.');
      return;
    }

    try {
      const payload = {
        ...form,
        name: form.name.trim(),
        category: form.category === '__custom' ? (form.customCategory || '').trim() : form.category.trim(),
        price: Number(form.price),
        duration: Number(form.duration),
        startingPrice: form.startingPrice === '' || form.startingPrice === null || form.startingPrice === undefined
          ? null
          : Number(form.startingPrice),
        steps: (form.steps || []).map(step => ({
          name: String(step.name || '').trim(),
          duration: Number(step.duration),
        })),
      };
      delete payload.customCategory;

      if (isEdit) {
        await API.put(`/admin/services/${service._id}`, payload);
        toast.success('Service updated');
      } else {
        await API.post('/admin/services', payload);
        toast.success('Service created');
      }
      setFormErrors({});
      onSave();
    } catch (err) {
      console.error(err);
      const fields = err?.response?.data?.fields;
      if (fields && typeof fields === 'object') setFormErrors(fields);
      toast.error(err?.response?.data?.error || 'Failed to save service');
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex justify-center items-center z-50">
      <div className="bg-white p-6 rounded-lg shadow-md w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <h3 className="text-xl font-bold mb-4">{isEdit ? 'Edit Service' : 'New Service'}</h3>

        {Object.keys(formErrors).length > 0 && (
          <div className="mb-3 rounded border border-yellow-300 bg-yellow-50 p-3 text-sm text-yellow-800">
            Please fill in the highlighted required fields before saving the service.
          </div>
        )}

        <label className="block mb-2">
          <span className="block font-medium">Service Name</span>
          <input name="name" value={form.name} onChange={handleChange}
  className={fieldClass('name')}
 />
        </label>

        <label className="block mb-2">
          <span className="block font-medium">Category</span>
          <select
            name="category"
            value={form.category}
            onChange={handleChange}
            className={`${fieldClass('category')} mb-2`}
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
              className={fieldClass('category')}
            />
          )}
        </label>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 mb-2">
          <label className="block">
            <span className="block text-xs font-medium text-gray-600">Legacy/menu price</span>
            <input name="price" value={form.price} onChange={handleChange} placeholder="Rakeb/current price" type="number"
              className={fieldClass('price')}
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-600">Starting price optional</span>
            <input name="startingPrice" value={form.startingPrice} onChange={handleChange} placeholder="Display only" type="number"
              className="w-full border p-2"
            />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-600">Base duration</span>
            <input name="duration" value={form.duration} onChange={handleChange} placeholder="Duration (min)" type="number" className={fieldClass('duration')}
            />
          </label>
        </div>
        <p className="mb-3 text-xs text-gray-500">
          Current service price is preserved for old screens and is copied into Rakeb G’s worker-service price during migration. New bookings use the selected stylist’s worker price.
        </p>

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

        <label className="block mb-2">
          <input
            type="checkbox"
            name="requiresChemicalPermission"
            checked={form.requiresChemicalPermission}
            onChange={handleChange}
            className="mr-2"
          />
          <span className="text-sm">Requires chemical-service permission</span>
        </label>

        <label className="block mb-4">
          <input
            type="checkbox"
            name="active"
            checked={form.active}
            onChange={handleChange}
            className="mr-2"
          />
          <span className="text-sm">Active / show in booking menus</span>
        </label>

        {form.isAddOn && (
          <label className="block mb-4 rounded border border-blue-100 bg-blue-50 p-3">
            <input
              type="checkbox"
              name="bookableAsSeparateOnline"
              checked={form.bookableAsSeparateOnline !== false}
              onChange={handleChange}
              className="mr-2"
            />
            <span className="text-sm font-medium">Can also be booked separately online</span>
            <p className="mt-1 text-xs text-gray-600">
              Leave this ON for add-ons like Updo that clients may book by itself. Turn it OFF for internal fees or add-ons that only belong inside another service.
            </p>
          </label>
        )}

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
