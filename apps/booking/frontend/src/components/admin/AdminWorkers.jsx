import React, { useEffect, useMemo, useState } from 'react';
import API from '../../api';
import { toast } from 'react-toastify';

const EMPTY_WORKER = {
  firstName: '',
  lastName: '',
  displayName: '',
  email: '',
  phone: '',
  roleId: '',
  tierKey: 'regular',
  title: 'Stylist',
  photoUrl: '',
  shortBio: '',
  bio: '',
  experienceYears: '',
  specialtiesText: '',
  languagesText: '',
  certificationsText: '',
  active: true,
  showOnline: true,
  onlineBookable: true,
  canUseChemicals: true,
  canTakeWalkIns: true,
  color: '',
  bookingOrder: 100,
  serviceAssignments: [],
  notes: '',
  createStaffAccess: false,
};

const EMPTY_ROLE = {
  name: '',
  key: '',
  description: '',
  permissions: {},
  active: true,
};

const TIER_OPTIONS = [
  ['assistant', 'Assistant'],
  ['junior', 'Junior'],
  ['regular', 'Regular'],
  ['senior', 'Senior'],
  ['master', 'Master'],
  ['elite', 'Elite'],
  ['owner', 'Owner'],
  ['custom', 'Custom'],
];

const PERMISSION_LABELS = {
  appointmentsViewAll: 'View all appointments',
  appointmentsViewOwn: 'View own appointments',
  appointmentsCreate: 'Create appointments (legacy/all)',
  appointmentsEdit: 'Edit appointments (legacy/all)',
  appointmentsCreateOwn: 'Create own appointments',
  appointmentsEditOwn: 'Edit own appointments',
  appointmentsCreateForOthers: 'Create for other stylists',
  appointmentsEditForOthers: 'Edit for other stylists',
  appointmentsDelete: 'Delete appointments',
  appointmentsCancel: 'Cancel appointments',
  appointmentsComplete: 'Mark completed',
  appointmentsOverrideConflict: 'Override booking conflicts',
  appointmentsOverridePrice: 'Override price',
  clientsViewAll: 'View all clients',
  clientsViewAssigned: 'View assigned clients',
  clientsEditProfile: 'Edit client profile',
  clientsDelete: 'Delete clients',
  clientsAddNotes: 'Add client notes',
  clientsViewPrivateNotes: 'View private notes',
  clientsAssignStylist: 'Assign client stylist',
  servicesView: 'View services',
  servicesManage: 'Manage services',
  servicesChangePrices: 'Change prices',
  servicesAssignWorkers: 'Assign workers to services',
  addOnsManage: 'Manage add-ons',
  workersView: 'View workers',
  workersManage: 'Add/edit workers',
  workersDeactivate: 'Deactivate workers',
  workersAssignRoles: 'Assign worker roles',
  workersManageSchedule: 'Manage worker schedule',
  workersManagePrices: 'Manage worker prices',
  dealsView: 'View deals',
  dealsManage: 'Manage deals',
  dealsApplyManualDiscount: 'Apply manual discount',
  giftCardsManage: 'Manage gift cards',
  reportsView: 'View reports',
  settingsManage: 'Manage settings',
  smsSettingsManage: 'Manage SMS settings',
  permissionsManage: 'Manage permissions',
  auditLogView: 'View audit log',
  systemErrorsView: 'View system errors',
};

function idOf(value) {
  return String(value?._id || value || '');
}

function textToArray(value) {
  return String(value || '').split(',').map((x) => x.trim()).filter(Boolean);
}

function arrayToText(value) {
  return Array.isArray(value) ? value.join(', ') : '';
}

function serviceName(value) {
  return value?.name || value?.serviceId?.name || 'Service';
}

function money(value) {
  const n = Number(value);
  return Number.isFinite(n) ? `$${n.toFixed(2)}` : 'Needs price';
}

function deliverySummary(delivery = []) {
  if (!Array.isArray(delivery) || delivery.length === 0) return '';
  return delivery.map((item) => `${item.channel}: ${item.status}${item.error ? ` (${item.error})` : ''}`).join(' · ');
}

async function copyText(value) {
  if (!value) return false;
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch (_) {
    return false;
  }
}

function normalizeWorker(worker) {
  return {
    ...EMPTY_WORKER,
    ...worker,
    roleId: idOf(worker?.roleId),
    photoUrl: worker?.photoUrl || worker?.profilePhoto || '',
    experienceYears: worker?.experienceYears ?? '',
    specialtiesText: arrayToText(worker?.specialties),
    languagesText: arrayToText(worker?.languages),
    certificationsText: arrayToText(worker?.certifications),
    serviceAssignments: (worker?.serviceAssignments || []).map((assignment) => ({
      serviceId: idOf(assignment.serviceId),
      enabled: assignment.enabled !== false,
      allowOnlineBooking: assignment.allowOnlineBooking !== false,
      price: assignment.price ?? '',
      duration: assignment.duration ?? '',
      commissionPercent: assignment.commissionPercent ?? '',
      notes: assignment.notes || '',
    })),
  };
}

