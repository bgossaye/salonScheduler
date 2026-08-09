import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import API from '../../api';
import { toast } from 'react-toastify';
import { normalizeDateForInput } from '../../utils/formatHelper'; 
import { coercePhone10, isTenDigit } from '../../utils/phone';
import {
  doesAppointmentQualifyForSpecial,
  getAppointmentServiceName,
  getSpecialAppointmentBadgeText,
  usePromotionConfig,
} from '../../utils/specialDeals';

const formatDeclineCooldown = (hours) => {
  const n = Number(hours);
  if (!Number.isFinite(n)) return '24 hours';
  if (n === 0) return 'disabled';
  if (n < 1 / 60) {
    const seconds = Math.max(1, Math.round(n * 3600));
    return `${seconds} second${seconds === 1 ? '' : 's'}`;
  }
  if (n < 1) {
    const minutes = Math.max(1, Math.round(n * 60));
    return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  }
  const shown = Number.isInteger(n) ? n : Number(n.toFixed(3));
  return `${shown} hour${shown === 1 ? '' : 's'}`;
};

const formatDeclineRemaining = (decline) => {
  const ms = Number(decline?.remainingMs);
  if (Number.isFinite(ms)) {
    if (ms < 60 * 1000) {
      const seconds = Math.max(1, Math.ceil(ms / 1000));
      return `${seconds} second${seconds === 1 ? '' : 's'}`;
    }
    if (ms < 60 * 60 * 1000) {
      const minutes = Math.max(1, Math.ceil(ms / (60 * 1000)));
      return `${minutes} minute${minutes === 1 ? '' : 's'}`;
    }
  }
  const hours = Number(decline?.remainingHours);
  return Number.isFinite(hours) && hours > 0 ? `${hours} hour${hours === 1 ? '' : 's'}` : '';
};

export default function AdminClientProfile() {
  const { id: clientId } = useParams();
  const [client, setClient] = useState(null);
  const navigate = useNavigate();
  const fileInputRef = useRef();
  const [appointments, setAppointments] = useState([]);
  const [nextAppointment, setNextAppointment] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [familyBusy, setFamilyBusy] = useState(false);
  const [familyLinkForm, setFamilyLinkForm] = useState({ phone: '', relationship: 'family' });
  const [dependentForm, setDependentForm] = useState({ firstName: '', lastName: '', dob: '', relationship: 'child' });
  const [showFamilyAdd, setShowFamilyAdd] = useState(false);
  const { promotionConfig } = usePromotionConfig();
  const shouldShowWorkerPromotion = promotionConfig.enabled && promotionConfig.showWorkerBadges;

useEffect(() => {
    const fetchClient = async () => {
      try {
	console.log("fetchClient...")
if (!clientId || clientId.length !== 24) {
  console.warn("Invalid clientId:", clientId);
  return;
}
else
{  console.log("clientId:", clientId);}

        const { data } = await API.get(`/admin/clients/${clientId}/details`);
        const clientData = data.client || data;
        clientData.dob = normalizeDateForInput(clientData.dob); // normalize once
        setClient(clientData);
	console.log("post get fetchClient...")

        const phone = clientData.phone;
        if (phone) {
          const apptRes = await API.get('/admin/appointments', { params: { client: phone } });
          const sorted = apptRes.data.sort(
            (a, b) => new Date(`${a.date}T${a.time}`) - new Date(`${b.date}T${b.time}`)
          );
          setAppointments(sorted);
          const upcoming = sorted.find(a => a.status === 'booked' || a.status === 'confirmed');
          if (upcoming) {
            setNextAppointment(`${upcoming.date} at ${upcoming.time}`);
          }
        }
      } catch (err) {
        console.error("Client fetch error:", err);
        setError('Failed to load client data.');
      } finally {
        setLoading(false);
      }
    };

    if (clientId) fetchClient();
  }, [clientId]);

  const handleChange = (field, value) => {
    setClient({
      ...client,
      [field]: field === 'phone' ? coercePhone10(value) : value,
    });
  };

  const handleImageUpload = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('image', file);
    try {
      const { data } = await API.post(`/admin/clients/${client._id}/upload-photo`, formData);
      setClient({ ...client, profilePhoto: data.url });
    } catch (err) {
      alert('Failed to upload image.');
    }
  };

