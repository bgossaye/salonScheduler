// AdminStatusPanel.jsx
import React, { useEffect, useState } from 'react';
import API from '../../api';

export default function AdminStatusPanel() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState([]);
  const [filter, setFilter] = useState('');

  useEffect(() => {
    fetchLogs();
  }, []);

  const fetchLogs = async () => {
    try {
      const { data } = await API.get('/admin/status-logs');
      setLogs(data);
    } catch (err) {
      console.error('Failed to load status logs:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (log) => {
    try {
      await API.post('/admin/resend-sms', { messageSid: log.messageSid });
      alert(`Resent to ${log.to}`);
    } catch (err) {
      console.error('Failed to resend SMS:', err);
    }
  };

  const handleSelect = (id) => {
    setSelected((prev) =>
      prev.includes(id) ? prev.filter((sid) => sid !== id) : [...prev, id]
    );
  };

  const handleSelectAll = () => {
    if (selected.length === logs.length) setSelected([]);
    else setSelected(logs.map((log) => log._id));
  };

  const handleDeleteSelected = async () => {
    try {
      await API.post('/admin/status-logs/delete', { ids: selected });
      setLogs((prev) => prev.filter((log) => !selected.includes(log._id)));
      setSelected([]);
    } catch (err) {
      console.error('Failed to delete logs:', err);
    }
  };

  const filteredLogs = logs.filter((log) =>
    log.to.includes(filter) || log.status.includes(filter)
  );

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <h2 className="text-xl font-semibold mb-4">Twilio SMS Status Logs</h2>

      <div className="flex gap-4 mb-4">
        <input
          type="text"
          className="border rounded px-3 py-1"
          placeholder="Filter by phone or status"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        />
        <button
          onClick={handleSelectAll}
          className="bg-gray-300 px-3 py-1 rounded"
        >
          {selected.length === logs.length ? 'Unselect All' : 'Select All'}
        </button>
        <button
          onClick={handleDeleteSelected}
          className="bg-red-500 text-white px-3 py-1 rounded"
          disabled={selected.length === 0}
        >
          Delete Selected
        </button>
      </div>

      {loading ? (
        <p>Loading logs...</p>
      ) : (
        <table className="min-w-full text-sm">
          <thead className="bg-gray-200">
            <tr>
              <th className="p-2">
                <input
                  type="checkbox"
                  checked={selected.length === logs.length}
                  onChange={handleSelectAll}
                />
              </th>
              <th className="p-2 text-left">To</th>
              <th className="p-2 text-left">Status</th>
              <th className="p-2 text-left">Message SID</th>
              <th className="p-2 text-left">Error</th>
              <th className="p-2 text-left">Time</th>
              <th className="p-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredLogs.map((log) => (
              <tr key={log._id} className="border-b">
                <td className="p-2">
                  <input
                    type="checkbox"
                    checked={selected.includes(log._id)}
                    onChange={() => handleSelect(log._id)}
                  />
                </td>
                <td className="p-2">{log.to}</td>
                <td className="p-2">
                  <span className={`px-2 py-1 rounded ${
                    log.status === 'delivered' ? 'bg-green-100 text-green-800' :
                    log.status === 'failed' ? 'bg-red-100 text-red-800' :
                    'bg-yellow-100 text-yellow-800'
                  }`}>
                    {log.status}
                  </span>
                </td>
                <td className="p-2">{log.messageSid}</td>
                <td className="p-2 text-xs">
                  {log.errorCode ? `${log.errorCode}: ${log.errorMessage}` : '—'}
                </td>
                <td className="p-2 text-xs">{new Date(log.timestamp).toLocaleString()}</td>
                <td className="p-2">
                  <button
                    onClick={() => handleResend(log)}
                    className="text-blue-600 underline text-sm"
                  >
                    Resend
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
