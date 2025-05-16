import React, { useState, useEffect } from 'react';
import API from '../../api';

export default function AdminNotifications() {
  const [reminders, setReminders] = useState([]);
  const [smsTemplate, setSmsTemplate] = useState('');
  const [emailTemplate, setEmailTemplate] = useState('');
  const [enabled, setEnabled] = useState(true);

  useEffect(() => {
    fetchReminders();
  }, []);

  const fetchReminders = async () => {
    const { data } = await API.get('/admin/reminders');
    setReminders(data);
  };

  const saveSettings = async () => {
    await API.put('/admin/reminders/general', {
      smsTemplate,
      emailTemplate,
      enabled,
    });
    alert('Settings saved');
  };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Notifications & Reminders</h2>

      <div className="mb-4 space-y-2">
        <label className="block font-medium">Enable Reminders</label>
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
        />
      </div>

      <div className="mb-4 space-y-2">
        <label className="block font-medium">SMS Template</label>
        <textarea
          className="w-full border px-2 py-1"
          rows="3"
          value={smsTemplate}
          onChange={(e) => setSmsTemplate(e.target.value)}
        />
      </div>

      <div className="mb-4 space-y-2">
        <label className="block font-medium">Email Template</label>
        <textarea
          className="w-full border px-2 py-1"
          rows="3"
          value={emailTemplate}
          onChange={(e) => setEmailTemplate(e.target.value)}
        />
      </div>

      <button
        onClick={saveSettings}
        className="bg-blue-600 text-white px-4 py-2 rounded"
      >
        Save Settings
      </button>

      <h3 className="text-lg font-semibold mt-6 mb-2">Scheduled Reminders</h3>
      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 border">Client</th>
            <th className="p-2 border">Type</th>
            <th className="p-2 border">Scheduled At</th>
            <th className="p-2 border">Status</th>
          </tr>
        </thead>
        <tbody>
          {reminders.map((r) => (
            <tr key={r._id}>
              <td className="p-2 border">{r.clientName}</td>
              <td className="p-2 border">{r.type}</td>
              <td className="p-2 border">{new Date(r.scheduledAt).toLocaleString()}</td>
              <td className="p-2 border">{r.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
