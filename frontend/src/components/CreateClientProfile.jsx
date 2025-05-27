import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import API from '../api';
import { toast } from 'react-toastify';
import logo from '../assets/RSlogo.jpg';

export default function CreateClientProfile() {
  const navigate = useNavigate();
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    dob: '',
    email: '',
    phone: '',
  });

  useEffect(() => {
    const storedPhone = sessionStorage.getItem('newPhone');
    if (storedPhone) {
      setForm(prev => ({ ...prev, phone: storedPhone }));
    }
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm(prev => ({ ...prev, [name]: value }));
  };

  const isValid = () => {
    return (
      form.firstName &&
      form.lastName &&
      /^\d{10}$/.test(form.phone)
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isValid()) {
      toast.warn('Please fill out all required fields correctly.');
      return;
    }

    const payload = {
      ...form,
      fullName: `${form.firstName} ${form.lastName}`,
      dob: form.dob || undefined,
      email: form.email || undefined,
    };

    try {
      console.log("Submitting client profile:", payload);
      const { data } = await API.post('/clients', payload);
      localStorage.setItem('client', JSON.stringify(data));
      sessionStorage.removeItem('newPhone');
      navigate('/schedule');
    } catch (err) {
      console.error('❌ Failed to create client:', err);
      toast.error('Something went wrong. Please try again.');
    }
  };

  const handleBack = () => {
    sessionStorage.removeItem('newPhone');
    navigate('../');
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-100 p-4">
      <img src={logo} alt="Rakie Salon Logo" className="w-24 h-24 mb-4" />

      <form
        onSubmit={handleSubmit}
        className="bg-white shadow-md rounded p-6 w-full max-w-md space-y-4"
      >
        <h1 className="text-xl font-semibold text-center">Create Your Profile</h1>

        <input
          name="firstName"
          placeholder="First Name"
          value={form.firstName}
          onChange={handleChange}
          required
          className="w-full border px-4 py-2 rounded"
        />

        <input
          name="lastName"
          placeholder="Last Name"
          value={form.lastName}
          onChange={handleChange}
          required
          className="w-full border px-4 py-2 rounded"
        />

        <input
          name="dob"
          type="date"
          value={form.dob}
          onChange={handleChange}
          className="w-full border px-4 py-2 rounded"
        />

        <input
          name="email"
          type="email"
          placeholder="Email"
          value={form.email}
          onChange={handleChange}
          className="w-full border px-4 py-2 rounded"
        />

        <input
          name="phone"
          placeholder="Phone (10 digits)"
          value={form.phone}
          onChange={handleChange}
          required
          className="w-full border px-4 py-2 rounded"
        />

        <button
          type="submit"
          className="w-full bg-blue-600 text-white py-2 rounded hover:bg-blue-700"
        >
          Submit
        </button>

        <button
          type="button"
          onClick={handleBack}
          className="w-full text-sm text-blue-500 hover:underline"
        >
          Back
        </button>
      </form>
    </div>
  );
}
