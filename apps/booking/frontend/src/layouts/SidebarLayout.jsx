// SidebarLayout.jsx
import React, { useEffect, useMemo, useState } from 'react';
import { hasAnyPermission, hasPermission, getAdminUser } from '../utils/permissions';
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Calendar, Users, Clock, Settings, FileText, Layers, Home, Menu, Briefcase, Bell } from 'lucide-react';
import { Gift } from 'lucide-react';
import API from '../api';

const menuItems = [
  { path: '/admin/dashboard', icon: <Home size={18} />, label: 'Dashboard', permission: 'dashboardView' },
  { path: '/admin/my-work', icon: <Briefcase size={18} />, label: 'My Work', permission: 'appointmentsViewOwn' },
  { path: '/admin/appointments', icon: <Calendar size={18} />, label: 'Appointments', permission: 'appointmentsViewAll' },
  { path: '/admin/clients', icon: <Users size={18} />, label: 'Clients', permission: 'clientsViewAll' },
  { path: '/admin/services', icon: <Layers size={18} />, label: 'Services', permission: 'servicesView' },
  { path: '/admin/workers', icon: <Briefcase size={18} />, label: 'Staff / Workers', permission: 'workersView' },
  { path: '/admin/giftcards', icon: <Gift size={18} />, label: 'Gift Cards', permission: 'giftCardsManage' },
  { path: '/admin/store-hours', icon: <Clock size={18} />, label: 'Store Hours', permission: 'settingsManage' },
  { path: '/admin/notifications', icon: <Settings size={18} />, label: 'Reminders & Notifications', permission: 'smsSettingsManage' },
  { path: '/admin/runtime-settings', icon: <Settings size={18} />, label: 'Runtime Settings', permission: 'settingsManage' },
  { path: '/admin/deals-coupons', icon: <Gift size={18} />, label: 'Deals & Coupons', permission: 'dealsView' },
  { path: '/admin/reports', icon: <FileText size={18} />, label: 'Reports / Export', permission: 'reportsView' },
];

function staffDisplay(admin) {
  const name = admin?.workerName || admin?.displayName || [admin?.firstName, admin?.lastName].filter(Boolean).join(' ').trim() || admin?.username || admin?.email || 'Staff';
  const role = admin?.roleName || admin?.workerTitle || admin?.roleKey || admin?.role || 'Staff';
  return { name, role };
}

function StaffHeader() {
  const admin = getAdminUser();
  const { name, role } = staffDisplay(admin);
  return (
    <div className="mb-3 rounded border bg-white p-3 shadow-sm">
      <div className="text-sm font-bold text-gray-900 truncate">{name}</div>
      <div className="text-xs text-gray-500 truncate capitalize">{role}</div>
    </div>
  );
}

function NotificationBell() {
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const { data } = await API.get('/admin/notifications?limit=8');
      setUnread(Number(data?.unread || 0));
      setNotifications(Array.isArray(data?.notifications) ? data.notifications : []);
    } catch {
      setUnread(0);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadNotifications();
    const timer = setInterval(loadNotifications, 60000);
    return () => clearInterval(timer);
  }, []);

  const markNotificationRead = async (notificationId) => {
    if (!notificationId) return;
    try {
      await API.patch(`/admin/notifications/${notificationId}/read`, {});
      setNotifications((prev) => prev.filter((item) => item._id !== notificationId));
      setUnread((prev) => Math.max(0, prev - 1));
    } catch {
      // Keep the bell usable even if the server rejects this single update.
      await loadNotifications();
    }
  };

  const hasUnread = unread > 0;

  return (
    <div className="relative mb-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className={`flex w-full items-center justify-between rounded border p-2 text-sm shadow-sm ${hasUnread ? 'border-amber-300 bg-amber-50 text-amber-900' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
        title={hasUnread ? `${unread} unread notification${unread === 1 ? '' : 's'}` : 'No unread notifications'}
      >
        <span className="flex items-center gap-2 font-semibold">
          <span className="relative inline-flex">
            <Bell size={18} />
            {hasUnread && <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-red-600" />}
          </span>
          Notifications
        </span>
        <span className={`rounded-full px-2 py-0.5 text-xs ${hasUnread ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-500'}`}>{unread}</span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 z-50 mt-2 max-h-80 overflow-y-auto rounded border bg-white p-2 shadow-lg">
          {loading && <div className="p-2 text-xs text-gray-500">Loading notifications…</div>}
          {!loading && notifications.length === 0 && <div className="p-2 text-xs text-gray-500">No unread notifications.</div>}
          {!loading && notifications.map((item) => (
            <div key={item._id} className="mb-2 rounded border p-2 text-xs last:mb-0">
              <div className="font-semibold text-gray-900">{item.title || 'Notification'}</div>
              <div className="mt-1 text-gray-700">{item.message}</div>
              {item.createdAt && <div className="mt-1 text-[11px] text-gray-500">{new Date(item.createdAt).toLocaleString()}</div>}
              <button
                type="button"
                onClick={() => markNotificationRead(item._id)}
                className="mt-2 rounded border px-2 py-1 text-[11px] hover:bg-gray-50"
              >
                Reviewed
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function SidebarLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const visibleMenuItems = useMemo(
    () => menuItems.filter(item => !item.permission || (item.anyPermission ? hasAnyPermission(item.anyPermission) : hasPermission(item.permission))),
    []
  );

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className={`fixed z-40 top-0 left-0 h-full bg-gray-100 w-64 p-4 shadow-md transform transition-transform duration-300 ease-in-out ${
        open ? 'translate-x-0' : '-translate-x-full'
      } md:translate-x-0 md:relative md:shadow-none`}>
        <StaffHeader />
        <NotificationBell />
        <nav className="space-y-2">
          {visibleMenuItems.map(item => (
            <Link
              key={item.path}
              to={item.path}
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 p-2 rounded hover:bg-blue-100 ${
                location.pathname === item.path ? 'bg-blue-200 font-semibold' : ''
              }`}
            >
              {item.icon} {item.label}
            </Link>
          ))}
        </nav>
        <div className="mt-10">
          <button onClick={() => { localStorage.removeItem('adminToken'); localStorage.removeItem('adminUser'); navigate('/admin/login', { replace: true }); }} className="flex items-center gap-2 text-red-600 hover:underline">
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 md:ml-64 bg-white w-full p-4">
        {/* Mobile Toggle Button */}
        <div className="md:hidden mb-4 space-y-3">
          <div className="flex items-center justify-between">
            <button onClick={() => setOpen(!open)} className="text-gray-600 hover:text-black">
              <Menu size={24} />
            </button>
            <h1 className="text-xl font-semibold">Admin Panel</h1>
          </div>
          <StaffHeader />
          <NotificationBell />
        </div>

        {/* Content Area */}
        <Outlet />
      </div>
    </div>
  );
}
