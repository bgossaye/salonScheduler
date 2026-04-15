import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { Header, Footer } from '@rakie/ui';
import { wakeRender } from "./wakebooking";
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
import AdminGiftCards from './components/admin/AdminGiftCards';
import SidebarLayout from './layouts/SidebarLayout';
import PrivateRoute from './components/admin/PrivateRoute';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';

function App() {

  const [client, setClient] = useState(null);

    // 📦 Load client from localStorage
    useEffect(() => {
        const saved = localStorage.getItem('client');
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed && parsed._id) {
                    setClient(parsed);
                } else {
                    localStorage.removeItem('client');
                }
            } catch (e) {
                localStorage.removeItem('client');
            }
        }
    }, []);

  const handleClientLoaded = (data) => {
    localStorage.setItem('client', JSON.stringify(data));
    setClient(data);
  };

  //if (!client) {
  //return <div className="p-6 text-center text-gray-600">Loading client info...</div>;
	//}
useEffect(() => { wakeRender({ tag: 'booking-root' }); }, []);
return (
<div className="min-h-screen bg-gray-100">
      <Header />      <ToastContainer position="top-center" />
      <Routes>
        {/* ✅ Client Flow */}
        <Route path="/" element={<ClientWelcome  client={client} onClientLoaded={handleClientLoaded} />} />
	<Route path="/schedule" element={<ServiceSelector  client={client} />} />
	<Route path="/dashboard" element={<ClientDashboard client={client} />} />
	<Route path="/confirmation" element={<ClientConfirmation client={client} />} />
	<Route path="/create-profile" element={<CreateClientProfile client={client} />} />
            {/* ✅ Admin Login */}
	<Route path="/admin/login" element={<AdminLogin />} />

            {/* ✅ Admin Routes */}
            <Route path="/admin" element={<PrivateRoute />}>
                <Route element={<SidebarLayout />}>
                    <Route path="appointments" element={<AdminAppointments />} />
                    <Route path="clients" element={<AdminClients />} />
                    <Route path="client/:id" element={<AdminClientProfile />} />
                    <Route path="services" element={<AdminServices />} />
                    <Route path="store-hours" element={<AdminStoreHours />} />
                    <Route path="notifications" element={<AdminNotifications />} />
                    <Route path="reports" element={<AdminReports />} />
                    <Route path="enhancements" element={<AdminEnhancements />} />
                    <Route path="giftcards" element={<AdminGiftCards />} />
                    <Route index element={<Navigate to="appointments" />} />
                </Route>
            </Route>
        </Routes>
      <Footer />
    </div>
  );
}

export default App;
