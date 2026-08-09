import React, { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import API from '../api';

const emptyOtp = { open: false, code: '', sending: false, verifying: false, maskedPhone: '' };

export default function FamilyInvitation() {
  const { token } = useParams();

  useEffect(() => {
    const head = document.head;
    const previousReferrer = head.querySelector('meta[name="referrer"]');
    const previousRobots = head.querySelector('meta[name="robots"]');
    const referrer = previousReferrer || document.createElement('meta');
    const robots = previousRobots || document.createElement('meta');
    if (!previousReferrer) { referrer.setAttribute('name', 'referrer'); head.appendChild(referrer); }
    if (!previousRobots) { robots.setAttribute('name', 'robots'); head.appendChild(robots); }
    const oldReferrerContent = referrer.getAttribute('content');
    const oldRobotsContent = robots.getAttribute('content');
    referrer.setAttribute('content', 'no-referrer');
    robots.setAttribute('content', 'noindex,nofollow,noarchive');
    return () => {
      if (previousReferrer) oldReferrerContent == null ? referrer.removeAttribute('content') : referrer.setAttribute('content', oldReferrerContent); else referrer.remove();
      if (previousRobots) oldRobotsContent == null ? robots.removeAttribute('content') : robots.setAttribute('content', oldRobotsContent); else robots.remove();
    };
  }, []);
  const [loading, setLoading] = useState(true);
  const [invitation, setInvitation] = useState(null);
  const [error, setError] = useState('');
  const [working, setWorking] = useState('');
  const [result, setResult] = useState(null);
  const [otp, setOtp] = useState(emptyOtp);

  useEffect(() => {
    let alive = true;
    async function load() {
      try {
        setLoading(true);
        const { data } = await API.get(`/clients/family-invitations/${encodeURIComponent(token || '')}`);
        if (alive) setInvitation(data);
      } catch (err) {
        if (alive) setError(err?.response?.data?.error || 'This invitation could not be loaded.');
      } finally {
        if (alive) setLoading(false);
      }
    }
    load();
    return () => { alive = false; };
  }, [token]);

  async function finish(action, code = '') {
    try {
      setWorking(action);
      setError('');
      const { data } = await API.post(
        `/clients/family-invitations/${encodeURIComponent(token || '')}/respond`,
        { action, ...(code ? { otp: code } : {}) }
      );
      setOtp(emptyOtp);
      setResult({ action, message: data?.message || 'Your response has been recorded.' });
    } catch (err) {
      const status = err?.response?.status;
      const data = err?.response?.data || {};
      if (action === 'accept' && status === 428 && data?.code === 'FAMILY_ACCEPT_OTP_REQUIRED') {
        await requestOtp();
        return;
      }
      setError(data?.error || 'Could not process the invitation. Please try again.');
    } finally {
      setWorking('');
    }
  }

  async function requestOtp() {
    try {
      setOtp((v) => ({ ...v, open: true, sending: true }));
      setError('');
      const { data } = await API.post(`/clients/family-invitations/${encodeURIComponent(token || '')}/request-accept-otp`);
      if (data?.required === false) {
        setOtp(emptyOtp);
        await finish('accept');
        return;
      }
      setOtp({ open: true, code: '', sending: false, verifying: false, maskedPhone: data?.maskedPhone || '' });
    } catch (err) {
      setOtp(emptyOtp);
      setError(err?.response?.data?.error || 'Could not send the confirmation code.');
    }
  }

  async function accept() {
    if (invitation?.otpRequired) {
      await requestOtp();
    } else {
      await finish('accept');
    }
  }

  async function verifyOtp() {
    if (!/^\d{6}$/.test(otp.code)) {
      setError('Enter the 6-digit code sent to your phone.');
      return;
    }
    setOtp((v) => ({ ...v, verifying: true }));
    await finish('accept', otp.code);
    setOtp((v) => ({ ...v, verifying: false }));
  }

  const inviter = invitation?.inviterFirstName || 'A Rakie Salon client';

  return (
    <main className="min-h-screen bg-gray-100 px-4 py-10 flex items-center justify-center">
      <section className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl" aria-live="polite">
        <div className="text-center">
          <div className="text-2xl font-extrabold text-gray-900">Rakie Salon</div>
          <div className="mt-1 text-sm font-semibold uppercase tracking-wide text-gray-500">Family Invitation</div>
        </div>

        {loading && <p className="mt-8 text-center text-gray-600">Loading invitation…</p>}

        {!loading && error && !invitation && !result && (
          <div className="mt-7 rounded-xl border border-red-200 bg-red-50 p-4 text-center text-sm text-red-800">{error}</div>
        )}

        {!loading && result && (
          <div className="mt-8 text-center">
            <div className={`mx-auto flex h-14 w-14 items-center justify-center rounded-full text-2xl ${result.action === 'accept' ? 'bg-green-100 text-green-700' : result.action === 'report' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'}`}>
              {result.action === 'accept' ? '✓' : '✓'}
            </div>
            <h1 className="mt-4 text-xl font-bold text-gray-900">
              {result.action === 'accept' ? 'Invitation accepted' : result.action === 'report' ? 'Invitation reported' : 'Invitation declined'}
            </h1>
            <p className="mt-2 text-sm text-gray-600">{result.message}</p>
            {result.action === 'accept' && <p className="mt-2 text-sm text-gray-600">{inviter} can now book Rakie Salon appointments for you.</p>}
            {result.action !== 'accept' && <p className="mt-2 text-sm text-gray-600">No family booking access was granted.</p>}
            {result.action === 'decline' && <p className="mt-2 text-xs text-gray-500">A new invitation may be sent after {invitation?.declineCooldownHours || 24} hours, or salon staff can allow one sooner.</p>}
            <p className="mt-6 text-xs text-gray-500">You may close this page.</p>
          </div>
        )}

        {!loading && invitation && !result && (
          <>
            <div className="mt-7 text-center">
              <h1 className="text-xl font-bold text-gray-900">{inviter} invited you to join their family.</h1>
              <p className="mt-3 text-sm leading-6 text-gray-600">
                If you accept, {inviter} will be able to book Rakie Salon appointments for you. Your private profile information and past appointment history are not shared.
              </p>
            </div>

            {error && <div className="mt-4 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</div>}

            {!otp.open ? (
              <div className="mt-7 grid gap-3">
                <button type="button" disabled={!!working} onClick={accept} className="w-full rounded-xl bg-green-600 px-4 py-3 font-bold text-white disabled:opacity-50">
                  {working === 'accept' ? 'Accepting…' : 'Accept'}
                </button>
                <button type="button" disabled={!!working} onClick={() => finish('decline')} className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 font-bold text-gray-800 disabled:opacity-50">
                  {working === 'decline' ? 'Declining…' : 'Decline'}
                </button>
                <button type="button" disabled={!!working} onClick={() => finish('report')} className="mt-1 text-sm font-semibold text-red-700 underline disabled:opacity-50">
                  {working === 'report' ? 'Reporting…' : 'Report this invitation'}
                </button>
              </div>
            ) : (
              <div className="mt-7 rounded-xl border bg-gray-50 p-4">
                <h2 className="text-center font-bold text-gray-900">Confirm acceptance</h2>
                {otp.sending ? (
                  <p className="mt-3 text-center text-sm text-gray-600">Sending a one-time code…</p>
                ) : (
                  <>
                    <p className="mt-2 text-center text-sm text-gray-600">Enter the 6-digit code sent to {otp.maskedPhone || 'your phone'}.</p>
                    <input
                      autoFocus
                      inputMode="numeric"
                      maxLength={6}
                      value={otp.code}
                      onChange={(e) => setOtp((v) => ({ ...v, code: String(e.target.value || '').replace(/\D/g, '').slice(0, 6) }))}
                      className="mt-4 w-full rounded-lg border p-3 text-center text-xl tracking-[0.35em]"
                      placeholder="000000"
                    />
                    <button type="button" disabled={otp.verifying} onClick={verifyOtp} className="mt-3 w-full rounded-lg bg-green-600 px-4 py-3 font-bold text-white disabled:opacity-50">
                      {otp.verifying ? 'Verifying…' : 'Verify and accept'}
                    </button>
                    <div className="mt-3 flex justify-between text-xs">
                      <button type="button" onClick={requestOtp} className="font-semibold text-blue-700 underline">Resend code</button>
                      <button type="button" onClick={() => setOtp(emptyOtp)} className="font-semibold text-gray-700 underline">Back</button>
                    </div>
                  </>
                )}
              </div>
            )}

            <p className="mt-7 text-center text-xs leading-5 text-gray-500">Didn&apos;t expect this invitation? Choose Report this invitation and the request will be blocked.</p>
          </>
        )}
      </section>
    </main>
  );
}
