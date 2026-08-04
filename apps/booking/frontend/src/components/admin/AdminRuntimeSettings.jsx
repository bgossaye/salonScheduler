import React, { useEffect, useMemo, useState } from 'react';
import API from '../../api';

const GROUP_META = {
  'SMS Safety': { icon: '🛡️', tone: 'red', description: 'Delivery safeguards, audit copies, and emergency SMS controls.' },
  'SMS Content': { icon: '💬', tone: 'violet', description: 'Message wording, templates, and client-facing SMS behavior.' },
  'Booking Controls': { icon: '📅', tone: 'blue', description: 'Rules that affect online booking and appointment flow.' },
  'Staff Access': { icon: '👥', tone: 'indigo', description: 'Staff access, credentials, and permission-related switches.' },
  Promotions: { icon: '🏷️', tone: 'amber', description: 'Promotion and offer behavior outside Deals & Coupons.' },
  'System Errors': { icon: '⚠️', tone: 'orange', description: 'Error logging, alerts, and operational safety controls.' },
  'Appointment History & Retention': { icon: '🗄️', tone: 'emerald', description: 'Archive and retention rules for old appointment records.' },
  General: { icon: '⚙️', tone: 'slate', description: 'Other safe runtime controls.' },
};

const GROUP_TONES = {
  red: { header: 'bg-red-50 border-red-200 text-red-900', badge: 'bg-red-100 text-red-700', border: 'border-l-red-400' },
  violet: { header: 'bg-violet-50 border-violet-200 text-violet-900', badge: 'bg-violet-100 text-violet-700', border: 'border-l-violet-400' },
  blue: { header: 'bg-blue-50 border-blue-200 text-blue-900', badge: 'bg-blue-100 text-blue-700', border: 'border-l-blue-400' },
  indigo: { header: 'bg-indigo-50 border-indigo-200 text-indigo-900', badge: 'bg-indigo-100 text-indigo-700', border: 'border-l-indigo-400' },
  amber: { header: 'bg-amber-50 border-amber-200 text-amber-900', badge: 'bg-amber-100 text-amber-700', border: 'border-l-amber-400' },
  orange: { header: 'bg-orange-50 border-orange-200 text-orange-900', badge: 'bg-orange-100 text-orange-700', border: 'border-l-orange-400' },
  emerald: { header: 'bg-emerald-50 border-emerald-200 text-emerald-900', badge: 'bg-emerald-100 text-emerald-700', border: 'border-l-emerald-400' },
  slate: { header: 'bg-slate-50 border-slate-200 text-slate-900', badge: 'bg-slate-100 text-slate-700', border: 'border-l-slate-400' },
};

const GROUP_ORDER = [
  'SMS Safety',
  'SMS Content',
  'Booking Controls',
  'Staff Access',
  'Promotions',
  'System Errors',
  'Appointment History & Retention',
  'General',
];

function settingValueToInput(setting) {
  if (setting.type === 'json') {
    try {
      return JSON.stringify(setting.value ?? {}, null, 2);
    } catch (_) {
      return String(setting.value ?? '');
    }
  }
  return setting.value ?? '';
}

function normalizeForSave(setting, value) {
  if (setting.type === 'boolean') return Boolean(value);
  if (setting.type === 'number') return Number(value);
  if (setting.type === 'json') {
    if (typeof value !== 'string') return value;
    try { return JSON.parse(value); } catch (_) { return value; }
  }
  return String(value ?? '');
}

