import React, { useEffect, useMemo, useState } from 'react';
import API from '../../api';

const GROUP_ORDER = [
  'SMS Safety',
  'SMS Content',
  'Booking Controls',
  'Staff Access',
  'Promotions',
  'System Errors',
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
        <div className="border rounded bg-white p-6 text-gray-600">Loading runtime settings…</div>
      ) : (
        <div className="space-y-6">
          {grouped.map(([group, rows]) => (
            <section key={group} className="border rounded bg-white shadow-sm overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b">
                <h3 className="font-semibold text-lg">{group}</h3>
              </div>

              <div className="divide-y">
                {rows.map((setting) => (
                  <div key={setting.key} className="p-4 grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="font-semibold">{setting.label || setting.key}</h4>
                        {setting.isAdvanced && (
                          <span className="text-xs bg-yellow-100 text-yellow-800 px-2 py-0.5 rounded-full">
                            Advanced
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-gray-600 mt-1">{setting.description}</p>
                      <code className="text-xs text-gray-500 block mt-2">{setting.key}</code>
                    </div>

                    <div className="lg:text-right">
                      {renderControl(setting)}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
