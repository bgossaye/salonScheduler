import React, { useState, useEffect, useCallback } from 'react';
import { wakeRender } from "../../wakebooking";
import API from '../../api';
import { formatDate, formatTime } from '../../utils/formatHelper';
import AppointmentFormModal from './AppointmentFormModal';
import { toast } from 'react-toastify';
import { getAdminUser } from '../../utils/permissions';
import {
  doesAppointmentQualifyForSpecial,
  getAppointmentServiceName,
  getSpecialAppointmentBadgeText,
  usePromotionConfig,
} from '../../utils/specialDeals';

import {
  getNextOpenDate,
  buildRebookedAppointment
} from './adminAppointmentsHelper';


const sortAppointments = (appointments) => {
  return appointments.slice().sort((a, b) => {
    const dateA = new Date(`${a.date}T${a.time}`);
    const dateB = new Date(`${b.date}T${b.time}`);
    return dateA - dateB;
  });
};

const renderAddOns = (addOns) => {
  return Array.isArray(addOns) && addOns.length > 0
    ? addOns.filter(a => a && a.name).map(a => a.name).join(', ')
    : '—';
};

const idOf = (value) => String(value?._id || value || '');

const getWorkerName = (appt) =>
  appt?.workerName || appt?.workerId?.displayName || appt?.priceSnapshot?.workerName || 'Rakeb G';

const money = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? `$${number.toFixed(2)}` : null;
};

const getAppointmentPriceDetails = (appt) => {
  const snapshot = appt?.priceSnapshot || {};
  const originalNumber = Number(snapshot.servicePrice || 0) + Number(snapshot.addOnPrice || 0);
  const discountNumber = Number(snapshot.discountAmount || 0);
  const finalValue = snapshot.finalPrice ?? appt?.finalPrice ?? appt?.price ?? (originalNumber > 0 ? Math.max(0, originalNumber - discountNumber) : null);
  const promotion = appt?.appliedPromotion || null;
  const couponCode = String(promotion?.couponCode || appt?.couponCode || '').trim().toUpperCase();

  return {
    original: originalNumber > 0 ? money(originalNumber) : null,
    discount: discountNumber > 0 ? money(discountNumber) : null,
    final: finalValue == null || finalValue === '' ? '—' : money(finalValue),
    label: promotion?.appointmentLabel || promotion?.title || (couponCode ? `${couponCode} coupon` : ''),
    couponCode,
    applied: discountNumber > 0 || !!promotion || !!couponCode,
  };
};

export default function AdminAppointments() {
  const [appointments, setAppointments] = useState([]);
  const [workers, setWorkers] = useState([]);
  const [filters, setFilters] = useState({ date: '', status: 'booked', client: '', workerId: '' });
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedAppt, setSelectedAppt] = useState(null);
  const [selectedClient, setSelectedClient] = useState(null);
  const [showClientModal, setShowClientModal] = useState(false);
  const [editableNote, setEditableNote] = useState('');
  const [search] = useState('');
  const [rebookPrompt, setRebookPrompt] = useState({ visible: false, appt: null, nextDate: null });
  const [statusTouched, setStatusTouched] = useState(false);
  const { promotionConfig } = usePromotionConfig();
  const shouldShowWorkerPromotion = promotionConfig.enabled && promotionConfig.showWorkerBadges;
  const adminUser = getAdminUser();
  const canChangeClientDefaultStylist = ['owner', 'admin'].includes(String(adminUser?.roleKey || adminUser?.role || '').toLowerCase());

// Ensure backend is awake when landing directly on Admin (persisted sessions)
useEffect(() => { wakeRender({ tag: 'admin-appointments' }); }, []);

useEffect(() => {
  API.get('/admin/workers', { params: { active: true } })
    .then(({ data }) => setWorkers(data?.workers || data || []))
    .catch((err) => console.error('Failed to fetch workers', err));
}, []);

