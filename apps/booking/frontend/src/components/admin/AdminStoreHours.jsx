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
    const updatedHours = [...hours];
    const index = updatedHours.findIndex(h => h.day === day);
    const updatedDay = index !== -1 ? { ...updatedHours[index] } : { day };

    updatedDay[field] = field === 'closed' ? Boolean(value) : value;

    if (index !== -1) {
      updatedHours[index] = updatedDay;
    } else {
      updatedHours.push(updatedDay);
    }

    setHours(updatedHours);
    await API.put(`/admin/store-hours/${day}`, updatedDay);
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
            const isClosed = !!h.closed;
            return (
              <tr key={day} className={isClosed ? 'bg-gray-200 text-gray-500' : ''}>
                <td className="p-2 border">{day}</td>
                <td className="p-2 border">
                  <input
                    type="time"
                    step="1800"
                    value={h.open || ''}
                    onChange={e => handleChange(day, 'open', e.target.value)}
                    className="border px-2 py-1"
                    disabled={isClosed}
                  />
                </td>
                <td className="p-2 border">
                  <input
                    type="time"
                    step="1800"
                    value={h.close || ''}
                    onChange={e => handleChange(day, 'close', e.target.value)}
                    className="border px-2 py-1"
                    disabled={isClosed}
                  />
                </td>
                <td className="p-2 border text-center">
                  <input
                    type="checkbox"
                    checked={isClosed}
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
