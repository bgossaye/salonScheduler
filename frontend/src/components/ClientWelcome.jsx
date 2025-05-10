import React, { useState } from 'react';
import axios from 'axios';

export default function ClientWelcome({ onClientLoaded }) {
  const [step, setStep] = useState('phone'); // 'phone' | 'form'
  const [phone, setPhone] = useState('');
  const [error, setError] = useState('');
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    dob: '',
    email: '',
    phone: '',
    contactMethod: '',
    optInPromotions: false
  });

  const validatePhone = (num) => {
    const clean = num.replace(/\D/g, '');
    return clean.length === 10;
  };

  const handlePhoneSubmit = async () => {
    setError('');
    if (!validatePhone(phone)) {
      return setError('Please enter a valid 10-digit phone number.');
    }

    try {
      const res = await axios.get(`/api/clients?phone=${phone}`);
      if (res.data) {
        onClientLoaded(res.data);
      } else {
        setFormData(prev => ({ ...prev, phone }));
        setStep('form');
      }
    } catch (err) {
      console.error('❌ AXIOS ERROR:', err);
      setError('Unable to verify client. Try again later.');
    }
  };

  const handleFormSubmit = async () => {
    const { firstName, lastName, dob, email, phone, contactMethod, optInPromotions } = formData;

    if (!firstName || !lastName || !dob || !email || !validatePhone(phone)) {
      return setError('Please fill out all fields correctly.');
    }

    const fullName = `${firstName} ${lastName}`;
    const payload = {
      fullName,
      phone,
      email,
      dob,
      contactPreferences: {
        method: contactMethod,
        optInPromotions: optInPromotions || false
      }
    };

    try {
      const res = await axios.post('/api/clients', payload);
      onClientLoaded(res.data);
    } catch (err) {
      console.error('❌ Create client failed:', err);
      setError('Could not create client.');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
  };

  return (
    <div className="p-6 max-w-md mx-auto text-center">
      <h1 className="text-2xl font-bold mb-4">Welcome to Rakie Salon</h1>

      {step === 'phone' && (
        <>
          <p className="mb-4">Enter your phone number to continue</p>
          <input
            type="text"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="w-full p-2 border rounded mb-4"
            placeholder="Phone number"
          />
          <button
            onClick={handlePhoneSubmit}
            className="bg-blue-500 text-white px-4 py-2 rounded w-full"
          >
            Continue
          </button>
        </>
      )}

      {step === 'form' && (
        <>
          <p className="mb-4">New client? Please create your profile</p>
          <input name="firstName" placeholder="First name" onChange={handleChange} className="w-full p-2 border rounded mb-2" />
          <input name="lastName" placeholder="Last name" onChange={handleChange} className="w-full p-2 border rounded mb-2" />
          <input name="dob" type="date" placeholder="Date of Birth" onChange={handleChange} className="w-full p-2 border rounded mb-2" />
          <input name="email" placeholder="Email" onChange={handleChange} className="w-full p-2 border rounded mb-2" />
          <input name="phone" value={formData.phone} readOnly className="w-full p-2 border rounded mb-2 bg-gray-100 text-gray-500" />

          <label className="block text-left font-medium mt-4">Preferred Contact Method</label>
          <select name="contactMethod" onChange={handleChange} className="w-full p-2 border rounded mb-2">
            <option value="">Select</option>
            <option value="sms">SMS</option>
            <option value="email">Email</option>
            <option value="phone">Phone</option>
          </select>

          <label className="block text-left font-medium mt-2">
            <input
              type="checkbox"
              name="optInPromotions"
              checked={formData.optInPromotions}
              onChange={(e) =>
                setFormData(prev => ({
                  ...prev,
                  optInPromotions: e.target.checked
                }))
              }
            />
            <span className="ml-2">Opt-in for promotional messages</span>
          </label>

          <div className="flex gap-4 mt-6">
            <button onClick={() => setStep('phone')} className="w-1/2 bg-gray-500 text-white px-4 py-2 rounded">
              Back
            </button>
            <button onClick={handleFormSubmit} className="w-1/2 bg-green-600 text-white px-4 py-2 rounded">
              Create Profile
            </button>
          </div>
        </>
      )}

      {error && <p className="text-red-500 mt-4">{error}</p>}
    </div>
  );
}
