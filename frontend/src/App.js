import React, { useState } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import ClientWelcome from './components/ClientWelcome';
import ClientDashboard from './components/ClientDashboard';
import AdminLogin from './components/admin/AdminLogin';
import AdminAppointments from './components/admin/AdminAppointments';
import AdminClients from './components/admin/AdminClients';
import AdminClientProfile from './components/admin/AdminClientProfile';
import AdminServices from './components/admin/AdminServices';
import AdminStoreHours from './components/admin/AdminStoreHours';
import AdminNotifications from './components/admin/AdminNotifications';
import AdminReports from './components/admin/AdminReports';
import AdminEnhancements from './components/admin/AdminEnhancements';
import SidebarLayout from './layouts/SidebarLayout';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import ClientSchedule from './pages/ClientSchedule';

function App() {
  const [client, setClient] = useState(null);

  return (
    <Router>
      <div className="min-h-screen bg-gray-100">
        <ToastContainer position="top-center" />

        <Routes>
          {/* ✅ Client Flow */}
          <Route path="/" element={!client ? <ClientWelcome onClientLoaded={setClient} /> : <ClientDashboard client={client} />} />
	  <Route path="/schedule" element={<ClientSchedule />} />

          {/* ✅ Admin Login (No Sidebar) */}
          <Route path="/admin/login" element={<AdminLogin onLogin={() => window.location.href = "/admin/appointments"} />} />

          {/* ✅ Admin Routes with Sidebar */}
          <Route path="/admin" element={<SidebarLayout />}>
            <Route path="appointments" element={<AdminAppointments />} />
            <Route path="clients" element={<AdminClients />} />
            <Route path="client/:id" element={<AdminClientProfile />} /> 
	    <Route path="services" element={<AdminServices />} />
            <Route path="store-hours" element={<AdminStoreHours />} />
            <Route path="notifications" element={<AdminNotifications />} />
            <Route path="reports" element={<AdminReports />} />
            <Route path="enhancements" element={<AdminEnhancements />} />
          </Route>
        </Routes>
      </div>
    </Router>
  );
}

export default App;
