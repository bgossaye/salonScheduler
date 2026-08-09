import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import API from '../api';
import { toast } from 'react-toastify';
import familyIcon from '../assets/family-hub.png';

const RELATIONSHIPS = ['spouse', 'child', 'parent', 'sibling', 'dependent', 'family', 'other'];
const NO_PHONE_RELATIONSHIPS = [
  ['child', 'Child'],
  ['stepchild', 'Stepchild'],
  ['foster_child', 'Foster child'],
  ['legal_ward', 'Legal ward'],
  ['grandchild', 'Grandchild in my care'],
  ['minor_sibling', 'Minor sibling in my care'],
];
const digits = (value) => String(value || '').replace(/\D/g, '').slice(-10);
const fullName = (person) => `${person?.firstName || ''} ${person?.lastName || ''}`.trim() || 'Family member';

function formatAppointment(appt) {
  if (!appt) return 'No upcoming appointment';
  const date = new Date(`${appt.date}T${appt.time || '00:00'}:00`);
  const when = Number.isNaN(date.getTime())
    ? `${appt.date || ''} ${appt.time || ''}`.trim()
    : date.toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  return `${appt.service || 'Appointment'} • ${when}`;
}

export default function FamilyHub({ client, onClose, onBook, onEditAppointment }) {
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ firstName: '', lastName: '', phone: '', relationship: 'family' });
  const [adding, setAdding] = useState(false);
  const [addForm, setAddForm] = useState({ firstName: '', lastName: '', phone: '', relationship: 'family', dob: '', guardianAttestation: false });
  const [saving, setSaving] = useState(false);
  const [phonePromptOpen, setPhonePromptOpen] = useState(false);
  const [phonePromptMessage, setPhonePromptMessage] = useState('A phone number for this family member is required.');
  const [phoneFieldError, setPhoneFieldError] = useState('');
  const [noPhoneMode, setNoPhoneMode] = useState(false);
  const [invitationOtp, setInvitationOtp] = useState({ open: false, invitation: null, code: '', maskedPhone: '', sending: false, verifying: false });

  const load = async () => {
    if (!client?._id || !client?.phone) return;
    setLoading(true);
    try {
      const { data } = await API.get(`/clients/${client._id}/family/overview`);
      setOverview(data || null);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Could not load your family.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [client?._id, client?.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const linkedMembers = useMemo(
    () => (overview?.members || []).filter((member) => member.relationship !== 'self' && String(member.linkStatus || 'active') === 'active' && member.canBook !== false),
    [overview]
  );
  const pendingOutgoing = useMemo(
    () => (overview?.members || []).filter((member) => member.relationship !== 'self' && String(member.linkStatus || '') === 'pending'),
    [overview]
  );
  const incomingInvitations = useMemo(() => overview?.incomingInvitations || [], [overview]);

  const beginEdit = (member) => {
    setEditingId(member._id);
    setForm({
      firstName: member.firstName || '',
      lastName: member.lastName || '',
      phone: member.phone || '',
      relationship: member.relationship || 'family',
    });
  };

  const saveMember = async (member) => {
    setSaving(true);
    try {
      await API.patch(`/clients/${client._id}/family/${member._id}`, {
        firstName: form.firstName,
        lastName: form.lastName,
        memberPhone: digits(form.phone),
        relationship: form.relationship,
      });
      toast.success('Family member updated.');
      setEditingId(null);
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Could not update the family member.');
    } finally {
      setSaving(false);
    }
  };

  const unlink = async (member) => {
    if (!window.confirm(`Remove ${fullName(member)} from My Family? Their account and appointment history will remain.`)) return;
    try {
      await API.delete(`/clients/${client._id}/family/${member._id}`);
      toast.success('Family member unlinked.');
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Could not unlink the family member.');
    }
  };

  const cancelAppointment = async (appointment) => {
    const appointmentId = appointment?._id || appointment?.id || appointment?.appointmentId;
    if (!appointmentId) {
      toast.error('Could not identify this appointment.');
      return;
    }
    if (!window.confirm(`Cancel ${formatAppointment(appointment)}?`)) return;
    try {
      await API.delete(`/appointments/${appointmentId}`);
      toast.success('Appointment canceled.');
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Could not cancel the appointment.');
    }
  };


  const finishInvitationResponse = async (invitation, action, otp = '') => {
    await API.post(`/clients/${client._id}/family/invitations/${invitation._id}/respond`, {
      action,
      ...(otp ? { otp } : {}),
    });
  };

  const requestInvitationOtp = async (invitation) => {
    setInvitationOtp({ open: true, invitation, code: '', maskedPhone: '', sending: true, verifying: false });
    try {
      const { data } = await API.post(`/clients/${client._id}/family/invitations/${invitation._id}/request-accept-otp`);
      setInvitationOtp((v) => ({ ...v, sending: false, maskedPhone: data?.maskedPhone || '' }));
    } catch (error) {
      setInvitationOtp({ open: false, invitation: null, code: '', maskedPhone: '', sending: false, verifying: false });
      toast.error(error?.response?.data?.error || 'Could not send the confirmation code.');
    }
  };

  const respondInvitation = async (invitation, action) => {
    try {
      await finishInvitationResponse(invitation, action);
      toast.success(action === 'accept' ? 'Family invitation accepted.' : action === 'report' ? 'Invitation reported and blocked.' : 'Family invitation declined.');
      await load();
    } catch (error) {
      if (action === 'accept' && error?.response?.data?.code === 'FAMILY_ACCEPT_OTP_REQUIRED') {
        await requestInvitationOtp(invitation);
        return;
      }
      toast.error(error?.response?.data?.error || 'Could not respond to the invitation.');
    }
  };

  const verifyInvitationOtp = async () => {
    const invitation = invitationOtp.invitation;
    const code = digits(invitationOtp.code).slice(-6);
    if (!invitation || code.length !== 6) {
      toast.error('Enter the 6-digit confirmation code.');
      return;
    }
    setInvitationOtp((v) => ({ ...v, verifying: true }));
    try {
      await finishInvitationResponse(invitation, 'accept', code);
      setInvitationOtp({ open: false, invitation: null, code: '', maskedPhone: '', sending: false, verifying: false });
      toast.success('Family invitation accepted.');
      await load();
    } catch (error) {
      setInvitationOtp((v) => ({ ...v, verifying: false }));
      toast.error(error?.response?.data?.error || 'The confirmation code could not be verified.');
    }
  };

  const addMember = async () => {
    const phone = digits(addForm.phone);
    if (!addForm.firstName.trim() || !addForm.lastName.trim()) {
      toast.error('First name and last name are required.');
      return;
    }
    if (!noPhoneMode && !phone) {
      setPhoneFieldError('Please enter the family member\'s phone number.');
      setPhonePromptMessage('A phone number for this family member is required.');
      setPhonePromptOpen(true);
      return;
    }
    if (!noPhoneMode && phone.length !== 10) {
      setPhoneFieldError('Please enter a valid 10-digit phone number.');
      setPhonePromptMessage('Please enter a valid 10-digit phone number for this family member.');
      setPhonePromptOpen(true);
      return;
    }
    if (noPhoneMode && (!addForm.dob || !addForm.guardianAttestation)) {
      toast.error('Date of birth and guardian confirmation are required.');
      return;
    }
    setSaving(true);
    try {
      const { data } = await API.post(`/clients/${client._id}/family`, {
        firstName: addForm.firstName.trim(),
        lastName: addForm.lastName.trim(),
        memberPhone: noPhoneMode ? '' : phone,
        relationship: addForm.relationship,
        noPhone: noPhoneMode,
        dob: noPhoneMode ? addForm.dob : null,
        guardianAttestation: noPhoneMode ? addForm.guardianAttestation : false,
      });
      toast.success(data?.pendingInvitation ? 'Invitation sent. The existing client must accept before booking is allowed.' : (noPhoneMode ? 'Minor dependent added.' : 'Family member added.'));
      setAddForm({ firstName: '', lastName: '', phone: '', relationship: 'family', dob: '', guardianAttestation: false });
      setNoPhoneMode(false);
      setAdding(false);
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Could not add the family member.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" aria-label="My Family">
      <div className="max-h-[94vh] w-full max-w-3xl overflow-y-auto rounded-t-2xl bg-gray-100 shadow-2xl sm:rounded-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b bg-white px-4 py-3">
          <div className="flex items-center gap-3">
            <img src={familyIcon} alt="" className="h-12 w-12 rounded-xl object-cover" />
            <div>
              <h2 className="text-xl font-bold">My Family</h2>
              {overview?.summary && (
                <p className="text-xs text-gray-600">
                  {overview.summary.upcomingCount} upcoming • {overview.summary.pendingCount} pending • {overview.summary.withoutAppointmentCount} without appointment
                </p>
              )}
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full border bg-white px-3 py-1.5 text-sm font-semibold">Close</button>
        </div>

        <div className="space-y-3 p-4">
          {incomingInvitations.length > 0 && (
            <section className="rounded-xl border border-amber-300 bg-amber-50 p-4">
              <h3 className="font-bold text-amber-950">Family invitations</h3>
              <p className="mb-3 text-xs text-amber-900">No one receives access until you accept.</p>
              <div className="space-y-2">
                {incomingInvitations.map((invitation) => (
                  <div key={invitation._id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-white p-3">
                    <div><strong>{fullName(invitation)}</strong><p className="text-xs text-gray-600">wants to add you to their family booking group</p></div>
                    <div className="flex flex-wrap gap-2">
                      <button type="button" onClick={() => respondInvitation(invitation, 'accept')} className="rounded bg-green-600 px-3 py-1.5 text-sm font-semibold text-white">Accept</button>
                      <button type="button" onClick={() => respondInvitation(invitation, 'decline')} className="rounded border px-3 py-1.5 text-sm font-semibold">Decline</button>
                      <button type="button" onClick={() => respondInvitation(invitation, 'report')} className="rounded border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700">Report mistake</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {pendingOutgoing.length > 0 && (
            <section className="rounded-xl border bg-white p-4">
              <h3 className="font-bold">Pending invitations</h3>
              <div className="mt-2 space-y-2">
                {pendingOutgoing.map((member) => (
                  <div key={member._id} className="flex items-center justify-between gap-2 rounded-lg bg-gray-50 p-3">
                    <div><strong>{fullName(member)}</strong><p className="text-xs text-gray-600">Waiting for this client to accept. Booking and profile access are blocked.</p></div>
                    <button type="button" onClick={() => unlink(member)} className="rounded border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700">Cancel invitation</button>
                  </div>
                ))}
              </div>
            </section>
          )}
          {loading ? <p className="rounded-lg bg-white p-4">Loading family…</p> : (overview?.members || []).filter((member) => member.relationship === 'self' || String(member.linkStatus || 'active') === 'active').map((member) => {
            const isSelf = member.relationship === 'self';
            const isEditing = editingId === member._id;
            return (
              <section key={member._id} className="rounded-xl border bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-bold text-gray-900">{fullName(member)}</h3>
                      <span className="rounded-full bg-blue-50 px-2 py-0.5 text-xs capitalize text-blue-800">{isSelf ? 'Me' : member.relationship}</span>
                      {member.pendingCount > 0 && <span className="rounded-full bg-yellow-100 px-2 py-0.5 text-xs font-semibold text-yellow-900">{member.pendingCount} pending</span>}
                    </div>
                    {(!member.upcomingAppointments || member.upcomingAppointments.length === 0) && (
                      <p className="mt-1 text-sm font-semibold text-amber-700">No upcoming appointment</p>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => onBook([String(member._id)])}
                      disabled={Number(member.activeAppointmentCount ?? member.upcomingAppointments?.length ?? 0) >= 2}
                      title={Number(member.activeAppointmentCount ?? member.upcomingAppointments?.length ?? 0) >= 2 ? 'Two active appointments already. Contact the salon for another appointment.' : ''}
                      className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-gray-400"
                    >
                      {Number(member.activeAppointmentCount ?? member.upcomingAppointments?.length ?? 0) >= 2 ? '2 active — call salon' : (member.nextAppointment ? 'Book another' : 'Make appointment')}
                    </button>
                    {!isSelf && member.canEditProfile && <button type="button" onClick={() => beginEdit(member)} className="rounded border px-3 py-2 text-sm font-semibold">Edit info</button>}
                  </div>
                </div>

                {(member.upcomingAppointments || []).length > 0 && (
                  <div className="mt-3 space-y-2">
                    {(member.upcomingAppointments || []).map((appointment) => (
                      <div key={appointment._id || `${appointment.date}-${appointment.time}-${appointment.service || ''}`} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-gray-900">{formatAppointment(appointment)}</p>
                          {appointment.status && <p className="text-xs uppercase text-gray-500">{appointment.status}</p>}
                        </div>
                        {appointment.canEditAppointment === true && (
                          <div className="flex shrink-0 gap-1.5">
                            <button type="button" onClick={() => onEditAppointment(appointment)} className="rounded border border-blue-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-blue-700">Edit</button>
                            <button type="button" onClick={() => cancelAppointment(appointment)} className="rounded border border-red-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-red-700">Cancel</button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {isEditing && (
                  <div className="mt-4 grid gap-2 rounded-lg bg-gray-50 p-3 sm:grid-cols-2">
                    <input className="rounded border p-2" value={form.firstName} disabled={!member.canEditProfile} onChange={(e) => setForm((v) => ({ ...v, firstName: e.target.value }))} placeholder="First name" />
                    <input className="rounded border p-2" value={form.lastName} disabled={!member.canEditProfile} onChange={(e) => setForm((v) => ({ ...v, lastName: e.target.value }))} placeholder="Last name" />
                    <input className="rounded border p-2" value={form.phone} disabled={!member.canEditProfile} onChange={(e) => setForm((v) => ({ ...v, phone: e.target.value }))} placeholder="Phone" />
                    <select className="rounded border p-2" value={form.relationship} onChange={(e) => setForm((v) => ({ ...v, relationship: e.target.value }))}>
                      {RELATIONSHIPS.map((relationship) => <option key={relationship} value={relationship}>{relationship[0].toUpperCase() + relationship.slice(1)}</option>)}
                    </select>
                    {!member.canEditProfile && <p className="text-xs text-gray-600 sm:col-span-2">For another adult, you can change the relationship label. They control their own name, phone, and login details.</p>}
                    <div className="flex flex-wrap gap-2 sm:col-span-2">
                      <button type="button" disabled={saving} onClick={() => saveMember(member)} className="rounded bg-green-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">Save changes</button>
                      <button type="button" onClick={() => setEditingId(null)} className="rounded border px-3 py-2 text-sm">Cancel</button>
                      <button type="button" onClick={() => unlink(member)} className="ml-auto rounded border border-red-300 px-3 py-2 text-sm font-semibold text-red-700">Remove from family</button>
                    </div>
                  </div>
                )}
              </section>
            );
          })}

          {linkedMembers.some((member) => Number(member.activeAppointmentCount ?? member.upcomingAppointments?.length ?? 0) < 2) && Number((overview?.members || []).find((member) => member.relationship === 'self')?.activeAppointmentCount ?? 0) < 2 && (
            <button
              type="button"
              onClick={() => {
                const availableMember = linkedMembers.find((member) => Number(member.activeAppointmentCount ?? member.upcomingAppointments?.length ?? 0) < 2);
                if (availableMember) onBook([String(client._id), String(availableMember._id)]);
              }}
              className="w-full rounded-xl bg-indigo-700 px-4 py-3 font-bold text-white"
            >
              Book together
            </button>
          )}

          <section className="rounded-xl border bg-white p-4">
            <button type="button" onClick={() => setAdding((value) => !value)} className="font-bold text-blue-700">+ Add family member</button>
            {adding && (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-semibold text-gray-800">First name <span className="text-red-600">*</span>
                  <input className="mt-1 w-full rounded border p-2 font-normal" placeholder="First name" value={addForm.firstName} onChange={(e) => setAddForm((v) => ({ ...v, firstName: e.target.value }))} />
                </label>
                <label className="text-sm font-semibold text-gray-800">Last name <span className="text-red-600">*</span>
                  <input className="mt-1 w-full rounded border p-2 font-normal" placeholder="Last name" value={addForm.lastName} onChange={(e) => setAddForm((v) => ({ ...v, lastName: e.target.value }))} />
                </label>
                {!noPhoneMode && (
                  <label className="text-sm font-semibold text-gray-800">Phone number <span className="text-red-600">*</span>
                    <input id="family-member-phone" aria-invalid={Boolean(phoneFieldError)} className={`mt-1 w-full rounded border p-2 font-normal ${phoneFieldError ? 'border-red-500 ring-1 ring-red-500' : ''}`} placeholder="10-digit phone" inputMode="tel" value={addForm.phone} onChange={(e) => { setPhoneFieldError(''); setAddForm((v) => ({ ...v, phone: e.target.value })); }} />
                    {phoneFieldError && <span className="mt-1 block text-xs font-semibold text-red-600">{phoneFieldError}</span>}
                  </label>
                )}
                <label className="text-sm font-semibold text-gray-800">Relationship <span className="text-red-600">*</span>
                  <select className="mt-1 w-full rounded border p-2 font-normal" value={addForm.relationship} onChange={(e) => setAddForm((v) => ({ ...v, relationship: e.target.value }))}>
                    {(noPhoneMode ? NO_PHONE_RELATIONSHIPS : RELATIONSHIPS.map((r) => [r, r[0].toUpperCase() + r.slice(1)])).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </label>
                {noPhoneMode && (
                  <>
                    <label className="text-sm font-semibold text-gray-800">Date of birth <span className="text-red-600">*</span>
                      <input type="date" className="mt-1 w-full rounded border p-2 font-normal" value={addForm.dob} onChange={(e) => setAddForm((v) => ({ ...v, dob: e.target.value }))} />
                    </label>
                    <label className="flex items-start gap-2 rounded border bg-amber-50 p-3 text-sm sm:col-span-2">
                      <input type="checkbox" className="mt-1" checked={addForm.guardianAttestation} onChange={(e) => setAddForm((v) => ({ ...v, guardianAttestation: e.target.checked }))} />
                      <span>I confirm this person is under 18, does not have their own phone, and I am authorized to manage their salon appointments.</span>
                    </label>
                    <p className="text-xs text-gray-600 sm:col-span-2">Adults without a phone must be added by salon staff.</p>
                  </>
                )}
                <div className="flex gap-2 sm:col-span-2">
                  <button type="button" disabled={saving} onClick={addMember} className="rounded bg-blue-600 px-3 py-2 font-semibold text-white disabled:opacity-50">{noPhoneMode ? 'Add minor dependent' : 'Add member'}</button>
                  {noPhoneMode && <button type="button" onClick={() => { setNoPhoneMode(false); setAddForm((v) => ({ ...v, relationship: 'family', dob: '', guardianAttestation: false })); }} className="rounded border px-3 py-2">Use phone number</button>}
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
      {invitationOtp.open && createPortal(
        <div className="fixed inset-0 flex items-center justify-center bg-black/55 p-4" style={{ zIndex: 99999 }} role="dialog" aria-modal="true" aria-label="Confirm family invitation">
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900">Confirm family invitation</h3>
            {invitationOtp.sending ? (
              <p className="mt-3 text-sm text-gray-700">Sending a one-time code…</p>
            ) : (
              <>
                <p className="mt-2 text-sm text-gray-700">Enter the 6-digit code sent to {invitationOtp.maskedPhone || 'your phone'}.</p>
                <input autoFocus inputMode="numeric" maxLength={6} className="mt-4 w-full rounded-lg border p-3 text-center text-xl tracking-[0.35em]" value={invitationOtp.code} onChange={(e) => setInvitationOtp((v) => ({ ...v, code: digits(e.target.value).slice(0, 6) }))} placeholder="000000" />
                <div className="mt-4 flex gap-2">
                  <button type="button" disabled={invitationOtp.verifying} onClick={verifyInvitationOtp} className="flex-1 rounded-lg bg-green-600 px-4 py-2.5 font-bold text-white disabled:opacity-50">{invitationOtp.verifying ? 'Verifying…' : 'Verify and accept'}</button>
                  <button type="button" disabled={invitationOtp.verifying} onClick={() => setInvitationOtp({ open: false, invitation: null, code: '', maskedPhone: '', sending: false, verifying: false })} className="rounded-lg border px-4 py-2.5 font-semibold">Cancel</button>
                </div>
                <button type="button" onClick={() => requestInvitationOtp(invitationOtp.invitation)} className="mt-3 w-full text-xs font-semibold text-blue-700 underline">Resend code</button>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
      {phonePromptOpen && createPortal(
        <div
          className="fixed inset-0 flex items-center justify-center bg-black/55 p-4"
          style={{ zIndex: 99999 }}
          role="alertdialog"
          aria-modal="true"
          aria-label="Phone number required"
        >
          <div className="w-full max-w-sm rounded-2xl bg-white p-5 text-center shadow-2xl">
            <h3 className="text-lg font-bold text-gray-900">Phone number required</h3>
            <p className="mt-2 text-sm text-gray-700">{phonePromptMessage}</p>
            <button
              type="button"
              onClick={() => {
                setPhonePromptOpen(false);
                setTimeout(() => document.getElementById('family-member-phone')?.focus(), 0);
              }}
              className="mt-5 w-full rounded-lg bg-blue-600 px-4 py-2.5 font-bold text-white"
            >
              OK
            </button>
            <button
              type="button"
              onClick={() => {
                setPhonePromptOpen(false);
                setPhoneFieldError('');
                setNoPhoneMode(true);
                setAddForm((v) => ({ ...v, phone: '', relationship: 'child' }));
              }}
              className="mt-3 text-xs font-semibold text-blue-700 underline"
            >
              This family member does not have a phone
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
