// SidebarLayout.jsx
import React, { useState } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import { LogOut, Calendar, Users, Clock, Settings, FileText, Layers, Home, Menu } from 'lucide-react';

const menuItems = [
  { path: '/admin/dashboard', icon: <Home size={18} />, label: 'Dashboard' },
  { path: '/admin/appointments', icon: <Calendar size={18} />, label: 'Appointments' },
  { path: '/admin/clients', icon: <Users size={18} />, label: 'Clients' },
  { path: '/admin/services', icon: <Layers size={18} />, label: 'Services' },
  { path: '/admin/store-hours', icon: <Clock size={18} />, label: 'Store Hours' },
  { path: '/admin/notifications', icon: <Settings size={18} />, label: 'Reminders & Notifications' },
  { path: '/admin/reports', icon: <FileText size={18} />, label: 'Reports / Export' },
];

export default function SidebarLayout() {
  const location = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className={`fixed z-40 top-0 left-0 h-full bg-gray-100 w-64 p-4 shadow-md transform transition-transform duration-300 ease-in-out ${
        open ? 'translate-x-0' : '-translate-x-full'
      } md:translate-x-0 md:relative md:shadow-none`}>
        <h2 className="text-xl font-bold mb-6">Rakie Admin</h2>
        <nav className="space-y-2">
          {menuItems.map(item => (
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
          <button className="flex items-center gap-2 text-red-600 hover:underline">
            <LogOut size={18} /> Logout
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 md:ml-64 bg-white w-full p-4">
        {/* Mobile Toggle Button */}
        <div className="md:hidden flex items-center justify-between mb-4">
          <button onClick={() => setOpen(!open)} className="text-gray-600 hover:text-black">
            <Menu size={24} />
          </button>
          <h1 className="text-xl font-semibold">Admin Panel</h1>
        </div>

        {/* Content Area */}
        <Outlet />
      </div>
    </div>
  );
}

