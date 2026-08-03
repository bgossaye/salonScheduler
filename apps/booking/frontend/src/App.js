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
import StaffPasswordSetup from './components/admin/StaffPasswordSetup';
import AdminDashboard from './components/admin/AdminDashboard';
import AdminAppointments from './components/admin/AdminAppointments';
import AdminClients from './components/admin/AdminClients';
import AdminClientProfile from './components/admin/AdminClientProfile';
import AdminServices from './components/admin/AdminServices';
import AdminStoreHours from './components/admin/AdminStoreHours';
import AdminNotifications from './components/admin/AdminNotifications';
import AdminReports from './components/admin/AdminReports';
import AdminEnhancements from './components/admin/AdminEnhancements';
import AdminGiftCards from './components/admin/AdminGiftCards';
import AdminRuntimeSettings from './components/admin/AdminRuntimeSettings';
import AdminDealsCoupons from './components/admin/AdminDealsCoupons';
import AdminWorkers from './components/admin/AdminWorkers';
import WorkerDashboard from './components/admin/WorkerDashboard';
import SidebarLayout from './layouts/SidebarLayout';
import PrivateRoute from './components/admin/PrivateRoute';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { hasPermission } from './utils/permissions';


function AdminLanding() {
  if (hasPermission('dashboardView')) return <Navigate to="dashboard" replace />;
  if (hasPermission('appointmentsViewOwn')) return <Navigate to="my-work" replace />;
  if (hasPermission('appointmentsViewAll')) return <Navigate to="appointments" replace />;
  if (hasPermission('servicesView')) return <Navigate to="services" replace />;
  return <Navigate to="/admin/login" replace />;
}

function AdminDashboardRoute() {
  return hasPermission('dashboardView')
    ? <AdminDashboard />
    : <AdminLanding />;
}

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

  const handleClientSignOut = () => {
    setClient(null);
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
	<Route path="/schedule" element={<ServiceSelector client={client} onSignOut={handleClientSignOut} />} />
	<Route path="/dashboard" element={<ClientDashboard client={client} />} />
	<Route path="/confirmation" element={<ClientConfirmation client={client} />} />
	<Route path="/create-profile" element={<CreateClientProfile client={client} />} />
            {/* ✅ Admin Login */}
	<Route path="/admin/login" element={<AdminLogin />} />
	<Route path="/admin/set-password" element={<StaffPasswordSetup mode="invite" />} />
	<Route path="/admin/reset-password" element={<StaffPasswordSetup mode="reset" />} />

            {/* ✅ Admin Routes */}
            <Route path="/admin" element={<PrivateRoute />}>
                <Route element={<SidebarLayout />}>
                    <Route path="dashboard" element={<AdminDashboardRoute />} />
                    <Route path="my-work" element={<WorkerDashboard />} />
                    <Route path="appointments" element={<AdminAppointments />} />
                    <Route path="clients" element={<AdminClients />} />
                    <Route path="client/:id" element={<AdminClientProfile />} />
                    <Route path="services" element={<AdminServices />} />
                    <Route path="store-hours" element={<AdminStoreHours />} />
                    <Route path="notifications" element={<AdminNotifications />} />
                    <Route path="reports" element={<AdminReports />} />
                    <Route path="enhancements" element={<AdminEnhancements />} />
                    <Route path="giftcards" element={<AdminGiftCards />} />
                    <Route path="runtime-settings" element={<AdminRuntimeSettings />} />
                    <Route path="deals-coupons" element={<AdminDealsCoupons />} />
                    <Route path="workers" element={<AdminWorkers />} />
                    <Route index element={<AdminLanding />} />
                </Route>
            </Route>
        </Routes>
      <Footer />
    </div>
  );
}

export default App;