const fetchAppointments = useCallback(async () => {
  try {
    if (!statusTouched) {
      // Initial load: show booked + pending
      const [bookedRes, pendingRes] = await Promise.all([
        API.get('/admin/appointments', { params: { ...filters, status: 'booked' } }),
        API.get('/admin/appointments', { params: { ...filters, status: 'pending' } }),
      ]);
      const merged = [...bookedRes.data, ...pendingRes.data];
      setAppointments(sortAppointments(merged));
    } else {
      // After user touches the Status filter: keep your normal behavior
      const { data } = await API.get('/admin/appointments', { params: filters });
      setAppointments(sortAppointments(data));
    }
  } catch (err) {
    console.error('Failed to fetch appointments', err);
  }
}, [filters, statusTouched]);

useEffect(() => {
  fetchAppointments();
}, [fetchAppointments]); // ✅ satisfies exhaustive-deps


 

 const handleDelete = async (id) => {
  const appt = appointments.find((a) => a._id === id);
  if (!appt) return;

    try {

      await API.delete(`/admin/appointments/${id}`);
      await fetchAppointments();
      toast.success('Appointment successfully Deleted');
      
    } catch (err) {
      console.error("Delete failed", err);
      toast.error("Failed to delete appointment");
    }
  
};

const handleUpdate = async (id, update) => {

    await API.patch(`/admin/appointments/${id}`, update);
    fetchAppointments();
  };

const handleCancel = async (id) => {
  try {
    await API.patch(`/admin/appointments/${id}`, { status: 'canceled' });
    toast.success('Appointment marked as canceled');
    fetchAppointments();
  } catch (err) {
    toast.error('Failed to cancel appointment');
  }
};

const filteredAppointments = appointments
  .filter(appt => {
    // Initial load / refresh: show booked + pending
    if (!statusTouched && filters.status === 'booked') {
      return appt.status === 'booked' || appt.status === 'pending';
    }
    // Normal behavior after user changes the Status filter
    if (filters.status === 'all') return true;
    return appt.status === filters.status;
  })
  .filter(appt => {
    if (!search.trim()) return true;
    return (
      appt.client?.firstName?.toLowerCase().includes(search.toLowerCase()) ||
      appt.client?.lastName?.toLowerCase().includes(search.toLowerCase()) ||
      appt.client?.phone?.includes(search)
    );
  });

