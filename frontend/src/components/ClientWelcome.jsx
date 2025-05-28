import React, { useState, useEffect, useRef } from 'react';
import API from '../api';
import { toast } from 'react-toastify';
import logo from '../assets/RSlogo.jpg';

export default function ClientWelcome({ client, onClientLoaded }) {
  const [phone, setPhone] = useState('');
  const [localClient, setLocalClient] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    API.get('/ping')
      .then(() => console.log('✅ MongoDB awake'))
      .catch(err => console.warn('⚠️ MongoDB wake-up failed:', err));

  const saved = localStorage.getItem('client');
  console.log("📦 Raw client from storage:", saved);
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      console.log("✅ Parsed client:", parsed);
      if (parsed && parsed._id && parsed.fullName) {
        setClient(parsed);
      } else {
        console.warn("⚠️ Incomplete client object:", parsed);
        localStorage.removeItem('client');
      }
    } catch (e) {
      console.error("❌ JSON parse failed", e);
      localStorage.removeItem('client');
    }
  }
  }, []);

  useEffect(() => {
    if (client?.phone) {
      setPhone(client.phone);
      setLocalClient(client);
      console.log('📦 Local client pre-filled:', client);
    }
    if (inputRef.current) {
      inputRef.current.focus();
    }
  }, [client]);

  const isValidPhone = (value) => {
    return /^\d{10}$/.test(value);
  };

  const handleSubmit = async () => {
    if (!isValidPhone(phone)) {
      toast.warn('Please enter a valid 10-digit phone number.');
      return;
    }

    setIsLoading(true);

    if (localClient?.phone === phone) {
      proceed(localClient);
      setIsLoading(false);
      return;
    }

    try {
      const { data } = await API.get(`/clients?phone=${phone}`);
if (data?._id) {
  localStorage.setItem('client', JSON.stringify(data));
  onClientLoaded(data);
  proceed(data);
} else {
  // New client, redirect to profile creation
  sessionStorage.setItem('newPhone', phone); // optional: prefill phone in form
  window.location.href = '/booking/create-profile';
}

    } catch (err) {
      toast.error('Failed to retrieve client info.');
    } finally {
      setIsLoading(false);
    }
  };

  const proceed = async (clientData) => {
    try {
      const { data: appointments } = await API.get(`/appointments/client/${clientData._id}`);
      if (appointments.length > 0) {
        window.location.href = '/booking/dashboard';
      } else {
        window.location.href = '/booking/schedule';
      }
    } catch (err) {
      toast.error('Could not load appointments');
    }
  };

  const handleReset = () => {
    localStorage.removeItem('client');
    setPhone('');
    setLocalClient(null);
    if (inputRef.current) {
      inputRef.current.focus();
    }
  };

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-100 p-4">
      <img src={logo} alt="Rakie Salon Logo" className="w-24 h-24 mb-4" />

      <div className="bg-white shadow-md rounded p-6 w-full max-w-md">
        <h1 className="text-xl font-semibold mb-4 text-center">Welcome to Rakie Salon</h1>

        <label className="block mb-2 text-sm font-medium text-gray-700">Enter your phone number:</label>
        <input
          ref={inputRef}
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
          placeholder="e.g., 5851234567"
          className="w-full px-4 py-2 border rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400"
        />

        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded"
        >
          {isLoading ? 'Checking...' : 'Continue'}
        </button>

        {localClient && (
          <button
            onClick={handleReset}
            className="w-full mt-2 text-sm text-blue-500 hover:underline"
          >
            Not you? Clear and enter a different number
          </button>
        )}
      </div>
    </div>
  );
}
