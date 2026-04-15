import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import API from '../api';
import logo from '../assets/TheRSlogo.png';
import { normalizeDateForInput } from '../utils/formatHelper';
import { normalizePhone10, isTenDigit, maskPhone as maskPhoneUi, prettyPhone } from '../utils/phone';

export default function ClientIntakeForm({
  embed = false,
  phone: propPhone = '',
  verify = false,
  setPin: propSetPin = false,
  otpPurpose: propOtpPurpose = 'signup',
  otpMode: propOtpMode = 'signup',
  onComplete,
  onCancel,
}) {
  const SCHEDULE_PATH = '/booking/schedule';
  const DASHBOARD_PATH = '/booking/dashboard';
  const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');

  const verifyMode = embed ? !!verify : params.get('verify') === '1';
  const setPinMode = embed ? !!propSetPin : params.get('setPin') === '1';
  const otpPurpose = embed ? propOtpPurpose : (params.get('otpPurpose') || 'signup');
  const otpMode = embed ? propOtpMode : (params.get('otpMode') || (verifyMode ? 'signup' : 'signup'));
  const qpPhone = propPhone || params.get('phone') || '';

  const PIN_HELP_PHONE = '5854146041';
  const PIN_HELP_DISPLAY = '(585) 414-6041';
  const PIN_HELP_KEYWORD = 'RAKIE PIN';

  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [pinConfirm, setPinConfirm] = useState('');
  const [otpCooldown, setOtpCooldown] = useState(0);
  const [otpVerified, setOtpVerified] = useState(false);
  const [otpSending, setOtpSending] = useState(false);
  const [otpSupport, setOtpSupport] = useState(null);
  const [otpMaskedPhone, setOtpMaskedPhone] = useState('');
  const [otpRequestedFor, setOtpRequestedFor] = useState('');

  const qsStep = (params.get('step') || '').toLowerCase();
  const initialStep = (qsStep === 'fillform' || qpPhone) ? 'fillForm' : 'enterPhone';
  const [step, setStep] = useState(verifyMode ? 'verifyPin' : (qpPhone || embed ? 'fillForm' : initialStep));
  const [phone, setPhone] = useState(normalizePhone10(qpPhone));
  const [client, setClient] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [errors, setErrors] = useState({});
  const [showNoChangeModal, setShowNoChangeModal] = useState(false);
  const [isNewClient, setIsNewClient] = useState(false);
  const [welcomeSince, setWelcomeSince] = useState(0);

  const maskPhone = maskPhoneUi;
  const [form, setForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    dob: '',
    visitFrequency: '',
    servicePreferences: {
      stylist: '',
      services: [],
      preferredTimes: [],
      productPreferences: [],
    },
    phone: qpPhone || '',
    confirmPhone: '',
    acceptedTerms: false,
    contactPreferences: { optInPromotions: true },
  });

  useEffect(() => {
    if (!verifyMode) return;

    if (otpMode === 'reset') {
      if (step !== 'verifyPin') setStep('verifyPin');
      return;
    }

    if (!otpVerified && step !== 'verifyPin') {
      setStep('verifyPin');
    }
  }, [verifyMode, otpMode, otpVerified, step]);

  useEffect(() => {
    if ((verifyMode || embed) && qpPhone) {
      const normalized = normalizePhone10(qpPhone);
      setPhone(normalized);
      setForm((prev) => ({ ...prev, phone: normalized }));
    }
  }, [verifyMode, embed, qpPhone]);

  const forceSetPin = !!setPinMode;
  const mustResetPin = !!forceSetPin;

  function sanitizeClient(d = {}) {
    return {
      phone: d.phone ?? '',
      firstName: d.firstName ?? '',
      lastName: d.lastName ?? '',
      email: d.email ?? '',
      dob: d.dob ? normalizeDateForInput(d.dob) ?? '' : '',
      visitFrequency: d.visitFrequency ?? '',
      servicePreferences: {
        stylist: d.servicePreferences?.stylist ?? '',
        services: Array.isArray(d.servicePreferences?.services) ? d.servicePreferences.services : [],
        preferredTimes: Array.isArray(d.servicePreferences?.preferredTimes) ? d.servicePreferences.preferredTimes : [],
        productPreferences: Array.isArray(d.servicePreferences?.productPreferences) ? d.servicePreferences.productPreferences : [],
      },
      acceptedTerms: !!d.acceptedTerms,
      contactPreferences: d.contactPreferences ?? { optInPromotions: true },
    };
  }

  const phoneLast4 = useMemo(() => String(form.phone || phone || '').replace(/\D/g, '').slice(-4), [form.phone, phone]);
  const pinOk = /^\d{4}$/.test(pin) && pin === pinConfirm;

  const canSubmit = client
    ? (forceSetPin ? pinOk : (isDirty || (pin || pinConfirm ? pinOk : false)))
    : (
        isTenDigit(form.phone) &&
        !!form.firstName &&
        !!form.lastName &&
        pinOk &&
        !!form.acceptedTerms
      );

  const startCooldown = () => {
    setOtpCooldown(30);
    const timer = setInterval(() => {
      setOtpCooldown((s) => {
        if (s <= 1) {
          clearInterval(timer);
          return 0;
        }
        return s - 1;
      });
    }, 1000);
  };

  const requestOtp = async ({ manual = false } = {}) => {
    if (!isTenDigit(phone)) {
      setErrors((prev) => ({ ...prev, otp: 'Phone must be exactly 10 digits.' }));
      return;
    }
    setOtpSending(true);
    setOtpSupport(null);
    setErrors((prev) => ({ ...prev, otp: '' }));

    try {
      const { data } = await API.post('/clients/pin/request-otp', { phone, purpose: otpPurpose });
      setOtpRequestedFor(phone);
      setOtpMaskedPhone(data?.maskedPhone || maskPhone(phone));
      if (!manual) {
        toast.success(`We sent a 6-digit code to ${data?.maskedPhone || maskPhone(phone)}.`);
      } else {
        toast.success('A new verification code was sent.');
      }
      startCooldown();
    } catch (err) {
      const payload = err?.response?.data || {};
      if (payload?.mode === 'manual_support') setOtpSupport(payload);
      setErrors((prev) => ({ ...prev, otp: payload.error || 'We could not send the verification code.' }));
    } finally {
      setOtpSending(false);
    }
  };

  useEffect(() => {
    if (step !== 'verifyPin' || !isTenDigit(phone)) return;
    if (otpRequestedFor === phone) return;
    requestOtp({ manual: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, phone, otpPurpose]);

  useEffect(() => {
    if (step !== 'fillForm' || !phone) return;
    (async () => {
      try {
        const { data } = await API.get(`/clients?phone=${phone}`);
        if (data) {
          setClient(data);
          setForm((prev) => {
            const base = { ...prev, ...sanitizeClient(data) };
            return data.requiresNamePinUpgrade ? { ...base, firstName: '', lastName: '' } : base;
          });
        }
      } catch {/* silent */}
    })();
  }, [step, phone]);

  const handlePhoneSubmit = async () => {
    if (!isTenDigit(phone)) {
      setErrors({ phone: 'Phone must be exactly 10 digits' });
      return;
    }
    try {
      const { data } = await API.get(`/clients?phone=${phone}`);
      setIsNewClient(!data);
      if (data) {
        setClient(data);
        setForm((prev) => {
          const base = { ...prev, ...sanitizeClient(data) };
          return data.requiresNamePinUpgrade ? { ...base, firstName: '', lastName: '' } : base;
        });
      } else {
        setForm((prev) => ({ ...prev, phone }));
      }
      setErrors({});
      setStep('fillForm');
    } catch {
      setIsNewClient(true);
      setForm((prev) => ({ ...prev, phone }));
      setErrors({});
      setStep('fillForm');
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    if (client) setIsDirty(true);

    if (name.startsWith('servicePreferences.')) {
      const key = name.split('.')[1];
      setForm((prev) => ({
        ...prev,
        servicePreferences: {
          ...prev.servicePreferences,
          [key]: value,
        },
      }));
    } else {
      setForm((prev) => ({ ...prev, [name]: value }));
    }
    setErrors((prev) => ({ ...prev, [name]: '' }));
    setIsDirty(true);
  };

  const handleVerifyAndSetPin = async () => {
    if (!/^\d{6}$/.test(otp)) {
      setErrors((prev) => ({ ...prev, otp: 'Code must be 6 digits.' }));
      return;
    }

    if (otpMode === 'reset') {
      const nextErrors = {};
      if (!/^\d{4}$/.test(pin)) nextErrors.pin = 'PIN must be exactly 4 digits';
      if (pin !== pinConfirm) nextErrors.pinConfirm = 'PINs do not match';
      if (pin && pin === phoneLast4) nextErrors.pin = 'PIN cannot be your phone number’s last 4 digits. Choose a different PIN.';
      if (Object.keys(nextErrors).length) {
        setErrors((prev) => ({ ...prev, ...nextErrors }));
        return;
      }

      try {
        const { data } = await API.post('/clients/pin/set', {
          phone,
          otp,
          pin,
          pinConfirm,
          purpose: otpPurpose,
        });
        toast.success('Your PIN has been set.');
        if (embed && typeof onComplete === 'function') {
          onComplete(data);
          return;
        }
        try {
          localStorage.setItem('client', JSON.stringify(data));
          localStorage.setItem('lastPhone', data.phone || phone || '');
        } catch {/* ignore */}
        window.location.assign('/booking');
      } catch (err) {
        const payload = err?.response?.data || {};
        if (payload?.mode === 'manual_support') setOtpSupport(payload);
        setErrors((prev) => ({
          ...prev,
          otp: payload.error || 'We could not verify that code.',
        }));
      }
      return;
    }

    try {
      await API.post('/clients/pin/verify-otp', { phone, otp, purpose: otpPurpose });
      setOtpVerified(true);
      setForm((prev) => ({ ...prev, phone }));
      setErrors((prev) => ({ ...prev, otp: '' }));
      toast.success('Phone verified. Continue with your profile.');
      setStep('fillForm');
    } catch (err) {
      const payload = err?.response?.data || {};
      if (payload?.mode === 'manual_support') setOtpSupport(payload);
      setErrors((prev) => ({ ...prev, otp: payload.error || 'We could not verify that code.' }));
    }
  };

  const handleSubmit = async () => {
    const newErrors = {};
    const last4 = String(form.phone).replace(/\D/g, '').slice(-4);

    if (pin === last4) {
      newErrors.pin = 'PIN cannot be your phone number’s last 4 digits. Choose a different PIN.';
    }
    if (!form.phone) newErrors.phone = 'Phone is required';
    else if (!isTenDigit(form.phone)) newErrors.phone = 'Phone must be 10 digits';
    if (!form.firstName) newErrors.firstName = 'First name is required';
    if (!form.lastName) newErrors.lastName = 'Last name is required';

    const needPin = !client || forceSetPin;
    if (needPin) {
      if (!/^\d{4}$/.test(pin)) newErrors.pin = 'PIN must be exactly 4 digits';
      if (pin !== pinConfirm) newErrors.pinConfirm = 'PINs do not match';
    } else if (pin || pinConfirm) {
      if (!/^\d{4}$/.test(pin)) newErrors.pin = 'PIN must be exactly 4 digits';
      if (pin !== pinConfirm) newErrors.pinConfirm = 'PINs do not match';
    }

    if (!form.acceptedTerms) {
      newErrors.acceptedTerms = 'You must accept the Terms of Service and Privacy Policy.';
    }

    if (!client && verifyMode && otpPurpose === 'signup' && !otpVerified) {
      newErrors.otp = 'Please verify your phone by code before creating your profile.';
      setStep('verifyPin');
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    if (client && !isDirty && !client?.requiresNamePinUpgrade) {
      setShowNoChangeModal(true);
      return;
    }

    const { firstName, lastName, email, dob, visitFrequency, servicePreferences, phone: formPhone } = form;
    const isExistingClient = !!client;
    const shouldUpgrade = isExistingClient && client?.requiresNamePinUpgrade === true;

    const submissionData = {
      firstName,
      lastName,
      phone: formPhone,
      ...(email && { email }),
      ...(dob && { dob }),
      ...(visitFrequency && { visitFrequency }),
      ...(servicePreferences && {
        servicePreferences: {
          stylist: servicePreferences.stylist || '',
          services: Array.isArray(servicePreferences.services) ? servicePreferences.services : [],
          preferredTimes: Array.isArray(servicePreferences.preferredTimes) ? servicePreferences.preferredTimes : [],
          productPreferences: Array.isArray(servicePreferences.productPreferences) ? servicePreferences.productPreferences : [],
        },
      }),
      contactPreferences: {
        method: 'sms',
        optInPromotions: form.contactPreferences?.optInPromotions === true,
      },
    };

    const isNewSelfCreate = !client;
    if (isNewSelfCreate || shouldUpgrade) {
      submissionData.requiresNamePinUpgrade = false;
      submissionData.nameVerifiedAt = new Date();
    }

    if (shouldUpgrade) {
      const existingNick = String(client?.nickname || '').trim();
      const legacyFull = [client?.firstName, client?.lastName].filter(Boolean).join(' ').trim();
      const parts = [];
      if (existingNick) parts.push(existingNick);
      if (legacyFull) parts.push(legacyFull);
      if (parts.length) submissionData.nickname = parts.join('  ');
    }

    if (!client || forceSetPin || (pin && pinConfirm && /^\d{4}$/.test(pin) && pin === pinConfirm)) {
      submissionData.pin = pin;
    }

    if (!client && verifyMode && otpPurpose === 'signup') {
      submissionData.otpPurpose = 'signup';
    }

    try {
      const response = client
        ? await API.put(`/clients/${client._id}`, submissionData)
        : await API.post('/clients', submissionData);

      setClient(response.data);

      if (embed && typeof onComplete === 'function') {
        onComplete(response.data);
        return;
      }

      try {
        localStorage.setItem('clientPhone', response.data.phone || '');
        localStorage.setItem('clientFirstName', response.data.firstName || '');
        localStorage.setItem('clientLastName', response.data.lastName || '');
        if (response.data._id) localStorage.setItem('clientId', response.data._id);
        const displayName = [response.data.firstName, response.data.lastName].filter(Boolean).join(' ').trim();
        localStorage.setItem('clientDisplayName', displayName);
        localStorage.setItem('clientProfile', JSON.stringify({
          _id: response.data._id,
          firstName: response.data.firstName,
          lastName: response.data.lastName,
          phone: response.data.phone,
          email: response.data.email || '',
        }));
        localStorage.setItem('client', JSON.stringify({
          _id: response.data._id,
          firstName: response.data.firstName || '',
          lastName: response.data.lastName || '',
          phone: response.data.phone || '',
          email: response.data.email || '',
        }));
        localStorage.setItem('lastPhone', response.data.phone || '');
      } catch {/* ignore */}

      setStep('welcomeGuest');
      setWelcomeSince(Date.now());
    } catch (err) {
      const payload = err?.response?.data || {};
      console.error('Failed to submit form:', payload || err);
      if (payload?.requiresOtp) {
        setStep('verifyPin');
        setErrors((prev) => ({ ...prev, otp: payload.error || 'Please verify your phone by code first.' }));
      } else {
        toast.error(payload.error || 'Failed to submit form.');
      }
    }
  };

  useEffect(() => {
    if (step !== 'welcomeGuest') return undefined;
    const timer = setTimeout(async () => {
      const statuses = ['booked', 'pending'];
      const hasActive = async () => {
        const cid = client?._id || localStorage.getItem('clientId') || '';
        const cphone = client?.phone || localStorage.getItem('clientPhone') || '';
        try {
          if (cid) {
            const r = await API.get(`/appointments?clientId=${cid}&limit=5`);
            const list = Array.isArray(r.data) ? r.data : (r.data?.items || []);
            return list.some((a) => statuses.includes(String(a.status || '').toLowerCase()));
          }
        } catch {/* ignore */}
        try {
          if (cphone) {
            const r2 = await API.get(`/appointments?phone=${encodeURIComponent(cphone)}&limit=5`);
            const list2 = Array.isArray(r2.data) ? r2.data : (r2.data?.items || []);
            return list2.some((a) => statuses.includes(String(a.status || '').toLowerCase()));
          }
        } catch {/* ignore */}
        return false;
      };

      if (!isNewClient && (await hasActive())) {
        window.location.assign(DASHBOARD_PATH);
      } else {
        window.location.assign(SCHEDULE_PATH);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [step, client, isNewClient, welcomeSince]);

  return (
    <div className="max-w-md mx-auto p-4 text-center relative">
      <img src={logo} alt="Rakie Salon Logo" className="w-24 h-24 mb-4 mx-auto opacity-80" />

      {step === 'enterPhone' && !embed && (
        <>
          <h2 className="text-xl font-semibold mb-4">Client Intake Form</h2>
          <label className="block font-medium mb-1">Enter your phone number</label>
          <input
            type="tel"
            value={phone}
            onChange={(e) => setPhone(normalizePhone10(e.target.value))}
            className={`w-full border p-2 mb-1 ${errors.phone ? 'border-red-500' : ''}`}
            placeholder="Phone Number"
          />
          {errors.phone && <p className="text-red-500 text-sm mb-2">{errors.phone}</p>}
          <button onClick={handlePhoneSubmit} className="bg-blue-600 text-white px-4 py-2 rounded">
            Continue
          </button>
        </>
      )}

      {step === 'verifyPin' && (
        <>
          <h2 className="text-xl font-semibold mb-4">
            {otpMode === 'reset' ? 'Verify your phone and set a new PIN' : 'Verify your phone'}
          </h2>
          <p className="text-gray-600 text-sm mb-4">
            {otpMaskedPhone
              ? `We texted a 6-digit code to ${otpMaskedPhone}.`
              : 'We will text a 6-digit code to the phone number on file.'}
          </p>

          <label className="block font-medium mb-1">6-digit code</label>
          <input
            type="tel"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            value={otp}
            onChange={(e) => {
              setOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
              setErrors((prev) => ({ ...prev, otp: '' }));
            }}
            className={`w-full border p-2 mb-2 ${errors.otp ? 'border-red-500' : ''}`}
            placeholder="123456"
          />
          {errors.otp && <p className="text-red-500 text-sm mb-2">{errors.otp}</p>}

          {otpMode === 'reset' && (
            <>
              <label className="block font-medium mb-1 mt-3">Choose a 4-digit PIN</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                name="pin"
                value={pin}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setErrors((prev) => ({ ...prev, pin: '' }));
                  if (digits.length === 4 && phoneLast4 && digits === phoneLast4) {
                    setErrors((prev) => ({ ...prev, pin: 'PIN cannot be your phone number’s last 4 digits. Choose a different PIN.' }));
                    setPin('');
                    return;
                  }
                  setPin(digits);
                }}
                className={`w-full border p-2 mb-2 ${errors.pin ? 'border-red-500' : ''}`}
                placeholder="••••"
              />
              {errors.pin && <p className="text-red-500 text-sm mb-2">{errors.pin}</p>}

              <label className="block font-medium mb-1 mt-3">Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                value={pinConfirm}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setErrors((prev) => ({ ...prev, pinConfirm: '' }));
                  if (digits.length === 4 && phoneLast4 && digits === phoneLast4) {
                    setErrors((prev) => ({ ...prev, pinConfirm: 'PIN cannot be your phone number’s last 4 digits. Choose a different PIN.' }));
                    setPinConfirm('');
                    return;
                  }
                  setPinConfirm(digits);
                }}
                className={`w-full border p-2 mb-2 ${errors.pinConfirm ? 'border-red-500' : ''}`}
                placeholder="••••"
              />
              {errors.pinConfirm && <p className="text-red-500 text-sm mb-2">{errors.pinConfirm}</p>}
            </>
          )}

          {otpSupport && (
            <div className="mt-4 rounded-lg border border-yellow-300 bg-yellow-50 p-3 text-left text-sm text-yellow-900">
              <p className="font-semibold mb-1">Need manual help?</p>
              <p>{otpSupport.message}</p>
              <div className="mt-3 flex gap-2">
                <a
                  href={`sms:${PIN_HELP_PHONE}?&body=${encodeURIComponent(PIN_HELP_KEYWORD)}`}
                  className="flex-1 text-center bg-blue-600 hover:bg-blue-700 text-white py-2 rounded"
                >
                  Text RAKIE PIN
                </a>
                <a
                  href={`tel:${PIN_HELP_PHONE}`}
                  className="flex-1 text-center bg-green-600 hover:bg-green-700 text-white py-2 rounded"
                >
                  Call
                </a>
              </div>
            </div>
          )}

          <div className="mt-4 flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={handleVerifyAndSetPin}
              className="bg-blue-600 text-white px-4 py-2 rounded"
            >
              {otpMode === 'reset' ? 'Verify & Set PIN' : 'Verify & Continue'}
            </button>
            <button
              type="button"
              onClick={() => requestOtp({ manual: true })}
              disabled={otpCooldown > 0 || otpSending}
              className="text-sm underline disabled:opacity-50"
            >
              {otpCooldown > 0 ? `Resend in ${otpCooldown}s` : (otpSending ? 'Sending…' : 'Resend code')}
            </button>
          </div>
        </>
      )}

      {step === 'fillForm' && (
        <>
          <h2 className="text-xl font-semibold mb-4">
            {client ? 'Update Your Info' : 'New Client Intake Form'}
          </h2>

          {mustResetPin && (
            <div className="mb-4 rounded-lg border border-yellow-300 bg-yellow-50 text-yellow-900 p-3 text-sm">
              <strong>Action required:</strong> For your security, please <span className="underline">update all personal info</span> and <strong>enter a new 4-digit PIN</strong> to continue.
            </div>
          )}

          <div className="space-y-3 text-left">
            <div>
              <label className="block">Phone</label>
              <input
                type="text"
                value={prettyPhone(form.phone || phone) || (form.phone || phone)}
                disabled
                className="w-full border p-2 bg-gray-100 text-gray-600"
              />
              {!client && verifyMode && otpVerified && (
                <p className="mt-1 text-xs text-green-700">Verified phone number</p>
              )}
            </div>

            <div>
              <label className="block">First Name</label>
              <input
                name="firstName"
                value={form.firstName}
                onChange={(e) => { handleChange(e); setIsDirty(true); }}
                className={`w-full border p-2 ${errors.firstName ? 'border-red-500' : ''}`}
                placeholder="First Name"
              />
              {errors.firstName && <p className="text-red-500 text-sm">{errors.firstName}</p>}
            </div>

            <div>
              <label className="block">Last Name</label>
              <input
                name="lastName"
                value={form.lastName}
                onChange={(e) => { handleChange(e); setIsDirty(true); }}
                className={`w-full border p-2 ${errors.lastName ? 'border-red-500' : ''}`}
                placeholder="Last Name"
              />
              {errors.lastName && <p className="text-red-500 text-sm">{errors.lastName}</p>}
            </div>

            <div>
              <label className="block">Email</label>
              <input
                name="email"
                type="email"
                value={form.email ?? ''}
                onChange={(e) => { handleChange(e); setIsDirty(true); }}
                className={`w-full border p-2 ${errors.email ? 'border-red-500' : ''}`}
                placeholder="you@example.com"
              />
              {errors.email && <p className="text-red-500 text-sm">{errors.email}</p>}
            </div>

            <div>
              <label className="block">
                Date of birth <span className="text-red-600 text-xs font-semibold">(This will help us celebrate you)</span>
              </label>
              <input
                type="date"
                name="dob"
                value={form.dob ?? ''}
                onChange={(e) => { handleChange(e); setIsDirty(true); }}
                className={`w-full border p-2 ${errors.dob ? 'border-red-500' : ''}`}
              />
              {errors.dob && <p className="text-red-500 text-sm">{errors.dob}</p>}
            </div>

            <div className="mt-2">
              <label className="block">Choose a 4-digit PIN</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                value={pin}
                onChange={(e) => {
                  const digits = e.target.value.replace(/\D/g, '').slice(0, 4);
                  setErrors((prev) => ({ ...prev, pin: '' }));
                  if (digits.length === 4 && phoneLast4 && digits === phoneLast4) {
                    setErrors((prev) => ({ ...prev, pin: 'PIN cannot be your phone number’s last 4 digits. Choose a different PIN.' }));
                    setPin('');
                    return;
                  }
                  setPin(digits);
                  setIsDirty(true);
                }}
                className={`w-full border p-2 ${mustResetPin ? 'bg-yellow-100' : ''} ${errors.pin ? 'border-red-500' : ''}`}
                placeholder="••••"
              />
              {errors.pin && <p className="text-red-500 text-sm">{errors.pin}</p>}
            </div>

            <div>
              <label className="block">Confirm PIN</label>
              <input
                type="password"
                inputMode="numeric"
                pattern="\d{4}"
                maxLength={4}
                value={pinConfirm}
                onChange={(e) => setPinConfirm(e.target.value.replace(/\D/g, ''))}
                className={`w-full border p-2 ${mustResetPin ? 'bg-yellow-100' : ''} ${errors.pinConfirm ? 'border-red-500' : ''}`}
                placeholder="••••"
              />
              {errors.pinConfirm && <p className="text-red-500 text-sm">{errors.pinConfirm}</p>}
            </div>

            <div className="space-y-2 mt-4 text-sm text-gray-700">
              <label className="flex items-start gap-2">
                <input
                  type="checkbox"
                  checked={form.contactPreferences.optInPromotions}
                  onChange={(e) => {
                    setForm((prev) => ({
                      ...prev,
                      contactPreferences: {
                        ...prev.contactPreferences,
                        optInPromotions: e.target.checked,
                      },
                    }));
                    setIsDirty(true);
                  }}
                />
                <span>Get reminders and important announcements</span>
              </label>

              <div className="mt-4 text-sm text-gray-700">
                <label className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={form.acceptedTerms}
                    required
                    onChange={(e) => {
                      setForm((prev) => ({ ...prev, acceptedTerms: e.target.checked }));
                      setIsDirty(true);
                    }}
                  />
                  <span className="text-sm text-gray-700">
                    I accept the{' '}
                    <a
                      href="/booking/terms_and_privacy_anchors.html#terms-of-service"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-blue-600"
                    >
                      Terms of Service
                    </a>{' '}
                    and{' '}
                    <a
                      href="/booking/terms_and_privacy_anchors.html#privacy-policy"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="underline text-blue-600"
                    >
                      Privacy Policy
                    </a>.
                  </span>
                </label>
                {errors.acceptedTerms && <p className="text-red-500 text-sm mt-1">{errors.acceptedTerms}</p>}
              </div>

              <p className="text-xs text-gray-600 mt-2">
                By providing your phone number you agree to receive informational text messages from <strong>Rakie Salon</strong>. Consent is not a condition of purchase. Message frequency will vary. Msg &amp; data rates may apply. Reply HELP for help or STOP to cancel.
              </p>
            </div>
          </div>

          <div className="mt-6 flex gap-3">
            <button
              type="button"
              onClick={() => (onCancel ? onCancel() : window.location.assign('/booking'))}
              className="flex-1 w-full py-3 rounded border border-gray-300 text-gray-700 hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className={`flex-1 w-full py-3 rounded text-white ${!canSubmit ? 'bg-blue-300 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
            >
              Submit
            </button>
          </div>

          {!embed && (
            <button onClick={() => window.location.assign('/booking/intake')} className="absolute bottom-4 right-4 text-sm text-gray-500 underline">
              Exit
            </button>
          )}
        </>
      )}

      {step === 'welcomeGuest' && !embed && (
        <div>
          <h2 className="text-xl font-semibold mb-6">
            {!isNewClient
              ? `Thanks, ${form.firstName}. Your profile has been updated.`
              : `Welcome ${form.firstName} ${form.lastName} to the Rakie Salon family!`}
          </h2>
          <p className="text-gray-600 text-sm">Entering the schedule page…</p>
          {!embed && (
            <button onClick={() => window.location.assign('/booking/intake')} className="absolute bottom-4 right-4 text-sm text-gray-500 underline">
              Exit
            </button>
          )}
        </div>
      )}

      {showNoChangeModal && !embed && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 animate-fade">
          <div className="bg-white rounded-lg p-6 w-80 text-center shadow-lg relative">
            <img src={logo} alt="Rakie Logo" className="w-16 h-16 mx-auto mb-4" />
            <p className="text-lg mb-4">No changes detected.<br />Do you want to exit without saving?</p>
            <div className="flex justify-center gap-4">
              <button className="bg-gray-400 text-white px-4 py-2 rounded" onClick={() => setShowNoChangeModal(false)}>
                Cancel
              </button>
              <button
                className="bg-blue-600 text-white px-4 py-2 rounded"
                onClick={() => {
                  setShowNoChangeModal(false);
                  setStep('welcomeGuest');
                }}
              >
                Exit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
