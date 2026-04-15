import React, { useEffect, useState } from 'react';
import API from '../../api';

export default function AdminReports() {
  const [report, setReport] = useState(null);

  useEffect(() => {
    fetchReport();
  }, []);

  const fetchReport = async () => {
    const { data } = await API.get('/admin/reports/summary');
    setReport(data);
  };

  if (!report) return <p className="p-4">Loading report...</p>;

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Monthly Summary Report</h2>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="bg-gray-100 p-4 rounded shadow">
          <h3 className="font-semibold">Total Appointments</h3>
          <p>{report.totalAppointments}</p>
        </div>
        <div className="bg-green-100 p-4 rounded shadow">
          <h3 className="font-semibold">Completed Appointments</h3>
          <p>{report.completedAppointments}</p>
        </div>
        <div className="bg-red-100 p-4 rounded shadow">
          <h3 className="font-semibold">Canceled Appointments</h3>
          <p>{report.canceledAppointments}</p>
        </div>
      </div>

      <div className="mb-6">
        <h3 className="font-semibold mb-2">Revenue by Service</h3>
        <ul className="list-disc pl-5">
          {report.revenueByService.map((r, idx) => (
            <li key={idx}>{r.service}: ${r.revenue}</li>
          ))}
        </ul>
      </div>

      <div>
        <h3 className="font-semibold mb-2">Top Clients</h3>
        <ul className="list-decimal pl-5">
          {report.topClients.map((c, idx) => (
            <li key={idx}>{c.name} — {c.visits} visits</li>
          ))}
        </ul>
      </div>
    </div>
  );
}
