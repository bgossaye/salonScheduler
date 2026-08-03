import React, { useEffect, useMemo, useState } from 'react';
import API from '../../api';

const DAY_OPTIONS = [
  { value: 0, label: 'Sun' },
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
];

const EMPTY_FORM = {
  title: '',
  description: '',
  status: 'active',
  type: 'auto',
  couponCode: '',
  discountType: 'percent',
  discountValue: 20,
  shortLabel: '',
  menuLabel: '',
  appointmentLabel: '',
  serviceOnlyLabel: '',
  details: '',
  validDays: [0, 1, 2, 3, 4, 5, 6],
  startsOn: '',
  endsOn: '',
  eligibleServiceIds: [],
  eligibleServiceNames: [],
  showClientBadge: true,
  showWorkerBadge: true,
  warnWrongDay: true,
  usageLimit: '',
  perClientLimit: '',
  isSystemSeed: false,
};

function serviceIdOf(value) {
  return String(value?._id || value?.id || value || '');
}

function normalizeForm(deal) {
  if (!deal) {
    return {
      ...EMPTY_FORM,
      eligibleServiceIds: [],
      eligibleServiceNames: [],
      validDays: [...EMPTY_FORM.validDays],
    };
  }

  return {
    ...EMPTY_FORM,
    ...deal,
    id: deal._id || deal.id,
    discountValue: Number(deal.discountValue ?? deal.discountPercent ?? 0),
    validDays: Array.isArray(deal.validDays) && deal.validDays.length
      ? deal.validDays.map(Number)
      : [...EMPTY_FORM.validDays],
    eligibleServiceIds: Array.isArray(deal.eligibleServiceIds)
      ? deal.eligibleServiceIds.map(serviceIdOf).filter(Boolean)
      : [],
    eligibleServiceNames: Array.isArray(deal.eligibleServiceNames) ? deal.eligibleServiceNames : [],
    usageLimit: deal.usageLimit ?? '',
    perClientLimit: deal.perClientLimit ?? '',
    startsOn: deal.startsOn || '',
    endsOn: deal.endsOn || '',
    isSystemSeed: Boolean(deal.isSystemSeed || deal.systemKey),
  };
}

function dealStatusBadgeClass(status) {
  if (status === 'active') return 'bg-green-100 text-green-800 border-green-200';
  if (status === 'paused') return 'bg-yellow-100 text-yellow-800 border-yellow-200';
  if (status === 'archived') return 'bg-gray-100 text-gray-700 border-gray-200';
  if (status === 'scheduled') return 'bg-blue-100 text-blue-800 border-blue-200';
  return 'bg-red-100 text-red-800 border-red-200';
}

function activeBadgeClass(isActive) {
  return isActive
    ? 'bg-green-50 text-green-700 border-green-200'
    : 'bg-gray-50 text-gray-700 border-gray-200';
}

function discountText(deal) {
  const value = Number(deal.discountValue ?? deal.discountPercent ?? 0);
  if (!Number.isFinite(value) || value <= 0) return 'Special';
  return deal.discountType === 'fixed' ? `$${value} off` : `${value}% off`;
}

function dayText(validDays) {
  const labels = (validDays || [])
    .map((d) => DAY_OPTIONS.find((x) => x.value === Number(d))?.label)
    .filter(Boolean);
  if (labels.length === 0 || labels.length === 7) return labels.length === 7 ? 'Every day' : 'Any day';
  return labels.join(', ');
}

function statusMessage(status) {
  if (status === 'active') return 'Active';
  if (status === 'paused') return 'Not active / paused';
  if (status === 'scheduled') return 'Not active yet / scheduled';
  if (status === 'expired') return 'Not active / expired';
  if (status === 'archived') return 'Archived';
  return 'Not active';
}

