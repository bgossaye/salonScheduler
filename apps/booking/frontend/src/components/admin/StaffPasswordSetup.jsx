import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import API from '../../api';
import { getStaffLandingPath } from '../../utils/permissions';

function passwordMessage(password) {
  if (!password || password.length < 8) return 'Password must be at least 8 characters.';
  return '';
}

export default function StaffPasswordSetup({ mode = 'reset' }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = useMemo(() => params.get('token') || '', [params]);
  const purpose = mode === 'invite' ? 'invite' : 'reset';
  const isInvite = purpose === 'invite';

  const [checking, setChecking] = useState(true);
  const [account, setAccount] = useState(null);
  const [error, setError] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let ignore = false;
    async function check() {
      setChecking(true);
      setError('');
      if (!token) {
        setError('Missing setup token. Ask an owner/admin to resend the link.');
        setChecking(false);
        return;
      }
      try {
        const { data } = await API.get('/admin/login/token-status', { params: { token, purpose } });
        if (!ignore) setAccount(data.account || null);
      } catch (err) {
        if (!ignore) setError(err?.response?.data?.error || 'This link is invalid or expired. Ask an owner/admin to send a new link.');
      } finally {
        if (!ignore) setChecking(false);
      }
    }
    check();
    return () => { ignore = true; };
  }, [token, purpose]);

  const submit = async () => {
    setError('');
    const weak = passwordMessage(password);
    if (weak) {
      setError(weak);
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSaving(true);
    try {
      const endpoint = isInvite ? '/admin/login/accept-invite' : '/admin/login/reset-password';
      const { data } = await API.post(endpoint, { token, password });
      localStorage.setItem('adminToken', data.token);
      if (data.admin) localStorage.setItem('adminUser', JSON.stringify(data.admin));
      navigate(getStaffLandingPath(), { replace: true });
    } catch (err) {
      setError(err?.response?.data?.error || 'Unable to save password. Ask an owner/admin to send a fresh link.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mx-auto max-w-md p-4">
      <h2 className="mb-1 text-2xl font-bold">{isInvite ? 'Create Staff Password' : 'Reset Staff Password'}</h2>
      <p className="mb-4 text-sm text-gray-600">
        {isInvite ? 'Create your Rakie Salon staff password.' : 'Choose a new Rakie Salon staff password.'}
      </p>

      {checking && <div className="rounded border bg-gray-50 p-3 text-sm">Checking link…</div>}
      {!checking && error && <div className="mb-3 rounded border border-red-300 bg-red-50 p-3 text-sm text-red-700">{error}</div>}

      {!checking && !error && account && (
        <div className="space-y-3 rounded border bg-white p-4 shadow-sm">
          <div className="rounded bg-blue-50 p-3 text-sm text-blue-900">
            <div><strong>Username:</strong> <span className="font-mono">{account.username || account.email}</span></div>
            {account.workerName && <div><strong>Worker:</strong> {account.workerName}</div>}
          </div>
          <input
            type="password"
            className="w-full rounded border p-2"
            placeholder="New password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <input
            type="password"
            className="w-full rounded border p-2"
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="w-full rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-60"
          >
            {saving ? 'Saving…' : (isInvite ? 'Create Password' : 'Reset Password')}
          </button>
        </div>
      )}

      <div className="mt-4 text-sm">
        <Link className="text-blue-600 underline" to="/admin/login">Back to Staff Login</Link>
      </div>
    </div>
  );
}