export default function AdminWorkers() {
  const [workers, setWorkers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [services, setServices] = useState([]);
  const [defaultPermissions, setDefaultPermissions] = useState({});
  const [editingWorker, setEditingWorker] = useState(null);
  const [workerForm, setWorkerForm] = useState(EMPTY_WORKER);
  const [editingRole, setEditingRole] = useState(null);
  const [roleForm, setRoleForm] = useState(EMPTY_ROLE);
  const [activeTab, setActiveTab] = useState('workers');
  const [loading, setLoading] = useState(false);
  const [accessResult, setAccessResult] = useState(null);
  const [blockForm, setBlockForm] = useState({ label: '', type: 'time_off', startDate: '', endDate: '', allDay: true, startTime: '', endTime: '' });

  const permissionKeys = useMemo(() => Object.keys(defaultPermissions || {}), [defaultPermissions]);

  const loadAll = async () => {
    const [workerRes, roleRes, serviceRes] = await Promise.all([
      API.get('/admin/workers'),
      API.get('/admin/workers/roles'),
      API.get('/admin/services'),
    ]);
    setWorkers(workerRes.data?.workers || []);
    setRoles(roleRes.data?.roles || []);
    setDefaultPermissions(roleRes.data?.defaultPermissions || {});
    setServices(serviceRes.data || []);
  };

  useEffect(() => {
    loadAll().catch((err) => {
      console.error(err);
      toast.error('Failed to load workers and roles.');
    });
  }, []);

  const runMigration = async () => {
    if (!window.confirm('Create/update Rakeb G and assign existing clients, appointments, and services to her?')) return;
    try {
      const { data } = await API.post('/admin/workers/migrate-rakeb');
      toast.success(`Rakeb migration complete: ${data.servicesAssigned} services, ${data.clientsAssigned} clients, ${data.appointmentsAssigned} appointments checked.`);
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Migration failed.');
    }
  };

  const beginNewWorker = () => {
    const stylistRole = roles.find((role) => role.key === 'stylist') || roles[0];
    setEditingWorker(null);
    setAccessResult(null);
    setBlockForm({ label: '', type: 'time_off', startDate: '', endDate: '', allDay: true, startTime: '', endTime: '' });
    setWorkerForm({ ...EMPTY_WORKER, roleId: idOf(stylistRole) });
  };

  const beginEditWorker = (worker) => {
    setEditingWorker(worker);
    setAccessResult(null);
    setBlockForm({ label: '', type: 'time_off', startDate: '', endDate: '', allDay: true, startTime: '', endTime: '' });
    setWorkerForm(normalizeWorker(worker));
  };

  const changeWorker = (key, value) => {
    setWorkerForm((prev) => ({ ...prev, [key]: value }));
  };

  const assignmentFor = (serviceId) => workerForm.serviceAssignments.find((a) => a.serviceId === serviceId);

  const updateAssignment = (serviceId, patch) => {
    setWorkerForm((prev) => {
      const existing = prev.serviceAssignments.find((a) => a.serviceId === serviceId);
      const service = services.find((s) => idOf(s) === serviceId);
      const defaults = {
        serviceId,
        enabled: true,
        allowOnlineBooking: true,
        price: '',
        duration: service?.duration ?? '',
        commissionPercent: '',
        notes: '',
      };
      const next = existing
        ? prev.serviceAssignments.map((a) => (a.serviceId === serviceId ? { ...a, ...patch } : a))
        : [...prev.serviceAssignments, { ...defaults, ...patch }];
      return { ...prev, serviceAssignments: next };
    });
  };

  const saveWorker = async () => {
    if (!workerForm.firstName.trim()) {
      toast.error('Worker first name is required.');
      return;
    }

    const enabledMissingPrice = workerForm.serviceAssignments.find((item) => item.enabled && (item.price === '' || item.duration === ''));
    if (enabledMissingPrice) {
      toast.error('Each checked service needs this worker’s own price and duration. Do not rely on base price.');
      return;
    }

    const payload = {
      ...workerForm,
      displayName: workerForm.displayName || `${workerForm.firstName} ${workerForm.lastName}`.trim(),
      profilePhoto: workerForm.photoUrl,
      specialties: textToArray(workerForm.specialtiesText),
      languages: textToArray(workerForm.languagesText),
      certifications: textToArray(workerForm.certificationsText),
      experienceYears: workerForm.experienceYears === '' ? null : Number(workerForm.experienceYears),
      serviceAssignments: workerForm.serviceAssignments
        .filter((item) => item.enabled)
        .map((item) => ({
          ...item,
          price: Number(item.price),
          duration: Number(item.duration),
          commissionPercent: item.commissionPercent === '' ? null : Number(item.commissionPercent),
        })),
    };

    setLoading(true);
    try {
      if (editingWorker?._id) {
        await API.put(`/admin/workers/${editingWorker._id}`, payload);
        toast.success('Worker updated.');
      } else {
        const { data } = await API.post('/admin/workers', payload);
        if (data?.access) {
          setAccessResult({ title: 'Staff invite link ready', workerName: data.worker?.displayName || payload.displayName || payload.firstName, ...data.access });
        }
        toast.success('Worker created.');
      }
      setEditingWorker(null);
      setWorkerForm(EMPTY_WORKER);
      await loadAll();
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.error || 'Failed to save worker.');
    } finally {
      setLoading(false);
    }
  };

  const deleteWorker = async (worker) => {
    if (!window.confirm(`Remove or deactivate ${worker.displayName || worker.firstName}?`)) return;
    try {
      const { data } = await API.delete(`/admin/workers/${worker._id}`);
      toast.success(data?.archived ? 'Worker has appointments, so they were deactivated.' : 'Worker removed.');
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to remove worker.');
    }
  };


  const sendInvite = async (worker, channel = 'email') => {
    const action = worker.staffAccount?.exists ? 'resend invite for' : 'create login and send invite for';
    if (!window.confirm(`Do you want to ${action} ${worker.displayName || worker.firstName}?`)) return;
    try {
      const { data } = await API.post(`/admin/workers/${worker._id}/invite`, { channel });
      setAccessResult({ title: 'Staff invite link ready', workerName: worker.displayName || worker.firstName, ...data });
      if (data?.account) {
        setEditingWorker((prev) => (prev?._id === worker._id ? { ...prev, staffAccount: data.account } : prev));
        setWorkerForm((prev) => ({ ...prev, staffAccount: data.account }));
      }
      toast.success(data?.message || 'Invite sent.');
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to send invite.');
    }
  };

  const sendPasswordReset = async (worker, channel = 'email') => {
    if (!window.confirm(`Send a password reset link to ${worker.displayName || worker.firstName}?`)) return;
    try {
      const { data } = await API.post(`/admin/workers/${worker._id}/reset-password`, { channel });
      setAccessResult({ title: 'Password reset link ready', workerName: worker.displayName || worker.firstName, ...data });
      if (data?.account) {
        setEditingWorker((prev) => (prev?._id === worker._id ? { ...prev, staffAccount: data.account } : prev));
        setWorkerForm((prev) => ({ ...prev, staffAccount: data.account }));
      }
      toast.success(data?.message || 'Password reset sent.');
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to send password reset.');
    }
  };

  const createOrResetAccess = async (worker) => {
    if (worker.staffAccount?.exists) return sendPasswordReset(worker);
    return sendInvite(worker);
  };

  const setAccessStatus = async (worker, status) => {
    try {
      const { data } = await API.patch(`/admin/workers/${worker._id}/access`, { status });
      setAccessResult(null);
      toast.success(`Staff access ${data?.account?.status || status}.`);
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update staff access.');
    }
  };


  const addBlockedTime = async () => {
    if (!editingWorker?._id) return;
    if (!blockForm.startDate) {
      toast.error('Blocked time needs a start date.');
      return;
    }
    if (!blockForm.allDay && (!blockForm.startTime || !blockForm.endTime)) {
      toast.error('Partial-day blocks need start and end time.');
      return;
    }
    try {
      const { data } = await API.post(`/admin/workers/${editingWorker._id}/blocked-times`, {
        ...blockForm,
        endDate: blockForm.endDate || blockForm.startDate,
        label: blockForm.label || 'Unavailable',
      });
      setWorkerForm((prev) => ({ ...prev, blockedTimes: [...(prev.blockedTimes || []), data.block] }));
      setBlockForm({ label: '', type: 'time_off', startDate: '', endDate: '', allDay: true, startTime: '', endTime: '' });
      toast.success('Blocked time added.');
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to add blocked time.');
    }
  };

  const updateBlockedTime = async (block, status) => {
    if (!editingWorker?._id || !block?.blockId) return;
    try {
      const { data } = await API.patch(`/admin/workers/${editingWorker._id}/blocked-times/${block.blockId}`, { ...block, status, active: status !== 'cancelled' });
      setWorkerForm((prev) => ({
        ...prev,
        blockedTimes: (prev.blockedTimes || []).map((item) => item.blockId === block.blockId ? data.block : item),
      }));
      toast.success(`Blocked time ${status}.`);
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to update blocked time.');
    }
  };

  const beginNewRole = () => {
    setEditingRole(null);
    setRoleForm({ ...EMPTY_ROLE, permissions: { ...defaultPermissions } });
  };

  const beginEditRole = (role) => {
    setEditingRole(role);
    setRoleForm({
      ...EMPTY_ROLE,
      ...role,
      permissions: { ...defaultPermissions, ...(role.permissions || {}) },
    });
  };

  const saveRole = async () => {
    if (!roleForm.name.trim()) {
      toast.error('Role name is required.');
      return;
    }

    try {
      if (editingRole?._id) {
        await API.put(`/admin/workers/roles/${editingRole._id}`, roleForm);
        toast.success('Role updated.');
      } else {
        await API.post('/admin/workers/roles', roleForm);
        toast.success('Role created.');
      }
      setEditingRole(null);
      setRoleForm(EMPTY_ROLE);
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to save role.');
    }
  };

  const deleteRole = async (role) => {
    if (!window.confirm(`Delete role ${role.name}?`)) return;
    try {
      await API.delete(`/admin/workers/roles/${role._id}`);
      toast.success('Role deleted.');
      await loadAll();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Failed to delete role.');
    }
  };

  const roleLabel = (worker) => worker.roleId?.name || roles.find((role) => idOf(role) === idOf(worker.roleId))?.name || worker.roleKey || '—';

  const currentStaffAccount = editingWorker?.staffAccount || workerForm.staffAccount || { exists: false, status: 'none' };
  const credentialUsername = String(workerForm.email || currentStaffAccount.email || '').trim().toLowerCase();
  const credentialWorkerName = workerForm.displayName || [workerForm.firstName, workerForm.lastName].filter(Boolean).join(' ').trim() || 'this worker';

  const copyCredentialLink = async (value) => {
    const ok = await copyText(value);
    toast[ok ? 'success' : 'error'](ok ? 'Link copied.' : 'Could not copy link.');
  };

  const sendEditingInvite = async () => {
    if (!editingWorker?._id) return;
    if (!credentialUsername) {
      toast.error('Enter the worker email first. The email is the username.');
      return;
    }
    const savedEmail = String(editingWorker?.email || '').trim().toLowerCase();
    if (credentialUsername !== savedEmail) {
      toast.error('Save the worker first so the login username matches the updated email.');
      return;
    }
    const workerForAccess = {
      ...editingWorker,
      email: credentialUsername,
      displayName: credentialWorkerName,
      firstName: workerForm.firstName,
      staffAccount: currentStaffAccount,
    };
    await sendInvite(workerForAccess);
  };

  const sendEditingPasswordReset = async () => {
    if (!editingWorker?._id) return;
    await sendPasswordReset({ ...editingWorker, staffAccount: currentStaffAccount, displayName: credentialWorkerName });
  };

  const setEditingAccessStatus = async (status) => {
    if (!editingWorker?._id) return;
    await setAccessStatus({ ...editingWorker, staffAccount: currentStaffAccount }, status);
  };

  return (
    <div className="p-4 space-y-6">
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="text-xl font-bold">Staff / Workers</h2>
          <p className="text-sm text-gray-600">
            Manage stylists, roles, permissions, customer photos/bios, service eligibility, and worker-specific prices.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={runMigration} className="rounded border border-amber-400 bg-amber-50 px-3 py-2 text-amber-800">
            Ensure Rakeb Migration
          </button>
          <button onClick={() => setActiveTab('workers')} className={`rounded border px-3 py-2 ${activeTab === 'workers' ? 'bg-blue-600 text-white' : 'bg-white'}`}>
            Workers
          </button>
          <button onClick={() => setActiveTab('roles')} className={`rounded border px-3 py-2 ${activeTab === 'roles' ? 'bg-blue-600 text-white' : 'bg-white'}`}>
            Roles & Permissions
          </button>
        </div>
      </div>


      {accessResult && (accessResult.inviteUrl || accessResult.resetUrl || accessResult.delivery) && (
        <div className="rounded border border-green-300 bg-green-50 p-4 text-sm text-green-900">
          <div className="font-semibold">{accessResult.title || 'Credential link ready'}{accessResult.workerName ? ` for ${accessResult.workerName}` : ''}</div>
          <div className="mt-1">Username: <span className="font-mono">{accessResult.account?.email || accessResult.account?.username}</span></div>
          {accessResult.expiresAt && <div>Expires: {new Date(accessResult.expiresAt).toLocaleString()}</div>}
          {accessResult.delivery && <div>Delivery: {deliverySummary(accessResult.delivery)}</div>}
          {(accessResult.inviteUrl || accessResult.resetUrl) && (
            <div className="mt-2 rounded bg-white p-2">
              <div className="break-all font-mono text-xs">{accessResult.inviteUrl || accessResult.resetUrl}</div>
              <button
                type="button"
                className="mt-2 rounded border px-2 py-1 text-xs text-blue-700"
                onClick={() => copyCredentialLink(accessResult.inviteUrl || accessResult.resetUrl)}
              >
                Copy link
              </button>
            </div>
          )}
          <div className="mt-2 text-xs">The worker creates or resets their own password from this secure link. Passwords are not shown to admins.</div>
        </div>
      )}

      {activeTab === 'workers' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={beginNewWorker} className="rounded bg-blue-600 px-4 py-2 text-white">+ Add Worker</button>
          </div>

          <div className="overflow-x-auto rounded border">
            <table className="w-full text-sm">
              <thead className="bg-gray-100">
                <tr>
                  <th className="border p-2 text-left">Worker</th>
                  <th className="border p-2 text-left">Role</th>
                  <th className="border p-2 text-left">Tier</th>
                  <th className="border p-2 text-left">Customer Profile</th>
                  <th className="border p-2 text-left">Services / Pricing</th>
                  <th className="border p-2 text-left">Status</th>
                  <th className="border p-2 text-left">App Access</th>
                  <th className="border p-2 text-left">Actions</th>
                </tr>
              </thead>
              <tbody>
                {workers.map((worker) => (
                  <tr key={worker._id} className={worker.active === false ? 'bg-gray-50 text-gray-500' : ''}>
                    <td className="border p-2">
                      <div className="flex items-center gap-2">
                        {worker.photoUrl || worker.profilePhoto ? (
                          <img src={worker.photoUrl || worker.profilePhoto} alt="" className="h-10 w-10 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gray-200 text-xs">No photo</div>
                        )}
                        <div>
                          <div className="font-semibold">{worker.displayName || `${worker.firstName || ''} ${worker.lastName || ''}`.trim()}</div>
                          <div className="text-xs text-gray-500">{worker.email || worker.phone || '—'}</div>
                          {worker.isDefault && <span className="text-xs font-semibold text-amber-700">Default stylist</span>}
                        </div>
                      </div>
                    </td>
                    <td className="border p-2">{roleLabel(worker)}</td>
                    <td className="border p-2 capitalize">{worker.tierKey || 'regular'}</td>
                    <td className="border p-2">
                      <div className="font-medium">{worker.title}</div>
                      <div className="text-xs text-gray-600">{worker.experienceYears ? `${worker.experienceYears}+ years` : 'Experience not set'}</div>
                      <div className="text-xs text-gray-500">{(worker.specialties || []).slice(0, 4).join(' · ') || 'No specialties yet'}</div>
                    </td>
                    <td className="border p-2">
                      {(worker.serviceAssignments || []).length ? (
                        <div className="flex max-w-[420px] flex-wrap gap-1">
                          {worker.serviceAssignments.map((assignment) => (
                            <span key={idOf(assignment.serviceId)} className="rounded-full bg-gray-100 px-2 py-1 text-xs">
                              {serviceName(assignment.serviceId)} · {money(assignment.price)} · {assignment.duration || '—'}m
                            </span>
                          ))}
                        </div>
                      ) : <span className="text-gray-400">No services assigned</span>}
                    </td>
                    <td className="border p-2">
                      <div>{worker.active ? 'Active' : 'Inactive'}</div>
                      <div className="text-xs text-gray-500">{worker.showOnline ? 'Online booking' : 'Internal only'}</div>
                      <div className="text-xs text-gray-500">{worker.canUseChemicals ? 'Chemicals allowed' : 'No chemical services'}</div>
                    </td>
                    <td className="border p-2">
                      <div className="font-medium capitalize">{worker.staffAccount?.exists ? worker.staffAccount.status : 'No login'}</div>
                      {worker.staffAccount?.lastLoginAt && <div className="text-xs text-gray-500">Last login: {new Date(worker.staffAccount.lastLoginAt).toLocaleString()}</div>}
                      <div className="mt-2 flex flex-col gap-1 text-xs">
                        {!worker.staffAccount?.exists && (
                          <button onClick={() => sendInvite(worker)} className="rounded border px-2 py-1 text-blue-700">
                            Send invite
                          </button>
                        )}
                        {worker.staffAccount?.exists && worker.staffAccount.status === 'invited' && (
                          <button onClick={() => sendInvite(worker)} className="rounded border px-2 py-1 text-blue-700">
                            Resend invite
                          </button>
                        )}
                        {worker.staffAccount?.exists && worker.staffAccount.status !== 'disabled' && (
                          <button onClick={() => sendPasswordReset(worker)} className="rounded border px-2 py-1 text-blue-700">
                            Reset password
                          </button>
                        )}
                        {worker.staffAccount?.exists && worker.staffAccount.status !== 'disabled' && (
                          <button onClick={() => setAccessStatus(worker, 'disabled')} className="rounded border border-red-300 px-2 py-1 text-red-700">Disable login</button>
                        )}
                        {worker.staffAccount?.exists && worker.staffAccount.status === 'disabled' && (
                          <button onClick={() => setAccessStatus(worker, 'active')} className="rounded border border-green-300 px-2 py-1 text-green-700">Enable login</button>
                        )}
                      </div>
                    </td>
                    <td className="border p-2">
                      <button onClick={() => beginEditWorker(worker)} className="mr-2 text-blue-600">Edit</button>
                      <button onClick={() => deleteWorker(worker)} className="text-red-600" disabled={worker.protectedWorker || worker.isDefault}>
                        {worker.protectedWorker || worker.isDefault ? 'Protected' : 'Remove'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {(editingWorker !== null || workerForm.firstName || workerForm.roleId) && (
            <div className="rounded border bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-lg font-semibold">{editingWorker?._id ? 'Edit Worker' : 'Add Worker'}</h3>
              <div className="grid gap-3 md:grid-cols-3">
                <input className="border p-2" placeholder="First name" value={workerForm.firstName} onChange={(e) => changeWorker('firstName', e.target.value)} />
                <input className="border p-2" placeholder="Last name" value={workerForm.lastName} onChange={(e) => changeWorker('lastName', e.target.value)} />
                <input className="border p-2" placeholder="Display name" value={workerForm.displayName} onChange={(e) => changeWorker('displayName', e.target.value)} />
                <input className="border p-2" placeholder="Email" value={workerForm.email} onChange={(e) => changeWorker('email', e.target.value)} />
                <input className="border p-2" placeholder="Phone" value={workerForm.phone} onChange={(e) => changeWorker('phone', e.target.value)} />
                <input className="border p-2" placeholder="Title, e.g. Master Stylist" value={workerForm.title} onChange={(e) => changeWorker('title', e.target.value)} />
                <input className="border p-2" placeholder="Profile photo URL" value={workerForm.photoUrl} onChange={(e) => changeWorker('photoUrl', e.target.value)} />
                <input type="number" min="0" className="border p-2" placeholder="Years experience" value={workerForm.experienceYears} onChange={(e) => changeWorker('experienceYears', e.target.value)} />
                <input className="border p-2" placeholder="Calendar color" value={workerForm.color} onChange={(e) => changeWorker('color', e.target.value)} />
                <select className="border p-2" value={workerForm.roleId} onChange={(e) => changeWorker('roleId', e.target.value)}>
                  <option value="">Select app role</option>
                  {roles.map((role) => <option key={role._id} value={role._id}>{role.name}</option>)}
                </select>
                <select className="border p-2" value={workerForm.tierKey} onChange={(e) => changeWorker('tierKey', e.target.value)}>
                  {TIER_OPTIONS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                </select>
                <div className="flex flex-wrap items-center gap-3 text-sm">
                  <label><input type="checkbox" checked={workerForm.active} onChange={(e) => changeWorker('active', e.target.checked)} /> Active</label>
                  <label><input type="checkbox" checked={workerForm.showOnline} onChange={(e) => changeWorker('showOnline', e.target.checked)} /> Online</label>
                  <label><input type="checkbox" checked={workerForm.canUseChemicals} onChange={(e) => changeWorker('canUseChemicals', e.target.checked)} /> Chemicals</label>
                  <label><input type="checkbox" checked={workerForm.canTakeWalkIns} onChange={(e) => changeWorker('canTakeWalkIns', e.target.checked)} /> Walk-ins</label>
                  {!editingWorker?._id && <label><input type="checkbox" checked={workerForm.createStaffAccess} onChange={(e) => changeWorker('createStaffAccess', e.target.checked)} /> Send invite after save</label>}
                </div>
              </div>
              <input className="mt-3 w-full border p-2" placeholder="Specialties, comma-separated" value={workerForm.specialtiesText} onChange={(e) => changeWorker('specialtiesText', e.target.value)} />
              <input className="mt-3 w-full border p-2" placeholder="Languages, comma-separated" value={workerForm.languagesText} onChange={(e) => changeWorker('languagesText', e.target.value)} />
              <textarea className="mt-3 w-full border p-2" placeholder="Short customer bio" value={workerForm.shortBio} onChange={(e) => changeWorker('shortBio', e.target.value)} />
              <textarea className="mt-3 w-full border p-2" placeholder="Full customer bio / experience" value={workerForm.bio} onChange={(e) => changeWorker('bio', e.target.value)} />
              <textarea className="mt-3 w-full border p-2" placeholder="Internal notes, never shown to customer" value={workerForm.notes} onChange={(e) => changeWorker('notes', e.target.value)} />


              {editingWorker?._id && (
                <div className="mt-4 rounded border border-blue-200 bg-blue-50 p-3">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <h4 className="font-semibold text-blue-950">Credentials & App Access</h4>
                      <p className="text-xs text-blue-900">The worker username is their email. Save email changes before sharing new credentials.</p>
                    </div>
                    <span className={`w-fit rounded-full px-2 py-1 text-xs font-semibold capitalize ${currentStaffAccount.exists ? (currentStaffAccount.status === 'disabled' ? 'bg-red-100 text-red-800' : 'bg-green-100 text-green-800') : 'bg-gray-100 text-gray-700'}`}>
                      {currentStaffAccount.exists ? currentStaffAccount.status : 'No login'}
                    </span>
                  </div>

                  <div className="mt-3 grid gap-3 md:grid-cols-3">
                    <label className="text-sm">
                      <span className="mb-1 block text-xs font-semibold text-gray-600">Username / Login email</span>
                      <input className="w-full rounded border bg-white p-2 font-mono text-sm" value={credentialUsername} readOnly />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-xs font-semibold text-gray-600">Role</span>
                      <input className="w-full rounded border bg-white p-2 text-sm" value={roleLabel({ ...editingWorker, roleId: workerForm.roleId, roleKey: editingWorker?.roleKey })} readOnly />
                    </label>
                    <label className="text-sm">
                      <span className="mb-1 block text-xs font-semibold text-gray-600">Last login</span>
                      <input className="w-full rounded border bg-white p-2 text-sm" value={currentStaffAccount.lastLoginAt ? new Date(currentStaffAccount.lastLoginAt).toLocaleString() : 'Never'} readOnly />
                    </label>
                  </div>

                  {currentStaffAccount.mustChangePassword && (
                    <div className="mt-2 rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
                      This worker must create or change their password from the secure link before normal login.
                    </div>
                  )}

                  <div className="mt-3 flex flex-wrap gap-2 text-sm">
                    {!currentStaffAccount.exists && (
                      <button type="button" onClick={sendEditingInvite} className="rounded bg-blue-600 px-3 py-2 text-white">
                        Send Invite / Create Login
                      </button>
                    )}
                    {currentStaffAccount.exists && currentStaffAccount.status === 'invited' && (
                      <button type="button" onClick={sendEditingInvite} className="rounded border border-blue-300 bg-white px-3 py-2 text-blue-700">
                        Resend Invite
                      </button>
                    )}
                    {currentStaffAccount.exists && currentStaffAccount.status !== 'disabled' && (
                      <button type="button" onClick={sendEditingPasswordReset} className="rounded border border-blue-300 bg-white px-3 py-2 text-blue-700">
                        Send Reset Link
                      </button>
                    )}
                    {currentStaffAccount.exists && currentStaffAccount.status !== 'disabled' && (
                      <button type="button" onClick={() => setEditingAccessStatus('disabled')} className="rounded border border-red-300 bg-white px-3 py-2 text-red-700">
                        Disable Login
                      </button>
                    )}
                    {currentStaffAccount.exists && currentStaffAccount.status === 'disabled' && (
                      <button type="button" onClick={() => setEditingAccessStatus('active')} className="rounded border border-green-300 bg-white px-3 py-2 text-green-700">
                        Enable Login
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-xs text-gray-600">
                    Passwords are never displayed to admins. Use invite/reset links so the worker creates their own password securely.
                  </p>
                </div>
              )}

              {editingWorker?._id && (
                <div className="mt-4 rounded border bg-gray-50 p-3">
                  <h4 className="font-semibold">Time Off / Block Time</h4>
                  <p className="mb-2 text-xs text-gray-500">Approved active blocks are used by online availability. Worker requests stay pending until approved.</p>

                  <div className="grid gap-2 md:grid-cols-4">
                    <select className="border p-2" value={blockForm.type} onChange={(e) => setBlockForm((p) => ({ ...p, type: e.target.value }))}>
                      <option value="time_off">Time off</option>
                      <option value="vacation">Vacation</option>
                      <option value="sick">Sick</option>
                      <option value="break">Break</option>
                      <option value="training">Training</option>
                      <option value="other">Other</option>
                    </select>
                    <input className="border p-2" placeholder="Label" value={blockForm.label} onChange={(e) => setBlockForm((p) => ({ ...p, label: e.target.value }))} />
                    <input type="date" className="border p-2" value={blockForm.startDate} onChange={(e) => setBlockForm((p) => ({ ...p, startDate: e.target.value }))} />
                    <input type="date" className="border p-2" value={blockForm.endDate} onChange={(e) => setBlockForm((p) => ({ ...p, endDate: e.target.value }))} />
                    <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={blockForm.allDay} onChange={(e) => setBlockForm((p) => ({ ...p, allDay: e.target.checked }))} /> All day</label>
                    {!blockForm.allDay && (
                      <>
                        <input type="time" className="border p-2" value={blockForm.startTime} onChange={(e) => setBlockForm((p) => ({ ...p, startTime: e.target.value }))} />
                        <input type="time" className="border p-2" value={blockForm.endTime} onChange={(e) => setBlockForm((p) => ({ ...p, endTime: e.target.value }))} />
                      </>
                    )}
                    <button onClick={addBlockedTime} className="rounded bg-gray-800 px-3 py-2 text-white">Add Block</button>
                  </div>

                  <div className="mt-3 space-y-2">
                    {(workerForm.blockedTimes || []).length === 0 ? (
                      <div className="text-sm text-gray-500">No blocked time yet.</div>
                    ) : (workerForm.blockedTimes || []).slice().reverse().map((block) => (
                      <div key={block.blockId || `${block.startDate}-${block.label}`} className="flex flex-col gap-2 rounded border bg-white p-3 text-sm md:flex-row md:items-center md:justify-between">
                        <div>
                          <div className="font-medium">{block.label || block.type || 'Unavailable'} <span className="ml-2 rounded bg-gray-100 px-2 py-[1px] text-xs capitalize">{block.status || 'approved'}</span></div>
                          <div className="text-xs text-gray-500">{block.startDate}{block.endDate && block.endDate !== block.startDate ? ` to ${block.endDate}` : ''}{block.allDay === false ? ` · ${block.startTime}–${block.endTime}` : ' · all day'}</div>
                        </div>
                        <div className="flex flex-wrap gap-2 text-xs">
                          {block.status !== 'approved' && <button onClick={() => updateBlockedTime(block, 'approved')} className="rounded border border-green-300 px-2 py-1 text-green-700">Approve</button>}
                          {block.status !== 'rejected' && <button onClick={() => updateBlockedTime(block, 'rejected')} className="rounded border px-2 py-1">Reject</button>}
                          {block.status !== 'cancelled' && <button onClick={() => updateBlockedTime(block, 'cancelled')} className="rounded border border-red-300 px-2 py-1 text-red-700">Cancel</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-4">
                <h4 className="font-semibold">Services this worker can do</h4>
                <p className="mb-2 text-xs text-gray-500">Checked services require this worker’s own price and duration. The system will not use base price for final booking.</p>
                <div className="max-h-[380px] overflow-y-auto rounded border">
                  <table className="w-full text-xs md:text-sm">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="border p-2 text-left">Can do</th>
                        <th className="border p-2 text-left">Service</th>
                        <th className="border p-2 text-left">Legacy/menu price</th>
                        <th className="border p-2 text-left">Worker price</th>
                        <th className="border p-2 text-left">Duration</th>
                        <th className="border p-2 text-left">Online</th>
                      </tr>
                    </thead>
                    <tbody>
                      {services.map((service) => {
                        const serviceId = idOf(service);
                        const assignment = assignmentFor(serviceId);
                        return (
                          <tr key={serviceId}>
                            <td className="border p-2">
                              <input
                                type="checkbox"
                                checked={!!assignment?.enabled}
                                onChange={(e) => updateAssignment(serviceId, { enabled: e.target.checked })}
                              />
                            </td>
                            <td className="border p-2">{service.name}<div className="text-xs text-gray-500">{service.category}</div></td>
                            <td className="border p-2">${service.price} / {service.duration}m</td>
                            <td className="border p-2">
                              <input
                                type="number"
                                min="0"
                                className="w-24 border p-1"
                                disabled={!assignment?.enabled}
                                value={assignment?.price ?? ''}
                                onChange={(e) => updateAssignment(serviceId, { price: e.target.value })}
                              />
                            </td>
                            <td className="border p-2">
                              <input
                                type="number"
                                min="0"
                                className="w-24 border p-1"
                                disabled={!assignment?.enabled}
                                value={assignment?.duration ?? ''}
                                onChange={(e) => updateAssignment(serviceId, { duration: e.target.value })}
                              />
                            </td>
                            <td className="border p-2">
                              <input
                                type="checkbox"
                                disabled={!assignment?.enabled}
                                checked={assignment?.allowOnlineBooking !== false}
                                onChange={(e) => updateAssignment(serviceId, { allowOnlineBooking: e.target.checked })}
                              />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => { setEditingWorker(null); setWorkerForm(EMPTY_WORKER); }} className="rounded border px-4 py-2">Cancel</button>
                <button onClick={saveWorker} disabled={loading} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60">{loading ? 'Saving…' : 'Save Worker'}</button>
              </div>
            </div>
          )}
        </div>
      )}

      {activeTab === 'roles' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button onClick={beginNewRole} className="rounded bg-blue-600 px-4 py-2 text-white">+ Add Role</button>
          </div>

          <div className="grid gap-3 md:grid-cols-2">
            {roles.map((role) => (
              <div key={role._id} className="rounded border p-4">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="font-semibold">{role.name}</h3>
                    <p className="text-xs text-gray-500">{role.description || role.key}</p>
                  </div>
                  <div className="flex gap-2 text-sm">
                    <button onClick={() => beginEditRole(role)} className="text-blue-600">Edit</button>
                    {!role.isSystem && <button onClick={() => deleteRole(role)} className="text-red-600">Delete</button>}
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap gap-1">
                  {Object.entries(role.permissions || {}).filter(([, enabled]) => enabled).slice(0, 12).map(([key]) => (
                    <span key={key} className="rounded-full bg-gray-100 px-2 py-1 text-xs">{PERMISSION_LABELS[key] || key}</span>
                  ))}
                </div>
              </div>
            ))}
          </div>

          {(editingRole !== null || roleForm.name) && (
            <div className="rounded border bg-white p-4 shadow-sm">
              <h3 className="mb-3 text-lg font-semibold">{editingRole?._id ? 'Edit Role' : 'Add Role'}</h3>
              <div className="grid gap-3 md:grid-cols-3">
                <input className="border p-2" placeholder="Role name" value={roleForm.name} onChange={(e) => setRoleForm((p) => ({ ...p, name: e.target.value }))} />
                <input className="border p-2" placeholder="Key" disabled={editingRole?.isSystem} value={roleForm.key || ''} onChange={(e) => setRoleForm((p) => ({ ...p, key: e.target.value }))} />
                <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={roleForm.active !== false} onChange={(e) => setRoleForm((p) => ({ ...p, active: e.target.checked }))} /> Active</label>
              </div>
              <textarea className="mt-3 w-full border p-2" placeholder="Description" value={roleForm.description || ''} onChange={(e) => setRoleForm((p) => ({ ...p, description: e.target.value }))} />
              <div className="mt-4 grid gap-2 md:grid-cols-3">
                {permissionKeys.map((key) => (
                  <label key={key} className="rounded border p-2 text-sm">
                    <input
                      type="checkbox"
                      className="mr-2"
                      checked={!!roleForm.permissions?.[key]}
                      onChange={(e) => setRoleForm((p) => ({
                        ...p,
                        permissions: { ...(p.permissions || {}), [key]: e.target.checked },
                      }))}
                    />
                    {PERMISSION_LABELS[key] || key}
                  </label>
                ))}
              </div>
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => { setEditingRole(null); setRoleForm(EMPTY_ROLE); }} className="rounded border px-4 py-2">Cancel</button>
                <button onClick={saveRole} className="rounded bg-blue-600 px-4 py-2 text-white">Save Role</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
