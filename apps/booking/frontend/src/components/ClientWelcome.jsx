import React, { useState, useEffect, useRef } from 'react';
import API from '../api';
import { toast } from 'react-toastify';
import logo from '../assets/TheRSlogo.png';
import ClientIntakeForm from './ClientIntakeForm';
import { normalizePhone10, coercePhone10, isTenDigit } from '../utils/phone';

const SUPPORT_PHONE = '5854146041';

export default function ClientWelcome({ client, onClientLoaded }) {
  const [phone, setPhone] = useState('');
  const [exists, setExists] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [pin, setPin] = useState('');
  const [showIntake, setShowIntake] = useState(false);
  const [requiresUpgrade, setRequiresUpgrade] = useState(false);
  const [showDefaultPinHint, setShowDefaultPinHint] = useState(false);
  const [probing, setProbing] = useState(false);
  const [intakeConfig, setIntakeConfig] = useState({
    verify: false,
    otpPurpose: 'signup',
    otpMode: 'signup',
    setPin: false,
  });

  const inputRef = useRef(null);
  const probeIdRef = useRef(0);

  const isValidPin = (v) => /^\d{4}$/.test(v);

  const AWAKE_KEY = 'serverAwake';
  const AWAKE_TS_KEY = 'serverAwakeTs';
  const AWAKE_TTL_MS = 14 * 60 * 1000;

  const isAwakeFresh = () => {
    try {
      const flag = sessionStorage.getItem(AWAKE_KEY) === '1';
      const ts = Number(sessionStorage.getItem(AWAKE_TS_KEY) || 0);
      return flag && (Date.now() - ts) < AWAKE_TTL_MS;
    } catch {
      return false;
    }
  };

  const markAwake = (ok) => {
    try {
      if (ok) {
        sessionStorage.setItem(AWAKE_KEY, '1');
        sessionStorage.setItem(AWAKE_TS_KEY, String(Date.now()));
      } else {
        sessionStorage.removeItem(AWAKE_KEY);
        sessionStorage.removeItem(AWAKE_TS_KEY);
      }
    } catch {/* ignore */}
  };

  const wakeRender = async ({ tag = 'client-welcome' } = {}) => {
    const ts = Date.now();
    const tryOnce = async (label) => {
      const r = await API.get('/healthz', { params: { ts, t: label } });
      return r?.status === 200;
    };
    try {
      const ok = await tryOnce(tag);
      markAwake(ok);
      return ok;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
      try {
        const ok2 = await tryOnce(`${tag}:retry`);
        markAwake(ok2);
        return ok2;
      } catch {
        markAwake(false);
        return false;
      }
    }
  };

  const getClientByPhone = async (p) => {
    const { data } = await API.get('/clients', { params: { phone: p } });
    return data || null;
  };

  const openSignupFlow = () => {
    setIntakeConfig({ verify: true, otpPurpose: 'signup', otpMode: 'signup', setPin: false });
    setShowIntake(true);
  };

  const openResetFlow = () => {
    setIntakeConfig({ verify: true, otpPurpose: 'reset', otpMode: 'reset', setPin: true });
    setShowIntake(true);
  };

  const openUpgradeFlow = () => {
    setIntakeConfig({ verify: false, otpPurpose: 'reset', otpMode: 'profile', setPin: true });
    setShowIntake(true);
  };

  useEffect(() => {
    const svc = new URLSearchParams(window.location.search).get('service');
    if (svc) sessionStorage.setItem('desiredServiceId', svc);

    const lastPhone = localStorage.getItem('lastPhone');
    if (lastPhone) setPhone(normalizePhone10(lastPhone));
    inputRef.current?.focus?.();

    (async () => {
      if (isAwakeFresh()) return;
      await wakeRender({ tag: 'client-welcome:init' });
    })();
  }, []);

  useEffect(() => {
    if (client?.phone) setPhone(normalizePhone10(client.phone));
  }, [client]);

  useEffect(() => {
    if (!isTenDigit(phone)) {
      setExists(false);
      setProbing(false);
      setRequiresUpgrade(false);
      setShowDefaultPinHint(false);
      return;
    }

    let canceled = false;
    const myProbeId = ++probeIdRef.current;
    setProbing(true);

    (async () => {
      try {
        const clientObj = await getClientByPhone(phone);
        if (canceled || myProbeId !== probeIdRef.current) return;
        const doesExist = !!clientObj?._id;
        setExists(doesExist);
        setRequiresUpgrade(!!clientObj?.requiresNamePinUpgrade);
        setShowDefaultPinHint(!!clientObj?.pinIsDefault);
        setProbing(false);
      } catch {
        if (canceled || myProbeId !== probeIdRef.current) return;
        setProbing(false);
        setExists(false);
      }
    })();

    return () => { canceled = true; };
  }, [phone]);

  const proceed = async (clientData) => {
    try {
      const { data: appointments } = await API.get(`/appointments/client/${clientData._id}`);
      const desired = sessionStorage.getItem('desiredServiceId');
      const isActive = (a) => ['booked', 'pending'].includes(String(a?.status || '').toLowerCase());
      const active = (appointments || []).filter(isActive);

      if (active.length > 0) {
        window.location.href = '/booking/dashboard';
      } else {
        localStorage.setItem('client', JSON.stringify(clientData));
        window.location.href = desired
          ? `/booking/schedule?service=${encodeURIComponent(desired)}`
          : '/booking/schedule';
      }
    } catch {
      toast.error('Could not load appointments');
    }
  };

  const handleForgotPin = () => {
    if (!isTenDigit(phone)) {
      toast.error('Please enter a valid 10-digit phone number first.');
      return;
    }
    openResetFlow();
  };

  const handleSubmit = async () => {
    if (!isTenDigit(phone)) {
      toast.error('Please enter a valid 10-digit phone number.');
      return;
    }

    setIsLoading(true);
    toast.dismiss();

    let ok = false;
    const deadline = Date.now() + 60000;
    do {
      ok = await wakeRender({ tag: 'client-welcome:submit' });
      if (ok) break;
      await new Promise((r) => setTimeout(r, 800));
    } while (Date.now() < deadline);

    if (!ok) {
      setIsLoading(false);
      return;
    }

    try {
      const recheck = await getClientByPhone(phone);
      const doesExist = !!recheck?._id;

      if (!doesExist) {
        openSignupFlow();
        setIsLoading(false);
        return;
      }

      if (!pin) {
        toast.info('Enter your 4-digit PIN or tap Help to reset it by code.');
        setIsLoading(false);
        return;
      }

      if (!isValidPin(pin)) {
        toast.error('PIN must be 4 digits');
        setIsLoading(false);
        return;
      }

      const { data } = await API.post('/clients/login', { phone, pin });
      if (data?.mustChangePin) {
        openUpgradeFlow();
        setIsLoading(false);
        return;
      }

      localStorage.setItem('client', JSON.stringify(data));
      localStorage.setItem('lastPhone', phone);
      onClientLoaded?.(data);
      await proceed(data);
    } catch (err) {
      const status = err?.response?.status;
      const payload = err?.response?.data || {};

      if (status === 401) {
        toast.error('Invalid PIN. Please try again.');
      } else if (status === 409 && payload.requiresOtp) {
        toast.info('No PIN is on file yet. We will verify your phone by text and let you set one.');
        openResetFlow();
      } else if (status === 423 && payload.requiresOtp) {
        toast.info(payload.error || 'Too many PIN attempts. Reset your PIN by code.');
        openResetFlow();
      } else {
        console.error('Login error:', err);
        toast.error(payload.error || 'Failed to sign in. Try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleCancelFromIntake = () => {
    setShowIntake(false);
    setPin('');
    setTimeout(() => inputRef.current?.focus?.(), 0);
  };

  const isExisting = !!exists;

  return (
    <div className="min-h-screen flex flex-col justify-center items-center bg-gray-100 p-4">
      <a href="https://rakiesalon.com/booking/admin/login">
        <img src={logo} alt="Rakie Salon Logo" className="w-24 h-24 mb-4" />
      </a>

      <div className="bg-white shadow-md rounded p-6 w-full max-w-md">
        <h1 className="text-xl font-semibold mb-4 text-center">Welcome to Rakie Salon</h1>

        <label className="block mb-2 text-sm font-medium text-gray-700">Enter your phone number:</label>
        <div className="relative">
          <input
            ref={inputRef}
            type="tel"
            inputMode="numeric"
            pattern="\d*"
            value={phone}
            onChange={(e) => setPhone(coercePhone10(e.target.value))}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            placeholder="6781234567"
            className="w-full px-4 py-2 border rounded mb-4 pr-10 focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          {probing && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2" aria-label="checking number">
              <svg className="animate-spin h-5 w-5 opacity-70" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
              </svg>
            </div>
          )}
        </div>

        {isExisting && (
          <>
            <label className="block mb-2 text-sm font-medium text-gray-700">4-digit PIN</label>
            <input
              type="password"
              inputMode="numeric"
              pattern="\d{4}"
              maxLength={4}
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              placeholder="••••"
              className="w-full px-4 py-2 border rounded mb-4 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
          </>
        )}

        {isExisting && showDefaultPinHint && (
          <p className="-mt-2 mb-3 text-xs text-gray-600 text-left">
            If Rakie Salon created your account, your starter PIN may be the last 4 digits of your phone number.
          </p>
        )}

        <button
          onClick={handleSubmit}
          disabled={isLoading}
          className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded"
        >
          {isLoading ? (
            <div className="flex items-center justify-center gap-2">
              <svg className="animate-spin h-5 w-5 text-white" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 00-4 4H4z" />
              </svg>
              Checking...
            </div>
          ) : 'Continue'}
        </button>

        <div className="flex items-center justify-between mt-2 text-sm">
          <span className="text-gray-500">{!isExisting && isTenDigit(phone) ? 'New client? Continue to verify by text.' : ''}</span>
          {isExisting && (
            <button
              type="button"
              onClick={handleForgotPin}
              className="text-blue-600 hover:underline disabled:opacity-50"
              disabled={!isTenDigit(phone)}
              aria-label="Forgot PIN"
            >
              Help?
            </button>
          )}
        </div>
      </div>

      {showIntake && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto relative">
            <button
              onClick={() => setShowIntake(false)}
              className="absolute top-3 right-3 text-sm text-gray-500 hover:underline"
              aria-label="Close"
            >
              Close
            </button>

            <div className="p-4 pb-24">
              <ClientIntakeForm
                key={`${intakeConfig.verify}-${intakeConfig.otpMode}-${intakeConfig.setPin}-${phone}`}
                embed
                phone={phone}
                verify={intakeConfig.verify}
                otpPurpose={intakeConfig.otpPurpose}
                otpMode={intakeConfig.otpMode}
                setPin={intakeConfig.setPin}
                onComplete={async (clientData) => {
                  try {
                    localStorage.setItem('client', JSON.stringify(clientData));
                    localStorage.setItem('lastPhone', clientData.phone || phone || '');
                  } catch {/* ignore */}

                  if (intakeConfig.otpMode === 'reset' && clientData?.requiresNamePinUpgrade) {
                    setIntakeConfig({ verify: false, otpPurpose: 'reset', otpMode: 'profile', setPin: false });
                    return;
                  }

                  onClientLoaded?.(clientData);
                  setShowIntake(false);
                  await proceed(clientData);
                }}
                onCancel={handleCancelFromIntake}
              />
            </div>
          </div>
        </div>
      )}

      {requiresUpgrade && !showIntake && isExisting && (
        <p className="mt-3 text-xs text-gray-600 text-center max-w-md">
          After you sign in, we may ask you to confirm your profile information.
        </p>
      )}

      <div className="mt-3 text-xs text-gray-500 text-center max-w-md">
        If OTP delivery ever fails, text <strong>RAKIE PIN</strong> to <a className="underline" href={`sms:${SUPPORT_PHONE}?&body=RAKIE%20PIN`}>585-414-6041</a> for manual help.
      </div>
    </div>
  );
}
