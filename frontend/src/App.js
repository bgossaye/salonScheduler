import React, { useState, useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import ClientWelcome from './components/ClientWelcome';
import ClientDashboard from './components/ClientDashboard';
import ServiceSelector from './components/ServiceSelector';
import ClientConfirmation from './pages/clientconfirmation';
import CreateClientProfile from './components/CreateClientProfile';
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

function App() {

  const [client, setClient] = useState(null);

  useEffect(() => {
    const saved = localStorage.getItem('client');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed._id && parsed.fullName) {
          setClient(parsed);
        } else {
          console.warn("App⚠️ Invalid client in localStorage, clearing.");
          localStorage.removeItem('client');
        }
      } catch (e) {
        console.error("App: ❌ Failed to parse client from localStorage", e);
        localStorage.removeItem('client');
      }
    } else {
      console.log("📭 No client found");
    }
  }, []);

  const handleClientLoaded = (data) => {
    localStorage.setItem('client', JSON.stringify(data));
    setClient(data);
  };

  if (!client) {
  return <div className="p-6 text-center text-gray-600">Loading client info...</div>;
}

return (
    <div className="min-h-screen bg-gray-100">
      <ToastContainer position="top-center" />
      <Routes>
        {/* ✅ Client Flow */}
        <Route
          path="/"
          element={
            <ClientWelcome
              client={client}
              onClientLoaded={handleClientLoaded}
            />
          }
        />
        <Route path="/schedule" element={<ServiceSelector  client={client} />} />
	<Route path="/dashboard" element={<ClientDashboard client={client} />} />
	<Route path="/confirmation" element={<ClientConfirmation client={client} />} />
	<Route path="/create-profile" element={<CreateClientProfile client={client} />} />

        {/* ✅ Admin Login (No Sidebar) */}
        <Route
          path="/admin/login"
          element={
            <AdminLogin
              onLogin={() => (window.location.href = '/booking/admin/appointments')}
            />
          }
        />

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
  );
}

export default App;