const handleSave = async () => {
  const phoneRequired = !['minor_dependent', 'admin_no_phone'].includes(String(client?.profileType || 'independent'));
  if ((phoneRequired || client?.phone) && !isTenDigit(client?.phone || '')) {
    alert(phoneRequired ? 'Phone must be a valid 10-digit number.' : 'If a phone is entered, it must be a valid 10-digit number.');
    return;
  }

  setSaving(true);
  try {
      const payload = {
          ...client,
          servicePreferences: client.servicePreferences || {}
      };
      if (!client?.phone && ['minor_dependent', 'admin_no_phone'].includes(String(client?.profileType || ''))) {
        delete payload.phone;
      }
      await API.patch(`/admin/clients/${client._id}`, payload);
    alert('Client profile updated.');
    navigate('/admin/clients'); // 👈 redirect here
  } catch (err) {
    alert('Failed to save changes.');
  } finally {
    setSaving(false);
  }
};

  const handleToggle = (field) => {
    API.patch(`/admin/clients/${clientId}`, {
      [`contactPreferences.${field}`]: !client.contactPreferences[field]
    })
      .then(res => setClient(res.data))
      .catch(err => toast.error('Failed to update preferences'));
  };

  const handleUnblockFamilyInvitations = async (block) => {
    if (!block?.memberId) return;
    const otherName = block.otherClientName || 'this client';
    const confirmed = window.confirm(
      `Allow family invitations again between ${[client?.firstName, client?.lastName].filter(Boolean).join(' ') || 'this client'} and ${otherName}?\n\nThis does not restore the reported invitation. It only allows a brand-new invitation to be sent. The report remains in the audit history.`
    );
    if (!confirmed) return;
    try {
      const reason = window.prompt('Optional admin note for this unblock:', 'Staff approved future family invitations.') || 'Staff approved future family invitations.';
      const { data } = await API.post(`/admin/clients/${clientId}/family/${block.memberId}/unblock-invitations`, { reason });
      toast.success(data?.message || 'Family invitation block removed.');
      const fresh = await API.get(`/admin/clients/${clientId}/details`);
      const freshClient = fresh.data?.client || fresh.data;
      freshClient.dob = normalizeDateForInput(freshClient.dob);
      setClient(freshClient);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove the family invitation block.');
    }
  };


  const handleClearDeclineCooldown = async (decline) => {
    if (!decline?.memberId) return;
    const otherName = decline.otherClientName || 'this client';
    const confirmed = window.confirm(
      `Allow a new family invitation now between ${[client?.firstName, client?.lastName].filter(Boolean).join(' ') || 'this client'} and ${otherName}?\n\nThis only clears the temporary decline cooldown. It does not restore the declined invitation.`
    );
    if (!confirmed) return;
    try {
      const reason = window.prompt('Optional admin note:', 'Staff allowed a new invitation before the decline cooldown ended.') || 'Staff allowed a new invitation before the decline cooldown ended.';
      const { data } = await API.post(`/admin/clients/${clientId}/family/${decline.memberId}/clear-decline-cooldown`, { reason });
      toast.success(data?.message || 'Decline cooldown cleared.');
      const fresh = await API.get(`/admin/clients/${clientId}/details`);
      const freshClient = fresh.data?.client || fresh.data;
      freshClient.dob = normalizeDateForInput(freshClient.dob);
      setClient(freshClient);
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not clear the decline cooldown.');
    }
  };


  const refreshClientDetails = async () => {
    const fresh = await API.get(`/admin/clients/${clientId}/details`);
    const freshClient = fresh.data?.client || fresh.data;
    freshClient.dob = normalizeDateForInput(freshClient.dob);
    setClient(freshClient);
    return freshClient;
  };

  const handleLinkExistingFamily = async (e) => {
    e.preventDefault();
    if (!isTenDigit(familyLinkForm.phone || '')) {
      toast.error('Enter the existing client’s 10-digit phone number.');
      return;
    }
    try {
      setFamilyBusy(true);
      const { data } = await API.post(`/admin/clients/${clientId}/family/link`, {
        phone: coercePhone10(familyLinkForm.phone),
        relationship: familyLinkForm.relationship || 'family',
      });
      toast.success(data?.message || 'Family member linked.');
      setFamilyLinkForm({ phone: '', relationship: 'family' });
      await refreshClientDetails();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not link this family member.');
    } finally {
      setFamilyBusy(false);
    }
  };

  const handleCreateDependent = async (e) => {
    e.preventDefault();
    if (!dependentForm.firstName.trim() || !dependentForm.lastName.trim()) {
      toast.error('First and last name are required.');
      return;
    }
    try {
      setFamilyBusy(true);
      const { data } = await API.post(`/admin/clients/${clientId}/family/create-dependent`, {
        ...dependentForm,
        dob: dependentForm.dob || null,
      });
      toast.success(data?.message || 'Dependent added.');
      setDependentForm({ firstName: '', lastName: '', dob: '', relationship: 'child' });
      await refreshClientDetails();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not create the dependent.');
    } finally {
      setFamilyBusy(false);
    }
  };

  const handleUnlinkFamily = async (member) => {
    if (!member?._id) return;
    const name = [member.firstName, member.lastName].filter(Boolean).join(' ') || 'this family member';
    if (!window.confirm(`Remove the family link with ${name}? Appointment history is not deleted.`)) return;
    try {
      setFamilyBusy(true);
      const { data } = await API.delete(`/admin/clients/${clientId}/family/${member._id}`);
      toast.success(data?.message || 'Family link removed.');
      await refreshClientDetails();
    } catch (err) {
      toast.error(err?.response?.data?.error || 'Could not remove the family link.');
    } finally {
      setFamilyBusy(false);
    }
  };

  const handlePendingInvitation = async (member, action) => {
    if (!member?._id) return;
    try {
      setFamilyBusy(true);
      const endpoint = action === 'resend' ? 'resend-invitation' : 'cancel-invitation';
      const { data } = await API.post(`/admin/clients/${clientId}/family/${member._id}/${endpoint}`);
      toast.success(data?.message || (action === 'resend' ? 'Invitation resent.' : 'Invitation canceled.'));
      await refreshClientDetails();
    } catch (err) {
      toast.error(err?.response?.data?.error || `Could not ${action} the invitation.`);
    } finally {
      setFamilyBusy(false);
    }
  };

  if (loading) return <div className="p-4">Loading...</div>;
  if (error) return <div className="p-4 text-red-600">{error}</div>;
  if (!client) return <div className="p-4">Client not found.</div>;

  return (
    <div className="p-4 max-w-3xl mx-auto">
      <h2 className="text-2xl font-bold mb-4">Client Profile</h2>
<div className="p-4 space-y-4">
<h2 className="text-xl font-bold">
  Client Profile: {`${client.firstName || ''} ${client.lastName || ''}`.trim()}
</h2>
      <p>Email: {client.email}</p>
      <p>Phone: {client.phone}</p>

      <div className="space-y-2">
        <label>
          <input
            type="checkbox"
            checked={!!client.contactPreferences.optInPromotions}
            onChange={() => handleToggle('optInPromotions')}
          />
          Receive SMS (consent)
        </label>
        <br />
        <label>
          <input
            type="checkbox"
            checked={!client.contactPreferences.emailDisabled}
            onChange={() => handleToggle('emailDisabled')}
          />
          Receive Email
        </label>
      </div>
    </div>

      <div className="flex items-center gap-4 mb-6">
        <div className="relative">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleImageUpload}
            className="hidden"
            accept="image/*"
          />
          <div
            onClick={() => fileInputRef.current?.click()}
            className="cursor-pointer"
            title="Click to upload image"
          >
            {client.profilePhoto ? (
              <img
                src={client.profilePhoto}
                alt="Profile"
                className="w-24 h-24 rounded-full object-cover border"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-gray-300 flex items-center justify-center text-gray-600">
                No Image
              </div>
            )}
          </div>
        </div>
        <div>
          <h3 className="text-xl font-semibold">
{[client.firstName, client.lastName].filter(Boolean).join(' ') || 'N/A'}
          </h3>
          <p className="text-sm text-gray-600">ID: {client._id}</p>
        </div>
      </div>

      <table className="w-full text-sm border mb-6">
              <tbody>
                  <tr>
                      <td className="p-2 border font-medium">First Name:</td>
                      <td className="p-2 border">
                          <input
                              value={client.firstName || ''}
                              onChange={(e) => handleChange('firstName', e.target.value)}
                              className="w-full border px-2 py-1"
                          />
                      </td>
                  </tr>
                  <tr>
                      <td className="p-2 border font-medium">Last Name:</td>
                      <td className="p-2 border">
                          <input
                              value={client.lastName || ''}
                              onChange={(e) => handleChange('lastName', e.target.value)}
                              className="w-full border px-2 py-1"
                          />
                      </td>
                  </tr>
                  <tr>
                      <td className="p-2 border font-medium">Nickname!:</td>
                      <td className="p-2 border">
                          <input
                              value={client.nickname || ''}
                              onChange={(e) => handleChange('nickname', e.target.value)}
                              className="w-full border px-2 py-1"
                          />
                      </td>
                  </tr>

          <tr>
            <td className="p-2 border font-medium">Phone:</td>
            <td className="p-2 border">
              <input value={client.phone || ''} onChange={(e) => handleChange('phone', e.target.value)} className="w-full border px-2 py-1" />
            </td>
          </tr>
          <tr>
            <td className="p-2 border font-medium">Email:</td>
            <td className="p-2 border">
              <input value={client.email || ''} onChange={(e) => handleChange('email', e.target.value)} className="w-full border px-2 py-1" />
            </td>
          </tr>
          <tr>
            <td className="p-2 border font-medium">Date of Birth:</td>
            <td className="p-2 border">
            <input type="date" value={client.dob || ''}
                              onChange={(e) => handleChange('dob', e.target.value)}
                              className="w-full border px-2 py-1"/>
            </td>
          </tr>
          <tr>
            <td className="p-2 border font-medium">Visit Frequency:</td>
            <td className="p-2 border">
              <input value={client.visitFrequency || ''} onChange={(e) => handleChange('visitFrequency', e.target.value)} className="w-full border px-2 py-1" />
            </td>
          </tr>
          <tr>
            <td className="p-2 border font-medium">Next Appointment:</td>
            <td className="p-2 border">
              <input value={nextAppointment || 'N/A'} disabled className="w-full border bg-gray-100 px-2 py-1 text-gray-500" />
            </td>
          </tr>
          <tr>
            <td className="p-2 border font-medium">Service Preferences:</td>
            <td className="p-2 border">
                          <input
                              value={(client.servicePreferences?.services || []).join(', ')}
                              onChange={(e) =>
                                  handleChange('servicePreferences', {
                                      ...client.servicePreferences,
                                      services: e.target.value.split(',').map(p => p.trim())
                                  })
                              }
                              className="w-full border px-2 py-1"
                          />
            </td>
          </tr>
          <tr>
            <td className="p-2 border font-medium">Notes:</td>
            <td className="p-2 border">
              <textarea value={client.notes || ''} onChange={(e) => handleChange('notes', e.target.value)} className="w-full border px-2 py-1" rows={4} />
            </td>
          </tr>
          <tr>
            <td className="p-2 border font-medium">Payment Info:</td>
            <td className="p-2 border">
              <input value={client.paymentInfo || ''} onChange={(e) => handleChange('paymentInfo', e.target.value)} className="w-full border px-2 py-1" />
            </td>
          </tr>
        </tbody>
      </table>

      <button onClick={handleSave} disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded">
        {saving ? 'Saving...' : 'Save Changes'}
      </button>


      <section className="mt-8 rounded-xl border border-indigo-200 bg-indigo-50 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-indigo-950">Family / Group</h3>
            <p className="mt-1 text-xs text-indigo-900">
              View family relationships, dependents, pending invitations, and bookable household members from the same client record.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-indigo-900">
              {(client.familyOverview?.members || []).length} active
            </span>
            <button
              type="button"
              onClick={() => setShowFamilyAdd((v) => !v)}
              className="rounded-lg bg-indigo-700 px-3 py-2 text-sm font-semibold text-white hover:bg-indigo-800"
            >
              {showFamilyAdd ? 'Close' : '+ Add / Link'}
            </button>
          </div>
        </div>

        {client.profileType === 'minor_dependent' && (
          <div className="mt-3 rounded-lg border border-indigo-200 bg-white p-3 text-sm">
            <strong>Minor dependent</strong>
            {client.relationshipToGuardian ? ` • ${client.relationshipToGuardian}` : ''}
            <div className="mt-1 text-xs text-gray-600">
              This profile is guardian-managed. Guardian changes should be handled intentionally rather than by unlinking the minor.
            </div>
          </div>
        )}

        {showFamilyAdd && (
          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <form onSubmit={handleLinkExistingFamily} className="rounded-lg border border-indigo-200 bg-white p-3">
              <h4 className="font-bold text-gray-900">Link existing client</h4>
              <p className="mt-1 text-xs text-gray-600">Staff may directly link verified existing client records. Reported/declined blocks still require their normal admin override first.</p>
              <input
                className="mt-3 w-full rounded border p-2"
                placeholder="Existing client phone"
                value={familyLinkForm.phone}
                onChange={(e) => setFamilyLinkForm((v) => ({ ...v, phone: coercePhone10(e.target.value) }))}
              />
              <input
                className="mt-2 w-full rounded border p-2"
                placeholder="Relationship (child, spouse, sister...)"
                value={familyLinkForm.relationship}
                onChange={(e) => setFamilyLinkForm((v) => ({ ...v, relationship: e.target.value }))}
              />
              <button disabled={familyBusy} className="mt-3 rounded bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Link Client
              </button>
            </form>

            <form onSubmit={handleCreateDependent} className="rounded-lg border border-indigo-200 bg-white p-3">
              <h4 className="font-bold text-gray-900">Create no-phone dependent</h4>
              <p className="mt-1 text-xs text-gray-600">For a minor or another staff-approved family profile that does not have a phone.</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input
                  className="rounded border p-2"
                  placeholder="First name"
                  value={dependentForm.firstName}
                  onChange={(e) => setDependentForm((v) => ({ ...v, firstName: e.target.value }))}
                />
                <input
                  className="rounded border p-2"
                  placeholder="Last name"
                  value={dependentForm.lastName}
                  onChange={(e) => setDependentForm((v) => ({ ...v, lastName: e.target.value }))}
                />
              </div>
              <input
                type="date"
                className="mt-2 w-full rounded border p-2"
                value={dependentForm.dob}
                onChange={(e) => setDependentForm((v) => ({ ...v, dob: e.target.value }))}
              />
              <input
                className="mt-2 w-full rounded border p-2"
                placeholder="Relationship"
                value={dependentForm.relationship}
                onChange={(e) => setDependentForm((v) => ({ ...v, relationship: e.target.value }))}
              />
              <button disabled={familyBusy} className="mt-3 rounded bg-indigo-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50">
                Create Dependent
              </button>
            </form>
          </div>
        )}

        <div className="mt-4 space-y-3">
          {(client.familyOverview?.members || []).length === 0 ? (
            <p className="text-sm text-indigo-900">No active family members are linked to this client.</p>
          ) : (
            (client.familyOverview?.members || []).map((member) => (
              <div key={String(member._id)} className="rounded-lg border border-indigo-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-gray-900">
                      {[member.firstName, member.lastName].filter(Boolean).join(' ') || 'Family member'}
                      {member.relationship ? <span className="ml-2 text-xs font-normal text-gray-500">({member.relationship})</span> : null}
                    </div>
                    <div className="mt-1 text-xs text-gray-600">
                      {member.profileType === 'minor_dependent' ? 'Minor dependent' : member.profileType === 'admin_no_phone' ? 'No-phone staff profile' : 'Client'}
                      {member.phone ? ` • ••••${String(member.phone).replace(/\D/g, '').slice(-4)}` : ' • no phone'}
                      {member.upcomingCount ? ` • ${member.upcomingCount} active appointment${member.upcomingCount === 1 ? '' : 's'}` : ' • no active appointments'}
                    </div>
                    {member.nextAppointment && (
                      <div className="mt-1 text-xs font-medium text-indigo-800">
                        Next: {member.nextAppointment.date} at {member.nextAppointment.time} • {member.nextAppointment.service}
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      onClick={() => navigate(`/admin/client/${member._id}`)}
                      className="rounded border border-indigo-300 bg-white px-3 py-2 text-xs font-semibold text-indigo-800"
                    >
                      View Profile
                    </button>
                    {!member.isManagedMinor && (
                      <button
                        type="button"
                        disabled={familyBusy}
                        onClick={() => handleUnlinkFamily(member)}
                        className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700 disabled:opacity-50"
                      >
                        Unlink
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {(client.familyRelationshipSummary || []).some((item) => item.status === 'pending') && (
          <div className="mt-5 border-t border-indigo-200 pt-4">
            <h4 className="font-bold text-indigo-950">Pending invitations</h4>
            <div className="mt-2 space-y-2">
              {(client.familyRelationshipSummary || []).filter((item) => item.status === 'pending').map((member) => (
                <div key={String(member._id)} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-indigo-200 bg-white p-3">
                  <div>
                    <div className="font-semibold">{[member.firstName, member.lastName].filter(Boolean).join(' ') || 'Invited client'}</div>
                    <div className="text-xs text-gray-600">{member.relationship || 'family'} • {member.direction || 'pending'}</div>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" disabled={familyBusy} onClick={() => handlePendingInvitation(member, 'resend')} className="rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">
                      Resend
                    </button>
                    <button type="button" disabled={familyBusy} onClick={() => handlePendingInvitation(member, 'cancel')} className="rounded bg-gray-200 px-3 py-2 text-xs font-semibold text-gray-800 disabled:opacity-50">
                      Cancel
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="mt-8 rounded-xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="text-lg font-bold text-amber-950">Family Invitation Security</h3>
            <p className="mt-1 text-xs text-amber-900">Reported invitations stay blocked until authorized staff explicitly allows invitations again.</p>
          </div>
          <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-amber-900">
            {(client.familyInvitationBlocks || []).length} active block{(client.familyInvitationBlocks || []).length === 1 ? '' : 's'}
          </span>
        </div>

        {(client.familyInvitationBlocks || []).length === 0 ? (
          <p className="mt-3 text-sm text-amber-900">No active family-invitation blocks for this client.</p>
        ) : (
          <div className="mt-4 space-y-3">
            {(client.familyInvitationBlocks || []).map((block) => (
              <div key={String(block.memberId)} className="rounded-lg border border-amber-200 bg-white p-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="font-semibold text-gray-900">{block.otherClientName || 'Client'}{block.otherPhoneLast4 ? ` ••••${block.otherPhoneLast4}` : ''}</div>
                    <div className="mt-1 text-xs text-gray-600">
                      Reported {block.reportedAt ? new Date(block.reportedAt).toLocaleString() : 'date unavailable'}
                      {block.direction ? ` • ${block.direction} invitation` : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleUnblockFamilyInvitations(block)}
                    className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
                  >
                    Allow Invitations Again
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="mt-5 border-t border-amber-200 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h4 className="font-bold text-amber-950">Declined invitation cooldowns</h4>
              <p className="mt-1 text-xs text-amber-900">Default cooldown: {formatDeclineCooldown(client.declineCooldownHours ?? 24)}. Staff may allow a new invitation sooner.</p>
            </div>
            <span className="rounded-full bg-white px-2 py-1 text-xs font-semibold text-amber-900">
              {(client.familyInvitationDeclines || []).length} active
            </span>
          </div>

          {(client.familyInvitationDeclines || []).length === 0 ? (
            <p className="mt-3 text-sm text-amber-900">No active declined-invitation cooldowns for this client.</p>
          ) : (
            <div className="mt-3 space-y-3">
              {(client.familyInvitationDeclines || []).map((decline) => (
                <div key={String(decline.memberId)} className="rounded-lg border border-amber-200 bg-white p-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="font-semibold text-gray-900">{decline.otherClientName || 'Client'}{decline.otherPhoneLast4 ? ` ••••${decline.otherPhoneLast4}` : ''}</div>
                      <div className="mt-1 text-xs text-gray-600">
                        Declined {decline.declinedAt ? new Date(decline.declinedAt).toLocaleString() : 'date unavailable'}
                        {formatDeclineRemaining(decline) ? ` • about ${formatDeclineRemaining(decline)} remaining` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleClearDeclineCooldown(decline)}
                      className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white hover:bg-blue-700"
                    >
                      Allow Invitation Now
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {(client.familyInvitationAudit || []).length > 0 && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-amber-950">Recent report/unblock audit history</summary>
            <div className="mt-2 space-y-2">
              {(client.familyInvitationAudit || []).map((entry) => {
                const requesterName = [entry.requesterClientId?.firstName, entry.requesterClientId?.lastName].filter(Boolean).join(' ') || 'Client';
                const inviteeName = [entry.inviteeClientId?.firstName, entry.inviteeClientId?.lastName].filter(Boolean).join(' ') || 'Client';
                return (
                  <div key={entry._id} className="rounded border border-amber-100 bg-white px-3 py-2 text-xs text-gray-700">
                    <strong className="capitalize">{entry.action}</strong>: {requesterName} → {inviteeName}
                    {entry.createdAt ? ` • ${new Date(entry.createdAt).toLocaleString()}` : ''}
                    {entry.reason ? <div className="mt-1 text-gray-500">{entry.reason}</div> : null}
                  </div>
                );
              })}
            </div>
          </details>
        )}
      </section>

      <h3 className="text-xl font-bold mt-8 mb-2">Appointment History</h3>
      <table className="w-full text-sm border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 border">Date</th>
            <th className="p-2 border">Time</th>
            <th className="p-2 border">Service</th>
            <th className="p-2 border">Status</th>
          </tr>
        </thead>
        <tbody>
          {appointments.length === 0 ? (
            <tr><td colSpan="4" className="p-2 text-center">No appointments found.</td></tr>
          ) : (
            appointments.map(appt => {
              const qualifiesForSpecial = shouldShowWorkerPromotion && doesAppointmentQualifyForSpecial(appt, promotionConfig);
              const specialBadgeText = qualifiesForSpecial ? getSpecialAppointmentBadgeText(appt, promotionConfig) : '';
              const serviceName = getAppointmentServiceName(appt);
              return (
                <tr key={appt._id}>
                  <td className="p-2 border">{appt.date}</td>
                  <td className="p-2 border">{appt.time}</td>
                  <td className="p-2 border">
                    <div>{serviceName}</div>
                    {qualifiesForSpecial && (
                      <span className="mt-1 inline-block rounded-full border border-amber-300 bg-amber-50 px-2 py-[2px] text-[10px] font-semibold uppercase tracking-wide text-amber-800">
                        {specialBadgeText}
                      </span>
                    )}
                  </td>
                  <td className="p-2 border capitalize">{appt.status}</td>
                </tr>
              );
            })
          )}
        </tbody>
      </table>
    </div>
  );
}
