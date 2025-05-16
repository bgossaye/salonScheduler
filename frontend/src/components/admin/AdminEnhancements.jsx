import React, { useState } from 'react';
import API from '../../api';

export default function AdminEnhancements() {
  const [darkMode, setDarkMode] = useState(false);

  const exportCSV = async () => {
    const response = await API.get('/admin/export/appointments', {
      responseType: 'blob'
    });
    const url = window.URL.createObjectURL(new Blob([response.data]));
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', 'appointments.csv');
    document.body.appendChild(link);
    link.click();
  };

  return (
    <div className={`p-4 ${darkMode ? 'bg-gray-900 text-white' : ''}`}>
      <h2 className="text-xl font-bold mb-4">UX Enhancements</h2>

      <div className="mb-4">
        <label className="mr-2">Dark Mode</label>
        <input
          type="checkbox"
          checked={darkMode}
          onChange={(e) => setDarkMode(e.target.checked)}
        />
      </div>

      <button
        onClick={exportCSV}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        Export Appointments to CSV
      </button>
    </div>
  );
}