const handleSave = async (form) => {
  try {
    if (form?.groupBooking) {
      const rows = Array.isArray(form.appointments) ? form.appointments : [];
      if (rows.length < 2) {
        toast.warning('Group booking needs at least two appointment rows.');
        return;
      }
      await API.post('/admin/appointments/group', {
        group: form.group || {},
        appointments: rows.map(({ _clientName, _serviceName, _workerName, ...row }) => row),
      });
      toast.success(`Group booking saved with ${rows.length} appointments`);
    } else if (selectedAppt?._id) {
      // existing edit
      await API.patch(`/admin/appointments/${selectedAppt._id}`, form);
      toast.success('Appointment successfully updated');
    } else {
      // NEW appointment — check for duplicates
      const duplicate = appointments.find(
        a =>
          a.clientId?._id === form.clientId &&
          a.serviceId?._id === form.serviceId &&
          a.date === form.date &&
          a.status !== 'canceled'
      );

      if (duplicate) {
        toast.warning('An appointment for this client, service, and date already exists.');
        return; // stop here
      }

      await API.post('/admin/appointments', form);
      toast.success('Appointment successfully saved');
    }
    fetchAppointments();
  } catch (err) {
    console.error('Save failed:', err);
    toast.error(err?.response?.data?.error || 'Failed to save appointment.');
    throw err;
  }
};

    const handleComplete = async (appt) => {
        try {
            await API.patch(`/admin/appointments/${appt._id}`, { status: 'completed' });

            const client = appt.clientId;
            const frequency = parseInt(client?.visitFrequency || 0);

            if (frequency > 0) {
                const storeHoursRes = await API.get('/admin/store-hours');
                const storeHours = storeHoursRes.data;
                const nextDate = getNextOpenDate(formatDate(appt.date), frequency, storeHours);

                if (nextDate) {
                    // show prompt and wait for user's choice
                    setRebookPrompt({ visible: true, appt, nextDate });
                    return;
                }
            }

            toast.success("Appointment marked as completed");
            fetchAppointments();
        } catch (err) {
            toast.error("Failed to complete appointment");
            console.error(err);
        }
    };

  return (
    <div className="p-4">
      <h2 className="text-xl font-bold mb-4">Appointments</h2>

      <div className="mb-4 flex gap-2 flex-wrap">
        <input
          type="date"
          value={filters.date}
          onChange={(e) => setFilters({ ...filters, date: e.target.value })}
          className="border px-2 py-1"
        />
        <select
          value={filters.status}
	onChange={(e) => { setStatusTouched(true); setFilters({ ...filters, status: e.target.value });}}
          className="border px-2 py-1"
        >
	<option value="booked">📅 Booked</option>
	<option value="completed">✔ Completed</option>
	<option value="noshow">🚫 No Show</option>
	<option value="canceled">✖ Canceled</option>
	<option value="pending">⏳ pending</option>
	</select>
        <input
          placeholder="Client name or phone"
          value={filters.client}
          onChange={(e) => setFilters({ ...filters, client: e.target.value })}
          className="border px-2 py-1"
        />
        <select
          value={filters.workerId}
          onChange={(e) => setFilters({ ...filters, workerId: e.target.value })}
          className="border px-2 py-1"
        >
          <option value="">All stylists</option>
          {workers.map((worker) => (
            <option key={worker._id} value={worker._id}>{worker.displayName || [worker.firstName, worker.lastName].filter(Boolean).join(' ')}</option>
          ))}
        </select>
        <button
          onClick={() => { setSelectedAppt(null); setModalOpen(true); }}
          className="bg-blue-600 text-white px-4 py-2 ml-auto"
        >
          + Add Appointment
        </button>
      </div>

      <table className="w-full border text-sm">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 border">Date</th>
            <th className="p-2 border">Time</th>
            <th className="p-2 border">Client</th>
            <th className="p-2 border">Service</th>
            <th className="p-2 border">Stylist</th>
            <th className="p-2 border">Price</th>
            <th className="p-2 border">Add-ons</th>
            <th className="p-2 border">Actions</th>
          </tr>
        </thead>
        <tbody>

          {filteredAppointments.map(appt => {
// Build a reliable Date using raw fields (ISO-like), not formatted strings
const start = new Date(`${appt.date}T${appt.time}:00`);           // appt.date: YYYY-MM-DD, appt.time: HH:mm
const end   = new Date(start.getTime() + (appt.duration || 60) * 60000);
const now   = new Date();

const isPending    = appt.status === 'pending';
const isPastBooked = appt.status === 'booked' && now > end;       // past end → still booked
const isTodayBooked= appt.status === 'booked' && now.toDateString() === start.toDateString();
const serviceName = getAppointmentServiceName(appt);
const workerName = getWorkerName(appt);
const appointmentPrice = getAppointmentPriceDetails(appt);
const qualifiesForSpecial = shouldShowWorkerPromotion && doesAppointmentQualifyForSpecial(appt, promotionConfig);
const specialBadgeText = qualifiesForSpecial ? getSpecialAppointmentBadgeText(appt, promotionConfig) : '';

    return (
<tr
  key={appt._id}
  className={`text-sm
    ${isPending ? 'bg-yellow-200' : ''}
    ${!isPending && isPastBooked ? 'bg-red-200' : ''}     /* past booked → red */
    ${!isPending && !isPastBooked && isTodayBooked ? 'bg-green-200' : ''}
    ${qualifiesForSpecial ? 'border-l-4 border-l-amber-400' : ''}
  `}
>
<td className="p-2 border text-center">
  <div className="font-medium">{formatDate(appt.date)}</div>
  <div className="text-xs text-gray-500 text-center">
  {new Date(`${appt.date}T12:00:00`).toLocaleDateString('en-US', { weekday: 'short' })}
  </div>
</td>
              <td className="p-2 border text-center">
  <div className="font-medium">{formatTime(appt.time)}</div>
  {appt.duration && (
    <div className="text-xs text-gray-500 text-center">
      {appt.duration} min
    </div>
  )}
</td>

              <td className="p-2 border flex items-center gap-2">
                {appt.clientId?.profilePhoto && (
                  <img
                    src={appt.clientId.profilePhoto}
                    alt="Profile"
                    className="w-6 h-6 rounded-full object-cover"
                  />
                )}
                <button
                  className="text-blue-600 underline"
                  onClick={async () => {
                    try {
                        const clientId = appt.clientId?._id || appt.clientId;
                        const { data } = await API.get(`/admin/clients/${clientId}/details`);
                        setSelectedClient(data);
                        setEditableNote(data.notes || '');
                      setShowClientModal(true);
                    } catch (err) {
                      console.error('Failed to load client details:', err);
                    }
                  }}
                >
{[appt.clientId?.firstName, appt.clientId?.lastName].filter(Boolean).join(' ') || 'N/A'}
                </button>
                {appt.groupBooking?.groupBookingId && (
                  <div className="text-[10px] text-purple-700 font-semibold">
                    Group {appt.groupBooking.sequence || ''}/{appt.groupBooking.totalAppointments || ''}
                    {appt.groupBooking.groupLabel ? ` · ${appt.groupBooking.groupLabel}` : ''}
                    {appt.groupBooking.participantRole ? ` · ${appt.groupBooking.participantRole}` : ''}
                    {appt.groupBooking.participantStatus === 'event_guest' ? ' · event guest' : ''}
                  </div>
                )}

                {showClientModal && selectedClient && (
                    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
                        <div className="bg-white p-6 rounded shadow-md w-full max-w-md">
                            <h3 className="text-lg font-bold mb-2">Client Info</h3>
                            <p><strong>Full Name:</strong> {`${selectedClient.firstName || ''} ${selectedClient.lastName || ''}`.trim() || 'N/A'}</p>

<div className="flex items-center gap-2 mt-2">
  <strong className="whitespace-nowrap">Nickname:</strong>
  <input
    type="text"
    value={selectedClient.nickname || ''}
    onChange={(e) =>
      setSelectedClient((prev) => ({ ...prev, nickname: e.target.value }))
    }
    placeholder="e.g., Red BMW"
    className="flex-1 border px-2 py-1 rounded"
  />
</div>
                            <p><strong>Phone:</strong> {selectedClient.phone}</p>

                            <div className="mt-2">
                              <label className="text-sm font-medium block">Assigned Stylist:</label>
                              <select
                                className="border rounded px-2 py-1 w-full disabled:bg-gray-100 disabled:text-gray-500"
                                value={idOf(selectedClient.assignedStylistId)}
                                disabled={!canChangeClientDefaultStylist}
                                onChange={(e) => setSelectedClient(prev => ({ ...prev, assignedStylistId: e.target.value }))}
                              >
                                <option value="">No assigned stylist</option>
                                {workers.map((worker) => (
                                  <option key={worker._id} value={worker._id}>{worker.displayName || [worker.firstName, worker.lastName].filter(Boolean).join(' ')}</option>
                                ))}
                              </select>
                              {!canChangeClientDefaultStylist && (
                                <p className="mt-1 text-xs text-gray-500">Only owner/admin can change the client’s default stylist.</p>
                              )}
                            </div>

                            <div className="mb-2">
                                <label htmlFor= "wknum" className="text-sm font-medium block">Rebooks every (weeks):</label>
                                <input
                                    id="wknum"
                                    name="wknum"
                                    type="number"
                                    min="0"
                                    className="border rounded px-2 py-1 w-full"
                                    value={selectedClient.visitFrequency || ''}
                                    onChange={(e) =>
                                        setSelectedClient(prev => ({
                                            ...prev,
                                            visitFrequency: Number(e.target.value)
                                        }))
                                    }
                                />
                            </div>

                            <label htmlFor="pref" className="text-sm font-medium block mt-3">Service Preferences (comma-separated):</label>
                            <textarea
                                className="border rounded px-2 py-1 w-full h-20"
                                value={(selectedClient.servicePreferences?.services || []).join(', ')}
                                onChange={(e) =>
                                    setSelectedClient(prev => ({
                                        ...prev,
                                        servicePreferences: {
                                            ...prev.servicePreferences,
                                            services: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                        }
                                    }))
                                }
                            />


                            {selectedClient.lastCompletedAppointment && (
                                <div className="mt-2 text-sm">
                                    <p><strong>Last Completed Appointment:</strong></p>
                                    <p>Date: {formatDate(selectedClient.lastCompletedAppointment.date)}</p>
                                    <p>Service: {selectedClient.lastCompletedAppointment.service}</p>
                                </div>
                            )}

                            <label htmlFor="notes" className="block font-semibold mt-4">Notes:</label>
                            <textarea
                                className="border p-2 w-full h-24 mt-1"
                                value={editableNote}
                                onChange={(e) => setEditableNote(e.target.value)}
                            />

                            <div className="flex justify-end mt-4 gap-2">
                                <button
                                    onClick={async () => {
                                        try {
const clientPatch = {
  notes: editableNote,
  visitFrequency: selectedClient.visitFrequency,
  nickname: selectedClient.nickname,
};
if (canChangeClientDefaultStylist) {
  clientPatch.assignedStylistId = selectedClient.assignedStylistId || null;
}
await API.patch(`/admin/clients/${selectedClient._id}`, clientPatch);

                                            setShowClientModal(false);
                                            await fetchAppointments();
                                            toast.success("Client info updated");
                                        } catch (err) {
                                            toast.error("Failed to update client info.");
                                            console.error(err);
                                        }
                                    }}
                                    className="bg-blue-600 text-white px-4 py-2 rounded"
                                >
                                    Save
                                </button>
                                <button
                                    onClick={() => setShowClientModal(false)}
                                    className="px-4 py-2 border rounded"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    </div>
                )}
              </td>
              <td className="p-2 border">
                <div className="font-medium">{serviceName}</div>
                {qualifiesForSpecial && (
                  <span
                    className={`mt-1 inline-block rounded-full px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide ${
                      qualifiesForSpecial
                        ? 'bg-amber-100 text-amber-800 border border-amber-300'
                        : 'bg-gray-100 text-gray-600 border border-gray-200'
                    }`}
                  >
                    {specialBadgeText}
                  </span>
                )}
              </td>
              <td className="p-2 border text-center">
                <div className="font-medium">{workerName}</div>
                {appt.workerTitle && <div className="text-xs text-gray-500">{appt.workerTitle}</div>}
                {appt.oneTimeStylistChange && (
                  <div className="mt-1 text-[10px] font-semibold text-amber-700">One-time stylist</div>
                )}
                {appt.requiresReceivingStylistConfirmation && (
                  <div className="mt-1 text-[10px] font-semibold text-red-700">Needs stylist confirmation</div>
                )}
                {appt.bookedByName && (
                  <div className="mt-1 text-[10px] text-gray-500">Booked by {appt.bookedByName}</div>
                )}
                {appt.groupBooking?.bookedByContactName && (
                  <div className="mt-1 text-[10px] text-purple-700">Contact: {appt.groupBooking.bookedByContactName}</div>
                )}
                {appt.groupBooking?.participantNotes && (
                  <div className="mt-1 text-[10px] text-purple-700">Group note: {appt.groupBooking.participantNotes}</div>
                )}
              </td>
              <td className="p-2 border text-center">
                {appointmentPrice.applied ? (
                  <div className="space-y-1">
                    <div className="inline-flex flex-wrap items-center justify-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800">
                      <span>{appointmentPrice.label || 'Coupon applied'}</span>
                      {appointmentPrice.couponCode && <span>({appointmentPrice.couponCode})</span>}
                    </div>
                    {appointmentPrice.original && appointmentPrice.discount && (
                      <div className="text-xs text-gray-600">
                        <span className="line-through">{appointmentPrice.original}</span>
                        <span className="ml-1 text-emerald-700">−{appointmentPrice.discount}</span>
                      </div>
                    )}
                    <div className="font-semibold">{appointmentPrice.final}</div>
                  </div>
                ) : (
                  <span className="font-medium">{appointmentPrice.final}</span>
                )}
              </td>
              <td className="p-2 border">{renderAddOns(appt.addOns)}</td>
              <td className="p-2 border space-x-2">

<select
  className="border p-1 text-xs rounded"
  value=""
  onChange={(e) => {
    const action = e.target.value;
         if (action === 'booked') handleUpdate(appt._id, { status: 'booked' }, 'booked');
    else if (action === 'complete') handleComplete(appt);
    else if (action === 'noshow') handleUpdate(appt._id, { status: 'noshow' }, 'no show');
    else if (action === 'cancel') handleCancel(appt._id, { status: 'cancel' }, 'cancel');
    else if (action === 'pending') handleUpdate(appt._id, { status: 'pending' }, 'pending');
    else if (action === 'edit')  {setSelectedAppt(appt); setModalOpen(true); }
    else if (action === 'delete') {
      if (window.confirm('Are you sure you want to delete this appointment?')) {
        handleDelete(appt._id);
      }
    }
    e.target.selectedIndex = 0;
  }}
>
<option value="">
  {appt.status === 'booked' ? '📅 Booked' :
   appt.status === 'completed' ? '✔ Completed' :
   appt.status === 'noshow' ? '🚫 No Show' :
   appt.status === 'canceled' ? '✖ Canceled' :
   appt.status === 'pending' ? '⏳ pending' :
   appt.status}
</option>  <option value="booked">📅 Booked</option>
  <option value="complete">✔ Completed</option>
  <option value="edit">✏️ Edit</option>
  <option value="noshow">🚫 No Show</option>
  <option value="cancel">✖ Cancel</option>
  <option value="delete">🗑 Delete</option>
  <option value="pending">⏳ pending</option>
</select>



              </td>
            </tr>
); 
})} 
        </tbody>
      </table>

          {rebookPrompt.visible && (
              <div className="fixed inset-0 flex items-center justify-center bg-black bg-opacity-50 z-50">
                  <div className="bg-white p-6 rounded shadow max-w-sm w-full text-center">
                      <p className="text-lg mb-4">
                          Rebook for <strong>{rebookPrompt.nextDate}</strong>?
                      </p>
                      <div className="flex justify-center gap-4">
                          <button
                              className="bg-green-600 text-white px-4 py-2 rounded"
                              onClick={async () => {
                                  const rebooked = buildRebookedAppointment(rebookPrompt.appt, rebookPrompt.nextDate);
                                  await API.post('/admin/appointments', rebooked);
                                  toast.success("Rebooked for next visit.");
                                  setRebookPrompt({ visible: false, appt: null, nextDate: null });
                                  fetchAppointments();
                              }}
                          >
                              Yes
                          </button>
                          <button
                              className="bg-yellow-500 text-white px-4 py-2 rounded"
                              onClick={() => {
                                  setSelectedAppt(rebookPrompt.appt);
                                  setModalOpen(true);
                                  setRebookPrompt({ visible: false, appt: null, nextDate: null });
                              }}
                          >
                              Change
                          </button>
                          <button
                              className="bg-gray-500 text-white px-4 py-2 rounded"
                              onClick={() => {
                                  toast.info("No rebooking scheduled.");
                                  setRebookPrompt({ visible: false, appt: null, nextDate: null });
                                  fetchAppointments();
                              }}
                          >
                              No
                          </button>
                      </div>
                  </div>
              </div>
          )}



      <AppointmentFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleSave}
        initialData={selectedAppt}
      />
    </div>
  );
}