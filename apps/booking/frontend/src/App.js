import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { Header, Footer } from '@rakie/ui';
import { wakeRender } from "./wakebooking";
import ClientWelcome from './components/ClientWelcome';
import ClientDashboard from './components/ClientDashboard';
import ServiceSelector from './components/ServiceSelector';
import ClientConfirmation from './pages/clientconfirmation';
import FamilyInvitation from './pages/FamilyInvitation';
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
import logo from './assets/TheRSlogo.png';


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

  const location = useLocation();
  const isFamilyInvitationPage = location.pathname.startsWith('/family-invitation/') || location.pathname.startsWith('/booking/family-invitation/');
  const isClientExperience = ['/', '/schedule', '/dashboard', '/confirmation'].includes(location.pathname);
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

useEffect(() => {
  const mainSiteUrl = `${window.location.origin}/`;

  const updateMainSiteLink = () => {
    const anchors = Array.from(document.querySelectorAll('a'));
    const brandLink = anchors.find((anchor) => {
      const text = (anchor.textContent || '').trim().replace(/\s+/g, ' ');
      return text === 'Rakie Salon' || text === 'Rakie Salon Site';
    });

    if (!brandLink) return false;

    brandLink.setAttribute('href', mainSiteUrl);
    brandLink.setAttribute('aria-label', 'Main Site');
    brandLink.style.display = 'inline-flex';
    brandLink.style.alignItems = 'center';
    brandLink.style.justifyContent = 'flex-start';
    brandLink.style.gap = '4px';

    // Rebuild only the inside of the existing brand link so inherited
    // margins/padding from the old brand text cannot separate logo and label.
    brandLink.replaceChildren();

    const brandLogo = document.createElement('img');
    brandLogo.src = logo;
    brandLogo.alt = '';
    brandLogo.setAttribute('aria-hidden', 'true');
    brandLogo.setAttribute('data-rakie-main-site-logo', 'true');
    brandLogo.style.width = '22px';
    brandLogo.style.height = '22px';
    brandLogo.style.objectFit = 'contain';
    brandLogo.style.display = 'block';
    brandLogo.style.flex = '0 0 auto';
    brandLogo.style.margin = '0';

    const brandText = document.createElement('span');
    brandText.textContent = 'Main Site';
    brandText.style.margin = '0';
    brandText.style.padding = '0';
    brandText.style.display = 'inline-block';

    brandLink.append(brandLogo, brandText);

    return true;
  };

  if (updateMainSiteLink()) return undefined;

  const observer = new MutationObserver(() => {
    if (updateMainSiteLink()) observer.disconnect();
  });
  observer.observe(document.body, { childList: true, subtree: true });

  return () => observer.disconnect();
}, []);
if (isFamilyInvitationPage) {
  return (
    <Routes>
      <Route path="/family-invitation/:token" element={<FamilyInvitation />} />
      <Route path="/booking/family-invitation/:token" element={<FamilyInvitation />} />
    </Routes>
  );
}
return (
<div className={`min-h-screen ${isClientExperience ? 'rakie-client-shell' : 'bg-gray-100'}`}>
      <Header />      <ToastContainer position="top-center" />
      <Routes>
        {/* ✅ Client Flow */}
        <Route path="/" element={<ClientWelcome  client={client} onClientLoaded={handleClientLoaded} />} />
	<Route path="/schedule" element={<ServiceSelector client={client} onSignOut={handleClientSignOut} />} />
	<Route path="/dashboard" element={<ClientDashboard client={client} />} />
	<Route path="/confirmation" element={<ClientConfirmation client={client} />} />
	<Route path="/create-profile" element={<Navigate to="/" replace />} />
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
      {!isClientExperience && <Footer />}
    </div>
  );
}

export default App;