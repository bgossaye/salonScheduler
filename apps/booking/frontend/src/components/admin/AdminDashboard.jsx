import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'react-toastify';
import API from '../../api';
import { getAdminUser, hasAnyPermission, hasPermission } from '../../utils/permissions';
import { formatDate, formatTime } from '../../utils/formatHelper';
import { Calendar, CheckCircle, Clock, DollarSign, AlertTriangle, Users, Briefcase, MessageSquare, Settings, PlusCircle, RefreshCcw, Bug, ChevronDown, ChevronRight } from 'lucide-react';

const FAILED_SMS_STATUSES = ['failed', 'undelivered', 'delivery_failed'];

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : '$0.00';
}

function shortPhone(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 10) return phone || 'No phone';
  return `(${digits.slice(-10, -7)}) ${digits.slice(-7, -4)}-${digits.slice(-4)}`;
}

function statusBadge(status) {
  const s = String(status || '').toLowerCase();
  if (s === 'pending') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (s === 'completed') return 'bg-green-100 text-green-800 border-green-200';
  if (s === 'booked') return 'bg-blue-100 text-blue-800 border-blue-200';
  if (s.includes('cancel')) return 'bg-red-100 text-red-800 border-red-200';
  return 'bg-gray-100 text-gray-700 border-gray-200';
}

function attentionStyle(severity) {
  if (severity === 'danger') return 'border-red-200 bg-red-50 text-red-800';
  if (severity === 'warning') return 'border-amber-200 bg-amber-50 text-amber-800';
  if (severity === 'info') return 'border-blue-200 bg-blue-50 text-blue-800';
  return 'border-green-200 bg-green-50 text-green-800';
}

