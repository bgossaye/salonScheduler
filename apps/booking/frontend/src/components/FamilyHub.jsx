import React, { useEffect, useMemo, useState } from 'react';
import API from '../api';
import { toast } from 'react-toastify';
import familyIcon from '../assets/family-hub.png';

const RELATIONSHIPS = ['spouse', 'child', 'parent', 'sibling', 'dependent', 'family', 'other'];
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
  const [addForm, setAddForm] = useState({ firstName: '', lastName: '', phone: '', relationship: 'family' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!client?._id || !client?.phone) return;
    setLoading(true);
    try {
      const { data } = await API.get(`/clients/${client._id}/family/overview`, { params: { phone: client.phone } });
      setOverview(data || null);
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Could not load your family.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [client?._id, client?.phone]); // eslint-disable-line react-hooks/exhaustive-deps

  const linkedMembers = useMemo(
    () => (overview?.members || []).filter((member) => member.relationship !== 'self'),
    [overview]
  );

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
        ownerPhone: client.phone,
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
      await API.delete(`/clients/${client._id}/family/${member._id}`, { data: { ownerPhone: client.phone } });
      toast.success('Family member unlinked.');
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.error || 'Could not unlink the family member.');
    }
  };

  const addMember = async () => {
    const phone = digits(addForm.phone);
    if (!addForm.firstName.trim() || !addForm.lastName.trim() || phone.length !== 10) {
      toast.error('Enter a first name, last name, and valid 10-digit phone.');
      return;
    }
    setSaving(true);
    try {
      await API.post(`/clients/${client._id}/family`, {
        ownerPhone: client.phone,
        firstName: addForm.firstName.trim(),
        lastName: addForm.lastName.trim(),
        memberPhone: phone,
        relationship: addForm.relationship,
      });
      toast.success('Family member added.');
      setAddForm({ firstName: '', lastName: '', phone: '', relationship: 'family' });
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
          {loading ? <p className="rounded-lg bg-white p-4">Loading family…</p> : (overview?.members || []).map((member) => {
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
                    <p className={`mt-1 text-sm ${member.nextAppointment ? 'text-gray-700' : 'font-semibold text-amber-700'}`}>{formatAppointment(member.nextAppointment)}</p>
                    {member.nextAppointment && <p className="text-xs uppercase text-gray-500">{member.nextAppointment.status}</p>}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button type="button" onClick={() => onBook([String(member._id)])} className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white">
                      {member.nextAppointment ? 'Book another' : 'Make appointment'}
                    </button>
                    {member.nextAppointment && (
                      <button type="button" onClick={() => onEditAppointment(member.nextAppointment)} className="rounded border border-blue-300 px-3 py-2 text-sm font-semibold text-blue-700">Edit appointment</button>
                    )}
                    {!isSelf && <button type="button" onClick={() => beginEdit(member)} className="rounded border px-3 py-2 text-sm font-semibold">Edit info</button>}
                  </div>
                </div>

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

          {linkedMembers.length > 0 && (
            <button type="button" onClick={() => onBook([String(client._id), ...linkedMembers.slice(0, 1).map((m) => String(m._id))])} className="w-full rounded-xl bg-indigo-700 px-4 py-3 font-bold text-white">
              Book together
            </button>
          )}

          <section className="rounded-xl border bg-white p-4">
            <button type="button" onClick={() => setAdding((value) => !value)} className="font-bold text-blue-700">+ Add family member</button>
            {adding && (
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                <input className="rounded border p-2" placeholder="First name" value={addForm.firstName} onChange={(e) => setAddForm((v) => ({ ...v, firstName: e.target.value }))} />
                <input className="rounded border p-2" placeholder="Last name" value={addForm.lastName} onChange={(e) => setAddForm((v) => ({ ...v, lastName: e.target.value }))} />
                <input className="rounded border p-2" placeholder="10-digit phone" inputMode="tel" value={addForm.phone} onChange={(e) => setAddForm((v) => ({ ...v, phone: e.target.value }))} />
                <select className="rounded border p-2" value={addForm.relationship} onChange={(e) => setAddForm((v) => ({ ...v, relationship: e.target.value }))}>
                  {RELATIONSHIPS.map((relationship) => <option key={relationship} value={relationship}>{relationship[0].toUpperCase() + relationship.slice(1)}</option>)}
                </select>
                <button type="button" disabled={saving} onClick={addMember} className="rounded bg-blue-600 px-3 py-2 font-semibold text-white disabled:opacity-50">Add member</button>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
