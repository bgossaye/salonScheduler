import React, { useEffect, useMemo, useState } from 'react';
import API from '../../api';
import { toast } from 'react-toastify';
import { formatDate, formatTime } from '../../utils/formatHelper';
import AppointmentFormModal from './AppointmentFormModal';
import { hasAnyPermission, hasPermission } from '../../utils/permissions';

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function workerName(worker) {
  return worker?.displayName || [worker?.firstName, worker?.lastName].filter(Boolean).join(' ') || 'Worker';
}

function appointmentStart(appt) {
  return new Date(`${appt.date}T${String(appt.time || '00:00').slice(0, 5)}:00`);
}

const EMPTY_REQUEST = {
  type: 'time_off',
  label: '',
  startDate: '',
  endDate: '',
  allDay: true,
  startTime: '',
  endTime: '',
  requestNote: '',
};

export default function WorkerDashboard() {
  const [profile, setProfile] = useState(null);
  const [appointments, setAppointments] = useState([]);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [requestForm, setRequestForm] = useState(EMPTY_REQUEST);
  const [passwordForm, setPasswordForm] = useState({ currentPassword: '', newPassword: '' });
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);

  const canCreateAppointment = hasAnyPermission(['appointmentsCreate', 'appointmentsCreateOwn', 'appointmentsCreateForOthers']);
  const canCompleteAppointment = hasAnyPermission(['appointmentsEdit', 'appointmentsEditOwn', 'appointmentsEditForOthers']) || hasPermission('appointmentsComplete');
  const canCancelAppointment = hasAnyPermission(['appointmentsEdit', 'appointmentsEditOwn', 'appointmentsEditForOthers']) || hasPermission('appointmentsCancel');

  const loadAll = async () => {
    setLoading(true);
    try {
      const [profileRes, apptRes, notificationRes] = await Promise.all([
        API.get('/admin/workers/me'),
        API.get('/admin/appointments', { params: { scope: 'own' } }),
        API.get('/admin/notifications?limit=8').catch(() => ({ data: { notifications: [] } })),
      ]);
      setProfile(profileRes.data?.worker || null);
      setAppointments(Array.isArray(apptRes.data) ? apptRes.data : []);
      setNotifications(Array.isArray(notificationRes.data?.notifications) ? notificationRes.data.notifications : []);
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.error || 'Failed to load worker dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadAll(); }, []);

  const grouped = useMemo(() => {
    const sorted = appointments.slice().sort((a, b) => appointmentStart(a) - appointmentStart(b));
    const today = todayIso();
    return {
      today: sorted.filter((appt) => appt.date === today && ['booked', 'pending'].includes(appt.status)),
      upcoming: sorted.filter((appt) => appt.date >= today && ['booked', 'pending'].includes(appt.status)),
      completed: sorted.filter((appt) => ['completed', 'noshow', 'canceled'].includes(appt.status)).slice(-20).reverse(),
    };
  }, [appointments]);

  const updateStatus = async (appt, status) => {
    try {
      await API.patch(`/admin/appointments/${appt._id}`, { status });
      toast.success('Appointment updated.');
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'You do not have permission to update this appointment.');
    }
  };

  const markNotificationRead = async (notificationId) => {
    try {
      await API.patch(`/admin/notifications/${notificationId}/read`, {});
      setNotifications((prev) => prev.filter((item) => item._id !== notificationId));
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to mark notification reviewed.');
    }
  };

  const createAppointment = async (form) => {
    try {
      await API.post('/admin/appointments', form);
      toast.success('Appointment created.');
      setAppointmentModalOpen(false);
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to create appointment.');
      throw err;
    }
  };



  const changePassword = async () => {
    if (!passwordForm.currentPassword || !passwordForm.newPassword) {
      toast.error('Enter your current and new password.');
      return;
    }
    if (passwordForm.newPassword.length < 8) {
      toast.error('New password must be at least 8 characters.');
      return;
    }
    try {
      await API.post('/admin/login/change-password', passwordForm);
      toast.success('Password changed.');
      setPasswordForm({ currentPassword: '', newPassword: '' });
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to change password.');
    }
  };

  const submitRequest = async () => {
    if (!requestForm.startDate) {
      toast.error('Start date is required.');
      return;
    }
    if (!requestForm.allDay && (!requestForm.startTime || !requestForm.endTime)) {
      toast.error('Start time and end time are required for partial-day requests.');
      return;
    }
    try {
      await API.post('/admin/workers/me/blocked-times', {
        ...requestForm,
        endDate: requestForm.endDate || requestForm.startDate,
        label: requestForm.label || 'Time off request',
      });
      toast.success('Time-off request submitted for approval.');
      setRequestForm(EMPTY_REQUEST);
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to submit request.');
    }
  };

  const cancelRequest = async (block) => {
    if (!window.confirm('Cancel this time-off request?')) return;
    try {
      await API.delete(`/admin/workers/me/blocked-times/${block.blockId}`);
      toast.success('Request cancelled.');
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to cancel request.');
    }
  };

  const AppointmentList = ({ items, empty }) => (
    <div className="overflow-x-auto rounded border bg-white">
      <table className="w-full text-sm">
        <thead className="bg-gray-50">
          <tr>
            <th className="border p-2 text-left">Date</th>
            <th className="border p-2 text-left">Time</th>
            <th className="border p-2 text-left">Client</th>
            <th className="border p-2 text-left">Service</th>
            <th className="border p-2 text-left">Status</th>
            <th className="border p-2 text-left">Actions</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 ? (
            <tr><td colSpan="6" className="p-4 text-center text-gray-500">{empty}</td></tr>
          ) : items.map((appt) => (
            <tr key={appt._id}>
              <td className="border p-2">{formatDate(appt.date)}</td>
              <td className="border p-2">{formatTime(appt.time)}{appt.duration ? <div className="text-xs text-gray-500">{appt.duration} min</div> : null}</td>
              <td className="border p-2">{[appt.clientId?.firstName, appt.clientId?.lastName].filter(Boolean).join(' ') || appt.clientName || 'Client'}</td>
              <td className="border p-2">{appt.serviceId?.name || appt.service || 'Service'}</td>
              <td className="border p-2 capitalize">{appt.status}</td>
              <td className="border p-2">
                <div className="flex flex-wrap gap-2">
                  {canCompleteAppointment && appt.status !== 'completed' && <button onClick={() => updateStatus(appt, 'completed')} className="rounded bg-green-600 px-2 py-1 text-xs text-white">Complete</button>}
                  {canCompleteAppointment && appt.status !== 'noshow' && <button onClick={() => updateStatus(appt, 'noshow')} className="rounded border px-2 py-1 text-xs">No-show</button>}
                  {canCancelAppointment && appt.status !== 'canceled' && <button onClick={() => updateStatus(appt, 'canceled')} className="rounded border border-red-300 px-2 py-1 text-xs text-red-700">Cancel</button>}
                  {!canCompleteAppointment && !canCancelAppointment && <span className="text-xs text-gray-400">No actions allowed</span>}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  if (loading) return <div className="p-4 text-gray-600">Loading your work dashboard…</div>;

  return (
    <div className="p-4 space-y-6">
      <div className="rounded border bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-bold">My Work</h2>
            <p className="text-sm text-gray-600">{workerName(profile)} · {profile?.title || 'Staff'} · {profile?.roleId?.name || profile?.roleKey || 'worker'}</p>
          </div>
          {canCreateAppointment && (
            <button onClick={() => setAppointmentModalOpen(true)} className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
              + New Appointment
            </button>
          )}
        </div>
      </div>

      {notifications.length > 0 && (
        <section className="rounded border border-amber-200 bg-amber-50 p-4 shadow-sm">
          <h3 className="font-semibold text-amber-900">Notifications</h3>
          <p className="mb-3 text-xs text-amber-800">Items that affect your assigned clients or your bookings.</p>
          <div className="space-y-2">
            {notifications.map((item) => (
              <div key={item._id} className="rounded border bg-white p-3 text-sm">
                <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="font-semibold">{item.title || 'Notification'}</div>
                    <div className="mt-1 text-gray-700">{item.message}</div>
                    {item.createdAt && <div className="mt-1 text-xs text-gray-500">{new Date(item.createdAt).toLocaleString()}</div>}
                  </div>
                  <button onClick={() => markNotificationRead(item._id)} className="shrink-0 rounded border px-2 py-1 text-xs hover:bg-gray-50">
                    Reviewed
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="space-y-3">
        <h3 className="font-semibold">Today</h3>
        <AppointmentList items={grouped.today} empty="No appointments for today." />
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">Upcoming</h3>
        <AppointmentList items={grouped.upcoming} empty="No upcoming appointments." />
      </section>


      <section className="rounded border bg-white p-4 shadow-sm">
        <h3 className="font-semibold">Account</h3>
        <p className="mb-3 text-xs text-gray-500">Use this after receiving a temporary password from an owner/admin.</p>
        <div className="grid gap-3 md:grid-cols-3">
          <input type="password" className="border p-2" placeholder="Current password" value={passwordForm.currentPassword} onChange={(e) => setPasswordForm((p) => ({ ...p, currentPassword: e.target.value }))} />
          <input type="password" className="border p-2" placeholder="New password" value={passwordForm.newPassword} onChange={(e) => setPasswordForm((p) => ({ ...p, newPassword: e.target.value }))} />
          <button onClick={changePassword} className="rounded bg-gray-800 px-4 py-2 text-white">Change Password</button>
        </div>
      </section>

      <section className="rounded border bg-white p-4 shadow-sm">
        <h3 className="font-semibold">Request Time Off / Block Time</h3>
        <p className="mb-3 text-xs text-gray-500">Worker requests are pending until an owner/admin approves them.</p>
        <div className="grid gap-3 md:grid-cols-3">
          <select className="border p-2" value={requestForm.type} onChange={(e) => setRequestForm((p) => ({ ...p, type: e.target.value }))}>
            <option value="time_off">Time off</option>
            <option value="vacation">Vacation</option>
            <option value="sick">Sick</option>
            <option value="break">Break</option>
            <option value="training">Training</option>
            <option value="other">Other</option>
          </select>
          <input className="border p-2" placeholder="Label" value={requestForm.label} onChange={(e) => setRequestForm((p) => ({ ...p, label: e.target.value }))} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={requestForm.allDay} onChange={(e) => setRequestForm((p) => ({ ...p, allDay: e.target.checked }))} /> All day</label>
          <input type="date" className="border p-2" value={requestForm.startDate} onChange={(e) => setRequestForm((p) => ({ ...p, startDate: e.target.value }))} />
          <input type="date" className="border p-2" value={requestForm.endDate} onChange={(e) => setRequestForm((p) => ({ ...p, endDate: e.target.value }))} />
          {!requestForm.allDay && (
            <>
              <input type="time" className="border p-2" value={requestForm.startTime} onChange={(e) => setRequestForm((p) => ({ ...p, startTime: e.target.value }))} />
              <input type="time" className="border p-2" value={requestForm.endTime} onChange={(e) => setRequestForm((p) => ({ ...p, endTime: e.target.value }))} />
            </>
          )}
        </div>
        <textarea className="mt-3 w-full border p-2" placeholder="Reason / note" value={requestForm.requestNote} onChange={(e) => setRequestForm((p) => ({ ...p, requestNote: e.target.value }))} />
        <div className="mt-3 flex justify-end"><button onClick={submitRequest} className="rounded bg-blue-600 px-4 py-2 text-white">Submit Request</button></div>

        <div className="mt-5">
          <h4 className="mb-2 text-sm font-semibold">My time-off/block requests</h4>
          <div className="space-y-2">
            {(profile?.blockedTimes || []).length === 0 ? <div className="text-sm text-gray-500">No requests yet.</div> : (profile.blockedTimes || []).slice().reverse().map((block) => (
              <div key={block.blockId || `${block.startDate}-${block.label}`} className="flex flex-col gap-2 rounded border p-3 text-sm md:flex-row md:items-center md:justify-between">
                <div>
                  <div className="font-medium">{block.label || block.type || 'Unavailable'} <span className="ml-2 rounded bg-gray-100 px-2 py-[1px] text-xs capitalize">{block.status || 'approved'}</span></div>
                  <div className="text-xs text-gray-500">{block.startDate}{block.endDate && block.endDate !== block.startDate ? ` to ${block.endDate}` : ''}{block.allDay === false ? ` · ${block.startTime}–${block.endTime}` : ' · all day'}</div>
                </div>
                {block.status === 'pending' && <button onClick={() => cancelRequest(block)} className="rounded border border-red-300 px-3 py-1 text-xs text-red-700">Cancel request</button>}
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="space-y-3">
        <h3 className="font-semibold">Recent completed / closed appointments</h3>
        <AppointmentList items={grouped.completed} empty="No completed appointments yet." />
      </section>
      <AppointmentFormModal
        isOpen={appointmentModalOpen}
        onClose={() => setAppointmentModalOpen(false)}
        onSave={createAppointment}
        initialData={null}
      />
    </div>
  );
}