export default function AdminRuntimeSettings() {
  const [settings, setSettings] = useState([]);
  const [draftValues, setDraftValues] = useState({});
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [retentionPreview, setRetentionPreview] = useState(null);
  const [retentionBusy, setRetentionBusy] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => new Set(['Booking Controls']));

  const toggleGroup = (group) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) next.delete(group); else next.add(group);
      return next;
    });
  };

  const fetchSettings = async () => {
    setLoading(true);
    setError('');
    try {
      const { data } = await API.get('/admin/runtime-settings');
      const rows = (data.settings || []).filter((setting) => setting.key !== 'promotions.activeDeal');
      setSettings(rows);
      setDraftValues(
        rows.reduce((acc, setting) => {
          acc[setting.key] = settingValueToInput(setting);
          return acc;
        }, {})
      );
    } catch (err) {
      console.error('❌ Failed to fetch runtime settings', err);
      setError('Failed to load runtime settings. Please make sure you are logged in as admin.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const grouped = useMemo(() => {
    const map = settings.reduce((acc, setting) => {
      const group = setting.group || 'General';
      if (!acc[group]) acc[group] = [];
      acc[group].push(setting);
      return acc;
    }, {});

    return Object.keys(map)
      .sort((a, b) => {
        const ai = GROUP_ORDER.indexOf(a);
        const bi = GROUP_ORDER.indexOf(b);
        if (ai !== -1 || bi !== -1) {
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        }
        return a.localeCompare(b);
      })
      .map((group) => [group, map[group]]);
  }, [settings]);

  const updateLocalSetting = (key, value) => {
    setSettings((prev) => prev.map((item) => (
      item.key === key ? { ...item, value } : item
    )));
  };

  const saveSetting = async (setting, nextValue) => {
    setSavingKey(setting.key);
    setError('');
    setSuccess('');
    try {
      const value = normalizeForSave(setting, nextValue);
      const { data } = await API.put(`/admin/runtime-settings/${encodeURIComponent(setting.key)}`, { value });
      const saved = data.setting || { ...setting, value };
      updateLocalSetting(setting.key, saved.value);
      setDraftValues((prev) => ({ ...prev, [setting.key]: settingValueToInput(saved) }));
      setSuccess(`${saved.label || saved.key} saved.`);
    } catch (err) {
      console.error('❌ Failed to save runtime setting', err);
      setError(err?.response?.data?.error || 'Failed to save runtime setting.');
    } finally {
      setSavingKey('');
    }
  };

  const previewRetention = async () => {
    setRetentionBusy(true); setError(''); setSuccess('');
    try {
      const { data } = await API.get('/admin/runtime-settings/appointment-retention/preview');
      setRetentionPreview(data);
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to preview appointment cleanup.');
    } finally { setRetentionBusy(false); }
  };

  const runRetention = async () => {
    if (!window.confirm('Archive all appointments currently eligible under these settings? Permanent deletion runs only when explicitly enabled.')) return;
    setRetentionBusy(true); setError(''); setSuccess('');
    try {
      const { data } = await API.post('/admin/runtime-settings/appointment-retention/run');
      setSuccess(`Cleanup finished: ${data.summary?.archivedTotal || 0} archived, ${data.summary?.deleted || 0} deleted.`);
      await previewRetention();
    } catch (err) {
      setError(err?.response?.data?.error || 'Failed to run appointment cleanup.');
    } finally { setRetentionBusy(false); }
  };

  const renderControl = (setting) => {
    const saving = savingKey === setting.key;

    if (setting.type === 'boolean') {
      return (
        <label className="inline-flex items-center gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={Boolean(setting.value)}
            disabled={saving}
            onChange={(e) => saveSetting(setting, e.target.checked)}
          />
          <span className="text-sm font-medium">{setting.value ? 'Enabled' : 'Disabled'}</span>
        </label>
      );
    }

    if (setting.type === 'number') {
      return (
        <div className="flex items-center gap-2 justify-end">
          <input
            type="number"
            className="border rounded p-2 w-40"
            value={draftValues[setting.key] ?? ''}
            onChange={(e) => setDraftValues((prev) => ({ ...prev, [setting.key]: e.target.value }))}
          />
          <button
            type="button"
            className="bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-60"
            disabled={saving}
            onClick={() => saveSetting(setting, draftValues[setting.key])}
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      );
    }

    if (setting.type === 'json') {
      return (
        <div className="space-y-2">
          <textarea
            rows={6}
            className="border rounded p-2 w-full font-mono text-xs"
            value={draftValues[setting.key] ?? ''}
            onChange={(e) => setDraftValues((prev) => ({ ...prev, [setting.key]: e.target.value }))}
          />
          <button
            type="button"
            className="bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-60"
            disabled={saving}
            onClick={() => saveSetting(setting, draftValues[setting.key])}
          >
            {saving ? 'Saving…' : 'Save JSON'}
          </button>
        </div>
      );
    }

    return (
      <div className="flex items-center gap-2 justify-end">
        <input
          className="border rounded p-2 w-full"
          value={draftValues[setting.key] ?? ''}
          onChange={(e) => setDraftValues((prev) => ({ ...prev, [setting.key]: e.target.value }))}
        />
        <button
          type="button"
          className="bg-blue-600 text-white px-3 py-2 rounded disabled:opacity-60"
          disabled={saving}
          onClick={() => saveSetting(setting, draftValues[setting.key])}
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    );
  };

  return (
    <div className="p-4 max-w-5xl mx-auto">
      <div className="mb-6">
        <h2 className="text-2xl font-bold">Runtime Settings</h2>
        <p className="text-gray-600 mt-1">
          Change safe system switches without rebuilding or redeploying the app. Deal records are managed in Deals & Coupons.
        </p>
      </div>

      {error && (
        <div className="mb-4 border border-red-200 bg-red-50 text-red-700 px-4 py-3 rounded">
          {error}
        </div>
      )}

      {success && (
        <div className="mb-4 border border-green-200 bg-green-50 text-green-700 px-4 py-3 rounded">
          {success}
        </div>
      )}

      {loading ? (
        <div className="border rounded-xl bg-white p-6 text-gray-600">Loading runtime settings…</div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">Groups</div>
              <div className="text-xl font-semibold mt-1">{grouped.length}</div>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">Settings</div>
              <div className="text-xl font-semibold mt-1">{settings.length}</div>
            </div>
            <div className="rounded-xl border bg-white p-3">
              <div className="text-xs uppercase tracking-wide text-gray-500">Advanced</div>
              <div className="text-xl font-semibold mt-1">{settings.filter((item) => item.isAdvanced).length}</div>
            </div>
            <div className="rounded-xl border bg-emerald-50 border-emerald-200 p-3">
              <div className="text-xs uppercase tracking-wide text-emerald-700">Mode</div>
              <div className="text-sm font-semibold mt-1 text-emerald-900">Changes save immediately</div>
            </div>
          </div>

          <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            Open only the section you need. Advanced settings are labeled, and technical keys are tucked away under “Details.”
          </div>

          {grouped.map(([group, rows]) => {
            const meta = GROUP_META[group] || GROUP_META.General;
            const tone = GROUP_TONES[meta.tone] || GROUP_TONES.slate;
            const isOpen = openGroups.has(group);
            const enabledCount = rows.filter((item) => item.type === 'boolean' && Boolean(item.value)).length;

            return (
              <section key={group} className={`border rounded-xl bg-white overflow-hidden border-l-4 ${tone.border}`}>
                <button
                  type="button"
                  onClick={() => toggleGroup(group)}
                  className={`w-full px-4 py-4 border-b text-left flex items-center justify-between gap-4 ${tone.header}`}
                  aria-expanded={isOpen}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <span className="text-xl" aria-hidden="true">{meta.icon}</span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-semibold text-base md:text-lg">{group}</h3>
                        <span className={`text-xs px-2 py-0.5 rounded-full ${tone.badge}`}>{rows.length} settings</span>
                        {enabledCount > 0 && (
                          <span className="text-xs px-2 py-0.5 rounded-full bg-white/70 text-gray-700">{enabledCount} enabled</span>
                        )}
                      </div>
                      <p className="text-sm mt-1 opacity-80">{meta.description}</p>
                    </div>
                  </div>
                  <span className="text-xl shrink-0" aria-hidden="true">{isOpen ? '−' : '+'}</span>
                </button>

                {isOpen && (
                  <>
                    <div className="divide-y">
                      {rows.map((setting) => (
                        <div key={setting.key} className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 hover:bg-gray-50/70">
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h4 className="font-semibold">{setting.label || setting.key}</h4>
                              {setting.isAdvanced && (
                                <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">Advanced</span>
                              )}
                            </div>
                            <p className="text-sm text-gray-600 mt-1 max-w-2xl">{setting.description}</p>
                            <details className="mt-2">
                              <summary className="cursor-pointer text-xs text-gray-500 select-none">Details</summary>
                              <code className="text-xs text-gray-500 block mt-1 break-all">{setting.key}</code>
                            </details>
                          </div>

                          <div className="lg:text-right lg:self-center">
                            {renderControl(setting)}
                          </div>
                        </div>
                      ))}
                    </div>

                    {group === 'Appointment History & Retention' && (
                      <div className="border-t border-emerald-200 bg-emerald-50 p-4">
                        <div className="flex flex-wrap gap-2">
                          <button type="button" onClick={previewRetention} disabled={retentionBusy} className="rounded bg-slate-700 px-4 py-2 text-white disabled:opacity-60">Preview cleanup</button>
                          <button type="button" onClick={runRetention} disabled={retentionBusy} className="rounded bg-emerald-600 px-4 py-2 text-white disabled:opacity-60">Run archive now</button>
                        </div>
                        {retentionPreview && (
                          <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2 text-sm">
                            <div className="rounded-lg border border-emerald-200 bg-white p-3">
                              <div className="text-xs text-gray-500">Eligible to archive</div>
                              <strong className="text-lg">{retentionPreview.archiveTotal || 0}</strong>
                            </div>
                            <div className="rounded-lg border border-emerald-200 bg-white p-3">
                              <div className="text-xs text-gray-500">Completed / canceled / no-show</div>
                              <strong>{retentionPreview.archiveEligible?.completed || 0} / {retentionPreview.archiveEligible?.canceled || 0} / {retentionPreview.archiveEligible?.noshow || 0}</strong>
                            </div>
                            <div className="rounded-lg border border-emerald-200 bg-white p-3">
                              <div className="text-xs text-gray-500">Eligible to delete</div>
                              <strong className="text-lg">{retentionPreview.deleteEligible || 0}</strong>
                            </div>
                          </div>
                        )}
                        <p className="mt-3 text-xs text-emerald-800">Records under retention hold are skipped. Permanent deletion remains off unless explicitly enabled.</p>
                      </div>
                    )}
                  </>
                )}
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