export default function AdminDealsCoupons() {
  const [deals, setDeals] = useState([]);
  const [services, setServices] = useState([]);
  const [form, setForm] = useState(() => normalizeForm(null));
  const [editingId, setEditingId] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [includeArchived, setIncludeArchived] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const loadDeals = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await API.get('/admin/promotion-deals', {
        params: { includeArchived },
      });
      setDeals(Array.isArray(data.deals) ? data.deals : []);
    } catch (err) {
      console.error('Failed to load deals', err);
      setError(err?.response?.data?.error || 'Failed to load deals and coupons.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeals();
  }, [includeArchived]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    API.get('/admin/services')
      .then(({ data }) => setServices(Array.isArray(data) ? data : []))
      .catch((err) => console.warn('Failed to load services for deals page', err));
  }, []);

  const serviceGroups = useMemo(() => services.reduce((acc, service) => {
    const category = service.category || 'Other';
    if (!acc[category]) acc[category] = [];
    acc[category].push(service);
    return acc;
  }, {}), [services]);

  const serviceNameById = useMemo(() => services.reduce((acc, service) => {
    acc[String(service._id)] = service.name;
    return acc;
  }, {}), [services]);

  const updateForm = (patch) => {
    setForm((prev) => ({ ...prev, ...(typeof patch === 'function' ? patch(prev) : patch) }));
  };

  const openCreateForm = () => {
    setEditingId('');
    setForm(normalizeForm(null));
    setEditorOpen(true);
    setError('');
    setMessage('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const closeEditor = () => {
    setEditingId('');
    setForm(normalizeForm(null));
    setEditorOpen(false);
    setError('');
  };

  const editDeal = (deal) => {
    setEditingId(deal._id || deal.id);
    setForm(normalizeForm(deal));
    setEditorOpen(true);
    setError('');
    setMessage('Editing existing deal.');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleDay = (day) => {
    updateForm((prev) => {
      const current = Array.isArray(prev.validDays) ? prev.validDays.map(Number) : [];
      const next = current.includes(day)
        ? current.filter((d) => d !== day)
        : [...current, day].sort((a, b) => a - b);
      return { validDays: next };
    });
  };

  const toggleService = (serviceId) => {
    updateForm((prev) => {
      const id = String(serviceId);
      const current = Array.isArray(prev.eligibleServiceIds) ? prev.eligibleServiceIds.map(String) : [];
      const next = current.includes(id)
        ? current.filter((x) => x !== id)
        : [...current, id];
      return { eligibleServiceIds: next };
    });
  };

  const saveDeal = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setMessage('');

    const payload = {
      ...form,
      couponCode: form.type === 'coupon' ? String(form.couponCode || '').trim().toUpperCase() : '',
      eligibleServiceIds: Array.isArray(form.eligibleServiceIds) ? form.eligibleServiceIds : [],
      eligibleServiceNames: Array.isArray(form.eligibleServiceNames) ? form.eligibleServiceNames : [],
      usageLimit: form.usageLimit === '' ? null : Number(form.usageLimit),
      perClientLimit: form.perClientLimit === '' ? null : Number(form.perClientLimit),
    };

    try {
      const successText = editingId ? 'Deal updated.' : 'Deal created.';
      if (editingId) {
        await API.put(`/admin/promotion-deals/${editingId}`, payload);
      } else {
        await API.post('/admin/promotion-deals', payload);
      }
      setMessage(successText);
      setEditorOpen(false);
      setEditingId('');
      setForm(normalizeForm(null));
      await loadDeals();
    } catch (err) {
      console.error('Failed to save deal', err);
      setError(err?.response?.data?.error || 'Failed to save deal.');
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (deal, status) => {
    setError('');
    setMessage('');
    try {
      await API.patch(`/admin/promotion-deals/${deal._id || deal.id}/status`, { status });
      setMessage(`Deal ${status}.`);
      if (editingId === (deal._id || deal.id)) {
        updateForm({ status });
      }
      await loadDeals();
    } catch (err) {
      console.error('Failed to change deal status', err);
      setError(err?.response?.data?.error || 'Failed to change deal status.');
    }
  };

  const deleteDeal = async (deal) => {
    const fallbackText = deal.isSystemSeed
      ? 'This seeded default deal will be archived/disabled instead of permanently deleted. You can restore it by showing archived deals.'
      : 'Permanently delete this deal? Archive is safer if you may need history later.';
    const ok = window.confirm(fallbackText);
    if (!ok) return;

    setError('');
    setMessage('');
    try {
      await API.delete(`/admin/promotion-deals/${deal._id || deal.id}`);
      setMessage(deal.isSystemSeed ? 'Seeded default deal archived.' : 'Deal deleted.');
      if (editingId === (deal._id || deal.id)) closeEditor();
      await loadDeals();
    } catch (err) {
      console.error('Failed to delete deal', err);
      setError(err?.response?.data?.error || 'Failed to delete deal.');
    }
  };

  const selectedServiceIds = new Set((form.eligibleServiceIds || []).map(String));
  const fallbackNamesText = (form.eligibleServiceNames || []).join('\n');
  const selectedDealId = editingId;

  const serviceListText = (deal) => {
    const ids = Array.isArray(deal.eligibleServiceIds) ? deal.eligibleServiceIds.map(serviceIdOf).filter(Boolean) : [];
    const namesFromIds = ids.map((id) => serviceNameById[id]).filter(Boolean);
    const fallbackNames = Array.isArray(deal.eligibleServiceNames) ? deal.eligibleServiceNames.filter(Boolean) : [];
    if (namesFromIds.length) return namesFromIds.join(', ');
    if (fallbackNames.length) return fallbackNames.join(', ');
    return 'All services';
  };

  const DealCard = ({ deal }) => {
    const id = deal._id || deal.id;
    const isSelected = selectedDealId && selectedDealId === id;
    const isActive = deal.status === 'active';

    const stop = (fn) => (event) => {
      event.stopPropagation();
      fn();
    };

    return (
      <button
        type="button"
        onClick={() => editDeal(deal)}
        className={`w-full text-left p-4 grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 transition ${
          isSelected ? 'bg-blue-50' : 'bg-white hover:bg-gray-50'
        }`}
      >
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h4 className="font-semibold text-lg">{deal.title}</h4>
            <span className={`text-xs border px-2 py-0.5 rounded-full ${dealStatusBadgeClass(deal.status)}`}>{deal.status}</span>
            <span className={`text-xs border px-2 py-0.5 rounded-full ${activeBadgeClass(isActive)}`}>{statusMessage(deal.status)}</span>
            <span className="text-xs border px-2 py-0.5 rounded-full bg-white">{deal.type === 'coupon' ? `Coupon: ${deal.couponCode}` : 'Auto deal'}</span>
            <span className="text-xs border px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border-amber-200">{discountText(deal)}</span>
            {deal.isSystemSeed && (
              <span className="text-xs border px-2 py-0.5 rounded-full bg-purple-50 text-purple-800 border-purple-200">Seeded default</span>
            )}
          </div>
          <p className="text-sm text-gray-600 mt-1">{deal.details || deal.description || 'No details.'}</p>
          <div className="text-xs text-gray-500 mt-2 space-y-1">
            <div>Dates: {deal.startsOn || 'any'} → {deal.endsOn || 'any'}</div>
            <div>Days: {dayText(deal.validDays)}</div>
            <div>Services: {serviceListText(deal)}</div>
            {deal.type === 'coupon' && <div>Used: {deal.usageCount || 0}{deal.usageLimit ? ` / ${deal.usageLimit}` : ''}</div>}
          </div>
        </div>
        <div className="flex flex-wrap lg:flex-col gap-2 lg:min-w-[130px]">
          <span className="border rounded px-3 py-1.5 text-sm text-center bg-white">Open / edit</span>
          {deal.status === 'active' ? (
            <span role="button" tabIndex={0} onClick={stop(() => setStatus(deal, 'paused'))} className="border rounded px-3 py-1.5 text-sm text-center hover:bg-yellow-50">Pause</span>
          ) : deal.status !== 'archived' ? (
            <span role="button" tabIndex={0} onClick={stop(() => setStatus(deal, 'active'))} className="border rounded px-3 py-1.5 text-sm text-center hover:bg-green-50">Activate</span>
          ) : (
            <span role="button" tabIndex={0} onClick={stop(() => setStatus(deal, 'paused'))} className="border rounded px-3 py-1.5 text-sm text-center hover:bg-gray-50">Restore paused</span>
          )}
          {deal.status !== 'archived' && (
            <span role="button" tabIndex={0} onClick={stop(() => setStatus(deal, 'archived'))} className="border rounded px-3 py-1.5 text-sm text-center hover:bg-gray-50">Archive</span>
          )}
          <span role="button" tabIndex={0} onClick={stop(() => deleteDeal(deal))} className="border border-red-200 text-red-600 rounded px-3 py-1.5 text-sm text-center hover:bg-red-50">
            {deal.isSystemSeed ? 'Disable' : 'Delete'}
          </span>
        </div>
      </button>
    );
  };

  return (
    <div className="p-4 max-w-6xl mx-auto">
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">Deals & Coupons</h2>
          <p className="text-gray-600 mt-1">
            View every deal, open one to edit, or create a new automatic deal/coupon without rebuilding the app.
          </p>
        </div>
        <button type="button" onClick={openCreateForm} className="bg-blue-600 text-white px-4 py-2 rounded shadow-sm hover:bg-blue-700">
          + Create new deal
        </button>
      </div>

      {error && <div className="mb-4 border border-red-200 bg-red-50 text-red-700 px-4 py-3 rounded">{error}</div>}
      {message && <div className="mb-4 border border-green-200 bg-green-50 text-green-700 px-4 py-3 rounded">{message}</div>}

      {editorOpen && (
        <section className="border rounded bg-white shadow-sm overflow-hidden mb-6">
          <div className="bg-amber-50 px-4 py-3 border-b border-amber-100 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold text-lg">Deal editor</h3>
              <p className="text-sm text-amber-900 mt-1">
                {editingId
                  ? 'Editing the selected deal. Auto deals show as badges and apply when the selected service/date qualifies. Coupon deals require the customer to enter the code.'
                  : 'Create a new deal. Leave coupon code blank for an automatic deal, or choose Coupon code to require a customer-entered code.'}
              </p>
              {form.isSystemSeed && (
                <p className="text-xs text-purple-800 mt-2">
                  This is the seeded default Thursday deal. It is now a normal Deals & Coupons record and can be paused, edited, or archived.
                </p>
              )}
            </div>
            <button type="button" onClick={closeEditor} className="border rounded px-3 py-1.5 text-sm bg-white hover:bg-gray-50">Close editor</button>
          </div>

          <form onSubmit={saveDeal} className="p-4 space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="text-sm font-medium md:col-span-2">
                Title
                <input
                  className="mt-1 w-full border rounded p-2"
                  value={form.title}
                  onChange={(e) => updateForm({ title: e.target.value })}
                  placeholder="Thursday Special"
                />
              </label>
              <label className="text-sm font-medium">
                Status
                <select
                  className="mt-1 w-full border rounded p-2"
                  value={form.status}
                  onChange={(e) => updateForm({ status: e.target.value })}
                >
                  <option value="active">Active</option>
                  <option value="paused">Paused</option>
                  <option value="scheduled">Scheduled</option>
                  <option value="expired">Expired</option>
                  <option value="archived">Archived</option>
                </select>
              </label>
              <label className="text-sm font-medium">
                Deal type
                <select
                  className="mt-1 w-full border rounded p-2"
                  value={form.type}
                  disabled={form.isSystemSeed}
                  onChange={(e) => updateForm({ type: e.target.value })}
                >
                  <option value="auto">Auto-applied deal</option>
                  <option value="coupon">Coupon code</option>
                </select>
              </label>
              {form.type === 'coupon' && (
                <label className="text-sm font-medium">
                  Coupon code
                  <input
                    className="mt-1 w-full border rounded p-2 uppercase"
                    value={form.couponCode}
                    onChange={(e) => updateForm({ couponCode: e.target.value.toUpperCase() })}
                    placeholder="RAKIE20"
                  />
                </label>
              )}
              <label className="text-sm font-medium">
                Discount type
                <select
                  className="mt-1 w-full border rounded p-2"
                  value={form.discountType}
                  onChange={(e) => updateForm({ discountType: e.target.value })}
                >
                  <option value="percent">Percent off</option>
                  <option value="fixed">Dollar amount off</option>
                </select>
              </label>
              <label className="text-sm font-medium">
                Discount value
                <input
                  type="number"
                  min="0"
                  max={form.discountType === 'percent' ? 100 : undefined}
                  className="mt-1 w-full border rounded p-2"
                  value={form.discountValue}
                  onChange={(e) => updateForm({ discountValue: Number(e.target.value) })}
                />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
              <label className="text-sm font-medium">
                Small badge label
                <input className="mt-1 w-full border rounded p-2" value={form.shortLabel} onChange={(e) => updateForm({ shortLabel: e.target.value })} placeholder="20% Thu" />
              </label>
              <label className="text-sm font-medium">
                Menu label
                <input className="mt-1 w-full border rounded p-2" value={form.menuLabel} onChange={(e) => updateForm({ menuLabel: e.target.value })} placeholder="20% Special" />
              </label>
              <label className="text-sm font-medium">
                Appointment badge
                <input className="mt-1 w-full border rounded p-2" value={form.appointmentLabel} onChange={(e) => updateForm({ appointmentLabel: e.target.value })} placeholder="20% Deal" />
              </label>
              <label className="text-sm font-medium">
                Non-qualifying label
                <input className="mt-1 w-full border rounded p-2" value={form.serviceOnlyLabel} onChange={(e) => updateForm({ serviceOnlyLabel: e.target.value })} placeholder="Special service" />
              </label>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <label className="text-sm font-medium">
                Start date optional
                <input type="date" className="mt-1 w-full border rounded p-2" value={form.startsOn} onChange={(e) => updateForm({ startsOn: e.target.value })} />
              </label>
              <label className="text-sm font-medium">
                End date optional
                <input type="date" className="mt-1 w-full border rounded p-2" value={form.endsOn} onChange={(e) => updateForm({ endsOn: e.target.value })} />
              </label>
            </div>

            <div>
              <div className="text-sm font-medium mb-2">Valid days</div>
              <div className="flex flex-wrap gap-2">
                {DAY_OPTIONS.map((day) => (
                  <button
                    key={day.value}
                    type="button"
                    onClick={() => toggleDay(day.value)}
                    className={`px-3 py-1 rounded border text-sm ${
                      (form.validDays || []).map(Number).includes(day.value)
                        ? 'bg-amber-100 border-amber-400 text-amber-900'
                        : 'bg-white border-gray-300 text-gray-700'
                    }`}
                  >
                    {day.label}
                  </button>
                ))}
              </div>
            </div>

            <label className="block text-sm font-medium">
              Details shown to staff/customer
              <textarea rows={3} className="mt-1 w-full border rounded p-2" value={form.details} onChange={(e) => updateForm({ details: e.target.value, description: e.target.value })} />
            </label>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={form.showClientBadge !== false} onChange={(e) => updateForm({ showClientBadge: e.target.checked })} />
                Show client badge
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={form.showWorkerBadge !== false} onChange={(e) => updateForm({ showWorkerBadge: e.target.checked })} />
                Show worker badge
              </label>
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={form.warnWrongDay !== false} onChange={(e) => updateForm({ warnWrongDay: e.target.checked })} />
                Warn wrong day
              </label>
            </div>

            {form.type === 'coupon' && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border rounded bg-gray-50 p-3">
                <label className="text-sm font-medium">
                  Total usage limit optional
                  <input type="number" min="0" className="mt-1 w-full border rounded p-2" value={form.usageLimit} onChange={(e) => updateForm({ usageLimit: e.target.value })} placeholder="blank = unlimited" />
                </label>
                <label className="text-sm font-medium">
                  Per-client limit optional
                  <input type="number" min="0" className="mt-1 w-full border rounded p-2" value={form.perClientLimit} onChange={(e) => updateForm({ perClientLimit: e.target.value })} placeholder="blank = unlimited" />
                </label>
              </div>
            )}

            <div>
              <div className="flex items-center justify-between gap-3 mb-2">
                <div>
                  <div className="text-sm font-medium">Eligible services</div>
                  <p className="text-xs text-gray-500">Select real service records. If none are selected and no fallback names are entered, the deal applies to all services.</p>
                </div>
                <button type="button" className="text-xs border rounded px-2 py-1" onClick={() => updateForm({ eligibleServiceIds: [] })}>Clear selected</button>
              </div>

              <div className="border rounded max-h-72 overflow-auto divide-y">
                {Object.entries(serviceGroups).length === 0 ? (
                  <div className="p-3 text-sm text-gray-500">No services loaded.</div>
                ) : Object.entries(serviceGroups).map(([category, rows]) => (
                  <div key={category} className="p-3">
                    <div className="font-semibold text-sm mb-2">{category}</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {rows.map((service) => (
                        <label key={service._id} className="flex items-center gap-2 text-sm">
                          <input type="checkbox" checked={selectedServiceIds.has(String(service._id))} onChange={() => toggleService(service._id)} />
                          <span>{service.name}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <label className="block text-sm font-medium">
              Optional service-name fallback match, one per line
              <textarea
                rows={3}
                className="mt-1 w-full border rounded p-2 font-mono text-xs"
                value={fallbackNamesText}
                onChange={(e) => updateForm({ eligibleServiceNames: e.target.value.split('\n').map((x) => x.trim()).filter(Boolean) })}
              />
            </label>

            <div className="flex flex-wrap gap-3">
              <button type="submit" disabled={saving} className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-60">
                {saving ? 'Saving…' : editingId ? 'Save changes' : 'Save new deal'}
              </button>
              <button type="button" onClick={closeEditor} className="bg-gray-200 px-4 py-2 rounded">Cancel</button>
            </div>
          </form>
        </section>
      )}

      <section className="border rounded bg-white shadow-sm overflow-hidden">
        <div className="bg-gray-50 px-4 py-3 border-b flex flex-wrap gap-3 items-center justify-between">
          <div>
            <h3 className="font-semibold text-lg">Existing deals</h3>
            <p className="text-sm text-gray-600">Click a deal to open it for editing. Use the action buttons to activate, pause, archive, restore, or delete.</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={includeArchived} onChange={(e) => setIncludeArchived(e.target.checked)} />
              Include archived
            </label>
            <button type="button" onClick={openCreateForm} className="border rounded px-3 py-1.5 text-sm bg-white hover:bg-gray-50">
              + Create new
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-6 text-gray-600">Loading deals…</div>
        ) : deals.length === 0 ? (
          <div className="p-6 text-gray-600">
            No deals configured. Use <button type="button" onClick={openCreateForm} className="text-blue-700 underline">Create new</button> to add your first deal.
          </div>
        ) : (
          <div className="divide-y">
            {deals.map((deal) => <DealCard key={deal._id || deal.id} deal={deal} />)}
          </div>
        )}
      </section>
    </div>
  );
}