function StatCard({ title, value, detail, icon, tone = 'gray' }) {
  const tones = {
    blue: 'bg-blue-50 border-blue-100 text-blue-900',
    green: 'bg-green-50 border-green-100 text-green-900',
    amber: 'bg-amber-50 border-amber-100 text-amber-900',
    red: 'bg-red-50 border-red-100 text-red-900',
    gray: 'bg-white border-gray-200 text-gray-900',
  };

  return (
    <div className={`rounded-xl border p-4 shadow-sm ${tones[tone] || tones.gray}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium opacity-80">{title}</p>
        <div className="opacity-70">{icon}</div>
      </div>
      <p className="mt-3 text-2xl font-bold">{value}</p>
      {detail && <p className="mt-1 text-xs opacity-75">{detail}</p>}
    </div>
  );
}

function Section({ title, subtitle, action, children }) {
  return (
    <section className="rounded-xl border bg-white shadow-sm overflow-hidden">
      <div className="border-b bg-gray-50 px-4 py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="font-semibold text-gray-900">{title}</h3>
          {subtitle && <p className="text-sm text-gray-600">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function EmptyState({ children }) {
  return <div className="rounded-lg border border-dashed bg-gray-50 p-4 text-sm text-gray-500">{children}</div>;
}


function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function canViewSystemErrors() {
  const admin = getAdminUser();
  const roleKey = String(admin?.roleKey || admin?.role || '').toLowerCase();
  return roleKey === 'owner' || roleKey === 'admin' || hasPermission('systemErrorsView');
}

function SystemErrorWindow({ summary, onResolved }) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState(summary?.latest || []);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState('');
  const [loadError, setLoadError] = useState('');
  const [includeResolved, setIncludeResolved] = useState(false);
  const [counts, setCounts] = useState({
    unresolved: Number(summary?.unresolved || 0),
    last24h: Number(summary?.last24h || 0),
    resolvedHistory: 0,
    totalOccurrences: 0,
  });
  const [retention, setRetention] = useState(summary?.retention || null);

  const visible = summary?.canView || canViewSystemErrors();

  const loadErrors = useCallback(async ({ silent = false } = {}) => {
    if (!visible) return;
    if (!silent) setLoading(true);
    setLoadError('');
    try {
      const { data } = await API.get(`/admin/system-errors?limit=50&includeResolved=${includeResolved ? 'true' : 'false'}`);
      setLogs(data?.logs || []);
      setCounts({
        unresolved: Number(data?.unresolvedCount || 0),
        last24h: Number(data?.activeLast24hCount ?? data?.last24hCount ?? 0),
        resolvedHistory: Number(data?.resolvedHistoryCount || 0),
        totalOccurrences: Number(data?.totalOccurrences || 0),
      });
      setRetention(data?.retention || null);
    } catch (err) {
      if (!silent) setLoadError(err?.response?.data?.error || 'Failed to load system error logs.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, [visible, includeResolved]);

  useEffect(() => {
    if (open) return;
    setLogs(summary?.latest || []);
    setCounts({
      unresolved: Number(summary?.unresolved || 0),
      last24h: Number(summary?.last24h || 0),
      resolvedHistory: Number(summary?.resolvedHistory || 0),
      totalOccurrences: 0,
    });
    setRetention(summary?.retention || null);
  }, [summary, open]);

  useEffect(() => {
    if (!open || !visible) return undefined;
    loadErrors({ silent: true });
    const timer = window.setInterval(() => loadErrors({ silent: true }), 30000);
    return () => window.clearInterval(timer);
  }, [open, visible, loadErrors]);

  const toggleOpen = async () => {
    const next = !open;
    setOpen(next);
    if (next) await loadErrors();
  };

  const resolveLog = async (log) => {
    if (!log?._id) return;
    try {
      await API.patch(`/admin/system-errors/${log._id}/resolve`, {});
      await loadErrors({ silent: true });
      toast.success('System error marked resolved.');
      onResolved?.();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to mark system error resolved.');
    }
  };

  const resolveAll = async () => {
    if (counts.unresolved <= 0) return;
    const ok = window.confirm('Mark all currently unresolved system errors as resolved? New errors will still appear automatically.');
    if (!ok) return;

    setLoading(true);
    try {
      const { data } = await API.patch('/admin/system-errors/resolve-all', {});
      toast.success(`Marked ${data?.resolvedCount || 0} system error${Number(data?.resolvedCount || 0) === 1 ? '' : 's'} resolved.`);
      await loadErrors({ silent: true });
      onResolved?.();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to mark system errors resolved.');
    } finally {
      setLoading(false);
    }
  };

  if (!visible) return null;

  const unresolved = Number(counts.unresolved || 0);
  const last24h = Number(counts.last24h || 0);

  return (
    <section className="rounded-xl border border-red-200 bg-white shadow-sm overflow-hidden">
      <button
        type="button"
        onClick={toggleOpen}
        className="w-full border-b bg-red-50 px-4 py-3 flex items-center justify-between gap-3 text-left hover:bg-red-100"
      >
        <span className="flex items-center gap-2 min-w-0">
          {open ? <ChevronDown size={18} /> : <ChevronRight size={18} />}
          <Bug size={18} className="text-red-700" />
          <span>
            <span className="block font-semibold text-red-900">System Errors</span>
            <span className="block text-xs text-red-700">Owner/Admin only · deduped active errors · small capped history</span>
          </span>
        </span>
        <span className="flex flex-wrap justify-end gap-2 text-xs">
          <span className={`rounded-full px-2 py-1 ${last24h ? 'bg-red-700 text-white' : 'bg-white text-red-700 border border-red-200'}`}>{last24h} active last 24h</span>
          <span className={`rounded-full px-2 py-1 ${unresolved ? 'bg-red-100 text-red-800 border border-red-200' : 'bg-white text-red-700 border border-red-200'}`}>{unresolved} unresolved</span>
          {includeResolved && <span className="rounded-full bg-white px-2 py-1 text-red-700 border border-red-200">{counts.resolvedHistory || 0} history kept</span>}
        </span>
      </button>

      {open && (
        <div className="p-4 space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <p className="text-sm text-gray-600">
              This window keeps storage small: repeated errors are merged into one active row with a repeat count, unresolved errors are kept first, and resolved history is automatically capped/pruned.
            </p>
            {retention && (
              <p className="text-xs text-gray-500">
                Policy: keep up to {retention.activeLimit || 150} active unique errors and {retention.resolvedLimit || 40} resolved history rows for about {retention.resolvedRetentionDays || 14} days.
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIncludeResolved((value) => !value)}
                className="shrink-0 rounded border bg-white px-3 py-1.5 text-xs hover:bg-gray-50"
              >
                {includeResolved ? 'Show Active Only' : 'Show History'}
              </button>
              <button
                type="button"
                onClick={resolveAll}
                disabled={loading || unresolved <= 0}
                className="shrink-0 rounded border bg-white px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-60"
              >
                Resolve All
              </button>
              <button
                type="button"
                onClick={() => loadErrors()}
                disabled={loading}
                className="shrink-0 rounded border bg-white px-3 py-1.5 text-xs hover:bg-gray-50 disabled:opacity-60"
              >
                {loading ? 'Loading…' : 'Refresh Errors'}
              </button>
            </div>
          </div>

          {loadError && <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">{loadError}</div>}

          {loading && logs.length === 0 ? (
            <EmptyState>Loading system errors…</EmptyState>
          ) : logs.length === 0 ? (
            <EmptyState>{includeResolved ? 'No retained system error history.' : 'No unresolved system errors.'}</EmptyState>
          ) : (
            <div className="max-h-96 overflow-y-auto rounded-lg border divide-y">
              {logs.map((log) => {
                const expanded = expandedId === log._id;
                const isResolved = !!log.resolved;
                return (
                  <div key={log._id} className={`p-3 ${isResolved ? 'bg-gray-50' : 'bg-white'}`}>
                    <button
                      type="button"
                      onClick={() => setExpandedId(expanded ? '' : log._id)}
                      className="w-full text-left flex items-start justify-between gap-3"
                    >
                      <span className="min-w-0">
                        <span className="block text-xs text-gray-500">Last: {formatDateTime(log.lastOccurredAt || log.occurredAt)} · {log.source || 'system'}{log.route ? ` · ${log.method || ''} ${log.route}` : ''}</span>
                        <span className={`block font-medium break-words ${isResolved ? 'text-gray-700' : 'text-red-800'}`}>{log.message || 'System error'}</span>
                        {Number(log.occurrenceCount || 1) > 1 && <span className="block text-xs font-semibold text-red-700">Repeated {Number(log.occurrenceCount || 1).toLocaleString()} times · first seen {formatDateTime(log.firstOccurredAt)}</span>}
                        {log.adminEmail && <span className="block text-xs text-gray-500">Admin: {log.adminEmail}</span>}
                        {isResolved && <span className="block text-xs text-gray-500">Resolved{log.resolvedBy ? ` by ${log.resolvedBy}` : ''}{log.resolvedAt ? ` · ${formatDateTime(log.resolvedAt)}` : ''}</span>}
                      </span>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs ${isResolved ? 'bg-gray-200 text-gray-700' : 'bg-red-100 text-red-700'}`}>
                        {isResolved ? 'resolved' : Number(log.occurrenceCount || 1) > 1 ? `${Number(log.occurrenceCount || 1).toLocaleString()}x` : 'error'}
                      </span>
                    </button>
                    {expanded && (
                      <div className="mt-3 space-y-2">
                        <div className="flex flex-wrap items-center gap-2">
                          {log.name && <div className="text-xs text-gray-600">Type: {log.name}</div>}
                          <div className="text-xs text-gray-600">Last seen: {formatDateTime(log.lastOccurredAt || log.occurredAt)}</div>
                          {log.firstOccurredAt && <div className="text-xs text-gray-600">First seen: {formatDateTime(log.firstOccurredAt)}</div>}
                          {!isResolved && (
                            <button
                              type="button"
                              onClick={() => resolveLog(log)}
                              className="rounded border bg-white px-2 py-1 text-xs hover:bg-gray-50"
                            >
                              Mark Resolved
                            </button>
                          )}
                        </div>
                        {log.details && (
                          <pre className="max-h-40 overflow-auto rounded bg-gray-900 p-3 text-xs text-gray-100 whitespace-pre-wrap">{log.details}</pre>
                        )}
                        {log.stack && (
                          <pre className="max-h-52 overflow-auto rounded bg-gray-50 p-3 text-xs text-gray-700 whitespace-pre-wrap border">{log.stack}</pre>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

export default function AdminDashboard() {
  const [dashboard, setDashboard] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState('');
  const [error, setError] = useState('');

  const canSeeRevenue = hasPermission('reportsView');
  const canCompleteAppointments = hasAnyPermission(['appointmentsEdit', 'appointmentsEditOwn', 'appointmentsEditForOthers']) || hasPermission('appointmentsComplete');
  const canCancelAppointments = hasAnyPermission(['appointmentsEdit', 'appointmentsEditOwn', 'appointmentsEditForOthers']) || hasPermission('appointmentsCancel');

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await API.get('/admin/dashboard');
      setDashboard(data);
    } catch (err) {
      console.error('Failed to load admin dashboard', err);
      setError(err?.response?.data?.error || 'Failed to load dashboard. Please make sure you are logged in.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const updateAppointmentStatus = async (appt, status) => {
    if (!appt?._id) return;
    setUpdatingId(appt._id);
    try {
      await API.patch(`/admin/appointments/${appt._id}`, { status });
      toast.success(status === 'completed' ? 'Appointment marked completed.' : 'Appointment canceled.');
      await loadDashboard();
    } catch (err) {
      toast.error(err?.response?.data?.error || err?.response?.data?.message || 'Failed to update appointment.');
    } finally {
      setUpdatingId('');
    }
  };


  const markNotificationRead = async (notificationId) => {
    if (!notificationId) return;
    try {
      await API.patch(`/admin/notifications/${notificationId}/read`, {});
      toast.success('Notification marked reviewed.');
      await loadDashboard();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update notification.');
    }
  };

  const attentionNeedingAction = useMemo(() => (
    (dashboard?.attentionItems || []).filter((item) => item.severity !== 'ok' && Number(item.count || 0) > 0)
  ), [dashboard]);

  const allAttentionGreen = attentionNeedingAction.length === 0;

  if (loading) {
    return (
      <div className="p-4 max-w-7xl mx-auto">
        <div className="rounded-xl border bg-white p-6 text-gray-600 shadow-sm">Loading Rakie Salon dashboard…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 max-w-7xl mx-auto space-y-4">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-700">{error}</div>
        <button onClick={loadDashboard} className="rounded bg-blue-600 px-4 py-2 text-white">Try Again</button>
      </div>
    );
  }

  const snapshot = dashboard?.snapshot || {};
  const sms = dashboard?.smsStatus || {};
  const smsSafeModeActive = sms.auditCopyEnabled === true
    && sms.clientDeliveryEnabled === false
    && sms.reminderStrictDateTimeValidation === true;
  const notifications = dashboard?.adminNotifications || {};
  const today = dashboard?.dates?.today || '';

  return (
    <div className="p-4 max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Rakie Salon Control Center</h2>
          <p className="text-sm text-gray-600">
            Daily view for appointments, stylists, setup health, SMS safety, and quick actions.
          </p>
          <p className="text-xs text-gray-500 mt-1">
            Today: {today ? formatDate(today) : '—'} · Timezone: {dashboard?.timezone || 'America/New_York'}
          </p>
        </div>
        <button
          type="button"
          onClick={loadDashboard}
          className="inline-flex items-center justify-center gap-2 rounded border bg-white px-4 py-2 text-sm hover:bg-gray-50"
        >
          <RefreshCcw size={16} /> Refresh
        </button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <StatCard
          title="Today’s Appointments"
          value={snapshot.todayAppointments || 0}
          detail={`${snapshot.todayBookedOrPending || 0} booked or pending`}
          icon={<Calendar size={22} />}
          tone="blue"
        />
        <StatCard
          title="Pending Confirmations"
          value={snapshot.pendingConfirmations || 0}
          detail="Needs admin attention"
          icon={<Clock size={22} />}
          tone={(snapshot.pendingConfirmations || 0) > 0 ? 'amber' : 'green'}
        />
        <StatCard
          title="Completed Today"
          value={snapshot.completedToday || 0}
          detail={`${snapshot.canceledToday || 0} canceled today`}
          icon={<CheckCircle size={22} />}
          tone="green"
        />
        <StatCard
          title="SMS Failed"
          value={sms.failedLast24h || 0}
          detail={`${sms.messagesLast24h || 0} SMS events in 24h`}
          icon={<MessageSquare size={22} />}
          tone={(sms.failedLast24h || 0) > 0 ? 'red' : 'green'}
        />
        <StatCard
          title="Estimated Revenue"
          value={canSeeRevenue ? money(snapshot.estimatedRevenueToday) : 'Hidden'}
          detail={canSeeRevenue ? `Week ${money(snapshot.estimatedRevenueThisWeek)} · Month ${money(snapshot.estimatedRevenueThisMonth)}` : 'Requires report permission'}
          icon={<DollarSign size={22} />}
          tone="gray"
        />
      </div>

      <SystemErrorWindow summary={dashboard?.systemErrors} onResolved={loadDashboard} />

      <div className="grid grid-cols-1 xl:grid-cols-[1.7fr_1fr] gap-6">
        <div className="space-y-6">
          <Section
            title="Today’s Schedule"
            subtitle="Quickly see who is coming in, with stylist and price context."
            action={<Link to="/admin/appointments" className="text-sm text-blue-600 hover:underline">Open Appointments</Link>}
          >
            {(dashboard?.todaySchedule || []).length === 0 ? (
              <EmptyState>No appointments scheduled for today.</EmptyState>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs uppercase tracking-wide text-gray-500 border-b">
                      <th className="py-2 pr-3">Time</th>
                      <th className="py-2 pr-3">Client</th>
                      <th className="py-2 pr-3">Service</th>
                      <th className="py-2 pr-3">Stylist</th>
                      <th className="py-2 pr-3">Price</th>
                      <th className="py-2 pr-3">Status</th>
                      <th className="py-2 pr-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {(dashboard?.todaySchedule || []).map((appt) => (
                      <tr key={appt._id} className="align-top">
                        <td className="py-3 pr-3 whitespace-nowrap">
                          <div className="font-semibold">{formatTime(appt.time)}</div>
                          <div className="text-xs text-gray-500">{appt.duration || 0} min</div>
                        </td>
                        <td className="py-3 pr-3">
                          <div className="font-medium">{appt.clientName}</div>
                          <div className="text-xs text-gray-500">{appt.clientNickname ? `${appt.clientNickname} · ` : ''}{shortPhone(appt.clientPhone)}</div>
                        </td>
                        <td className="py-3 pr-3">{appt.service}</td>
                        <td className="py-3 pr-3">{appt.workerName}</td>
                        <td className="py-3 pr-3">{canSeeRevenue ? money(appt.price) : '—'}</td>
                        <td className="py-3 pr-3">
                          <span className={`inline-flex rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge(appt.status)}`}>
                            {appt.status || 'booked'}
                          </span>
                        </td>
                        <td className="py-3 pr-3 text-right whitespace-nowrap">
                          <div className="flex justify-end gap-2">
                            <Link to="/admin/appointments" className="rounded border px-2 py-1 text-xs hover:bg-gray-50">View</Link>
                            {canCompleteAppointments && appt.status !== 'completed' && (
                              <button
                                type="button"
                                disabled={updatingId === appt._id}
                                onClick={() => updateAppointmentStatus(appt, 'completed')}
                                className="rounded bg-green-600 px-2 py-1 text-xs text-white disabled:opacity-60"
                              >
                                Complete
                              </button>
                            )}
                            {canCancelAppointments && !String(appt.status || '').includes('cancel') && (
                              <button
                                type="button"
                                disabled={updatingId === appt._id}
                                onClick={() => updateAppointmentStatus(appt, 'canceled')}
                                className="rounded bg-red-600 px-2 py-1 text-xs text-white disabled:opacity-60"
                              >
                                Cancel
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          <Section
            title="Upcoming Appointments"
            subtitle="Next booked or pending appointments for the coming days."
            action={<Link to="/admin/appointments" className="text-sm text-blue-600 hover:underline">Manage Schedule</Link>}
          >
            {(dashboard?.upcomingAppointments || []).length === 0 ? (
              <EmptyState>No upcoming booked or pending appointments found.</EmptyState>
            ) : (
              <div className="space-y-3">
                {(dashboard?.upcomingAppointments || []).map((appt) => (
                  <div key={appt._id} className="rounded-lg border p-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                      <div className="font-semibold">{formatDate(appt.date)} at {formatTime(appt.time)} · {appt.service}</div>
                      <div className="text-sm text-gray-600">{appt.clientName} with {appt.workerName}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      {canSeeRevenue && <span className="text-sm font-semibold">{money(appt.price)}</span>}
                      <span className={`rounded-full border px-2 py-0.5 text-xs font-medium ${statusBadge(appt.status)}`}>{appt.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>
        </div>

        <div className="space-y-6">
          <Section title="Quick Actions" subtitle="Common admin tasks.">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-1 gap-3">
              <Link to="/admin/appointments" className="rounded-lg border p-3 hover:bg-blue-50 flex items-center gap-2"><PlusCircle size={18} /> New Appointment</Link>
              <Link to="/admin/clients" className="rounded-lg border p-3 hover:bg-blue-50 flex items-center gap-2"><Users size={18} /> Clients</Link>
              <Link to="/admin/workers" className="rounded-lg border p-3 hover:bg-blue-50 flex items-center gap-2"><Briefcase size={18} /> Staff / Workers</Link>
              <Link to="/admin/services" className="rounded-lg border p-3 hover:bg-blue-50 flex items-center gap-2"><Settings size={18} /> Services & Prices</Link>
              <Link to="/admin/deals-coupons" className="rounded-lg border p-3 hover:bg-blue-50 flex items-center gap-2"><DollarSign size={18} /> Deals & Coupons</Link>
              <Link to="/admin/runtime-settings" className="rounded-lg border p-3 hover:bg-blue-50 flex items-center gap-2"><Settings size={18} /> Runtime Settings</Link>
            </div>
          </Section>

          <Section title="Admin Notifications" subtitle="Client/stylist switch requests and staff actions.">
            {(notifications.latest || []).length === 0 ? (
              <EmptyState>No unread admin notifications.</EmptyState>
            ) : (
              <div className="space-y-2">
                {(notifications.latest || []).map((item) => (
                  <div key={item._id} className={`rounded-lg border p-3 text-sm ${attentionStyle(item.severity || 'info')}`}>
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <div className="font-semibold">{item.title || 'Notification'}</div>
                        <div className="mt-1">{item.message}</div>
                        <div className="mt-1 text-xs opacity-75">{formatDateTime(item.createdAt)}</div>
                      </div>
                      <button
                        type="button"
                        onClick={() => markNotificationRead(item._id)}
                        className="shrink-0 rounded border bg-white px-2 py-1 text-xs hover:bg-gray-50"
                      >
                        Reviewed
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          <Section title="Needs Attention" subtitle="Setup and daily operations warnings.">
            {allAttentionGreen ? (
              <div className="rounded-lg border border-green-200 bg-green-50 p-4 text-sm text-green-800">
                Everything important looks clear right now.
              </div>
            ) : (
              <div className="space-y-2">
                {attentionNeedingAction.map((item) => (
                  <Link key={item.key} to={item.path || '/admin/dashboard'} className={`block rounded-lg border p-3 text-sm ${attentionStyle(item.severity)}`}>
                    <div className="flex items-start gap-2">
                      <AlertTriangle size={16} className="mt-0.5 flex-shrink-0" />
                      <span>{item.label}</span>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Section>

          <Section title="SMS / System Health" subtitle="Reminder safety switches and recent SMS status.">
            <div className="space-y-3 text-sm">
              {smsSafeModeActive && (
                <div className="rounded-lg border border-red-300 bg-red-50 p-3 text-red-800">
                  <div className="font-semibold">SMS DEBUG SAFE MODE ACTIVE</div>
                  <div className="mt-1 text-xs">
                    Client appointment/reminder/promo SMS are blocked. Audit copy is receiving the would-be client messages. OTP/PIN login messages are still allowed.
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded border bg-gray-50 p-2">
                  <div className="text-xs text-gray-500">Audit Copy</div>
                  <div className="font-semibold">{sms.auditCopyEnabled ? 'ON' : 'OFF'}</div>
                </div>
                <div className={`rounded border p-2 ${sms.clientDeliveryEnabled === false ? 'bg-red-50 border-red-200' : 'bg-gray-50'}`}>
                  <div className="text-xs text-gray-500">Client SMS Delivery</div>
                  <div className="font-semibold">{sms.clientDeliveryEnabled === false ? 'OFF' : 'ON'}</div>
                </div>
                <div className="rounded border bg-gray-50 p-2">
                  <div className="text-xs text-gray-500">Strict Reminder Time</div>
                  <div className="font-semibold">{sms.reminderStrictDateTimeValidation ? 'ON' : 'OFF'}</div>
                </div>
                <div className="rounded border bg-gray-50 p-2">
                  <div className="text-xs text-gray-500">Block Invalid Date/Time</div>
                  <div className="font-semibold">{sms.blockInvalidDateTime ? 'ON' : 'OFF'}</div>
                </div>
                <div className="rounded border bg-gray-50 p-2">
                  <div className="text-xs text-gray-500">Client Name in SMS</div>
                  <div className="font-semibold">{sms.clientNameEnabled ? 'ON' : 'OFF'}</div>
                </div>
                <div className={`rounded border p-2 ${sms.blockSixAmReminders ? 'bg-amber-50 border-amber-200' : 'bg-gray-50'}`}>
                  <div className="text-xs text-gray-500">6 AM Reminder Guard</div>
                  <div className="font-semibold">{sms.blockSixAmReminders ? 'ON' : 'OFF'}</div>
                </div>
                <div className="rounded border bg-gray-50 p-2">
                  <div className="text-xs text-gray-500">Audit Only Legacy</div>
                  <div className="font-semibold">{sms.auditOnlyMode ? 'ON' : 'OFF'}</div>
                </div>
              </div>
              <p className="text-xs text-gray-500">Audit phone: {sms.auditCopyTo || 'not set'}</p>
              {sms.clientDeliveryEnabled === false && (
                <p className="rounded border border-red-200 bg-red-50 p-2 text-xs text-red-700">
                  Client SMS delivery is OFF. Customers will not receive non-auth SMS; audit copy receives the would-be message when audit copy is ON.
                </p>
              )}
              {(sms.statusLogs || []).length > 0 ? (
                <div className="rounded border divide-y">
                  {(sms.statusLogs || []).slice(0, 4).map((log) => (
                    <div key={log._id} className="p-2 flex items-center justify-between gap-2">
                      <span className="truncate">{shortPhone(log.to)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${FAILED_SMS_STATUSES.includes(String(log.status || '').toLowerCase()) ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
                        {log.status}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState>No SMS status events in the last 24 hours.</EmptyState>
              )}
            </div>
          </Section>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Section title="Stylist Status" subtitle="Worker coverage, client assignment, and today’s activity.">
          {(dashboard?.workers || []).length === 0 ? (
            <EmptyState>No active workers found. Open Staff / Workers and run the Rakeb migration.</EmptyState>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {(dashboard?.workers || []).map((worker) => (
                <div key={worker._id} className="rounded-xl border p-4 bg-white">
                  <div className="flex gap-3">
                    <div className="h-14 w-14 rounded-full bg-gray-100 overflow-hidden flex items-center justify-center text-gray-400 font-bold">
                      {worker.photoUrl ? <img src={worker.photoUrl} alt={worker.displayName} className="h-full w-full object-cover" /> : worker.displayName?.slice(0, 1)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-semibold truncate">{worker.displayName}</div>
                      <div className="text-sm text-gray-600">{worker.title}</div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {worker.isDefault && <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-800">Default</span>}
                        {worker.showOnline && <span className="rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-800">Online</span>}
                        {!worker.canUseChemicals && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">No chemicals</span>}
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
                    <div className="rounded bg-gray-50 p-2"><span className="block text-xs text-gray-500">Today</span><strong>{worker.todayAppointments}</strong></div>
                    <div className="rounded bg-gray-50 p-2"><span className="block text-xs text-gray-500">Revenue</span><strong>{canSeeRevenue ? money(worker.todayRevenue) : '—'}</strong></div>
                    <div className="rounded bg-gray-50 p-2"><span className="block text-xs text-gray-500">Services</span><strong>{worker.assignedServicesCount}</strong></div>
                    <div className="rounded bg-gray-50 p-2"><span className="block text-xs text-gray-500">Clients</span><strong>{worker.assignedClients}</strong></div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Section>

        <Section title="Setup Checklist" subtitle="Migration and worker-system readiness.">
          <div className="space-y-2">
            {(dashboard?.setupChecklist || []).map((item) => (
              <Link key={item.key} to={item.path || '/admin/dashboard'} className="flex items-start gap-3 rounded-lg border p-3 hover:bg-gray-50">
                <span className={`mt-0.5 inline-flex h-5 w-5 items-center justify-center rounded-full text-xs ${item.done ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                  {item.done ? '✓' : '!'}
                </span>
                <span className="flex-1">
                  <span className="block font-medium text-gray-900">{item.label}</span>
                  {item.detail && <span className="block text-xs text-gray-500">{item.detail}</span>}
                </span>
              </Link>
            ))}
          </div>
        </Section>
      </div>

      <Section title="Recent Clients" subtitle="Newest client records for quick follow-up.">
        {(dashboard?.recentClients || []).length === 0 ? (
          <EmptyState>No clients found yet.</EmptyState>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {(dashboard?.recentClients || []).map((client) => (
              <Link key={client._id} to={`/admin/client/${client._id}`} className="rounded-lg border p-3 hover:bg-gray-50">
                <div className="font-semibold">{client.name}</div>
                <div className="text-sm text-gray-600">{shortPhone(client.phone)}</div>
                <div className="text-xs text-gray-500 mt-1">Assigned stylist: {client.assignedStylist || '—'}</div>
              </Link>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}
