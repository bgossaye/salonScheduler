import React, { useState, useEffect } from 'react';
import API from '../../api';

export default function AdminStoreHours() {
  const [hours, setHours] = useState([]);

  useEffect(() => {
    fetchHours();
  }, []);

  const fetchHours = async () => {
    const { data } = await API.get('/admin/store-hours');
    setHours(data);
  };

  const handleChange = async (day, field, value) => {
    const updatedDay = hours.find(h => h.day === day) || { day };
    updatedDay[field] = value;
    await API.put(`/admin/store-hours/${day}`, updatedDay);
    fetchHours();
  };

  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Store Hours</h2>
      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 border">Day</th>
            <th className="p-2 border">Open</th>
            <th className="p-2 border">Close</th>
            <th className="p-2 border">Closed?</th>
          </tr>
        </thead>
        <tbody>
          {days.map((day) => {
            const h = hours.find(d => d.day === day) || {};
            return (
              <tr key={day}>
                <td className="p-2 border">{day}</td>
                <td className="p-2 border">
                  <input
                    type="time"
                    value={h.open || ''}
                    onChange={e => handleChange(day, 'open', e.target.value)}
                    className="border px-2 py-1"
                  />
                </td>
                <td className="p-2 border">
                  <input
                    type="time"
                    value={h.close || ''}
                    onChange={e => handleChange(day, 'close', e.target.value)}
                    className="border px-2 py-1"
                  />
                </td>
                <td className="p-2 border text-center">
                  <input
                    type="checkbox"
                    checked={h.closed || false}
                    onChange={e => handleChange(day, 'closed', e.target.checked)}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
