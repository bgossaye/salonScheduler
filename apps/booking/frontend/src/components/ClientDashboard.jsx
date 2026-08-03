// ClientDashboard.jsx
import React, { useEffect, useMemo, useRef, useState } from 'react';
import API from '../api';
import { toast } from 'react-toastify';
import logo from '../assets/TheRSlogo.png';
import {
  doesAppointmentQualifyForSpecial,
  getSpecialAppointmentBadgeText,
  usePromotionConfig,
} from '../utils/specialDeals';

/** ===== Helpers ===== */
// Treat an appointment as "active" only if its start is still in the future
function isFutureAppt(appt) {
  return apptDate(appt) >= new Date();
} 

function readStoredClient() {
  try {
    const s = localStorage.getItem('client');
    return s ? JSON.parse(s) : null;
  } catch {
    return null;
  }
}

function apptDate(appt) {
  const d = appt?.date || '';
  const t = appt?.time || '00:00';
  const iso = `${d}T${t}:00`;
  const when = new Date(iso);
  return isNaN(when.getTime()) ? new Date(0) : when;
}


function getWorkerName(appt) {
  return appt?.workerName || appt?.workerId?.displayName || appt?.priceSnapshot?.workerName || null;
}

function money(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `$${number.toFixed(2)}` : null;
}

function getPriceDetails(appt) {
  const snapshot = appt?.priceSnapshot || {};
  const original = Number(snapshot.servicePrice || 0) + Number(snapshot.addOnPrice || 0);
  const discount = Number(snapshot.discountAmount || 0);
  const final = snapshot.finalPrice ?? (original > 0 ? Math.max(0, original - discount) : null);
  const promotion = appt?.appliedPromotion || null;
  const couponCode = String(promotion?.couponCode || appt?.couponCode || '').trim().toUpperCase();

  return {
    original: original > 0 ? money(original) : null,
    discount: discount > 0 ? money(discount) : null,
    final: final == null || final === '' ? null : money(final),
    label: promotion?.appointmentLabel || promotion?.title || (couponCode ? `${couponCode} coupon` : ''),
    couponCode,
    applied: discount > 0 || !!promotion || !!couponCode,
  };
}

function CouponPriceDetails({ appt }) {
  const details = getPriceDetails(appt);
  if (!details.final && !details.applied) return null;

  return (
    <div className="mt-1">
      {details.applied && (
        <div className="mb-1 inline-flex flex-wrap items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-800">
          <span>{details.label || 'Coupon applied'}</span>
          {details.couponCode && <span>({details.couponCode})</span>}
        </div>
      )}
      {details.applied && details.original && details.discount ? (
        <div className="text-sm">
          <div><strong>Original price:</strong> <span className="line-through text-gray-500">{details.original}</span></div>
          <div className="text-emerald-700"><strong>Discount:</strong> -{details.discount}</div>
          <div><strong>Final price:</strong> {details.final}</div>
        </div>
      ) : (
        details.final && <p><strong>Price:</strong> {details.final}</p>
      )}
    </div>
  );
}

function clientAuthPayload(client) {
  return {
    clientId: client?._id,
    phone: client?.phone || client?.clientPhone || '',
  };
}

export default function ClientDashboard({ client }) {
  const [effectiveClient, setEffectiveClient] = useState(() => client || readStoredClient());
  const [appointments, setAppointments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookingStatus, setBookingStatus] = useState({
    currentNotices: [],
    futureNotices: [],
    promotions: [],
    storeStatus: null,
  });
  const { promotionConfig } = usePromotionConfig();
  const shouldShowClientPromotion = promotionConfig.enabled && promotionConfig.showClientBadges;

  // Track whether there were active appts at first load
  const hadActiveAtLoadRef = useRef(null); // null until first fetch settles

  useEffect(() => {
    if (client && (!effectiveClient || client._id !== effectiveClient._id)) {
      setEffectiveClient(client);
    }
  }, [client]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    API.get('/booking-status')
      .then(({ data }) => {
        setBookingStatus({
          currentNotices: Array.isArray(data?.currentNotices) ? data.currentNotices : [],
          futureNotices: Array.isArray(data?.futureNotices) ? data.futureNotices : [],
          promotions: Array.isArray(data?.promotions) ? data.promotions : [],
          storeStatus: data?.storeStatus || null,
        });
      })
      .catch((error) => {
        console.error('Unable to load booking notices:', error?.response?.data || error.message);
      });
  }, []);

  useEffect(() => {
    if (!effectiveClient) {
      setLoading(false);
      return;
    }

    API.get(`/appointments/client/${effectiveClient._id}`)
      .then((res) => {
        const list = Array.isArray(res.data) ? res.data : [];
        setAppointments(list);
        setLoading(false);
      })
      .catch((err) => {
        console.error('❌ Failed to fetch appointments:', err);
        toast.error('Failed to fetch appointments');
        setLoading(false);
      });
  }, [effectiveClient]);

  const norm = (s) => (s || '').toLowerCase();

  const activeAppointments = useMemo(
    () =>
      appointments
        .filter(
          (a) =>
            ['booked', 'pending'].includes(norm(a?.status)) &&
            isFutureAppt(a)
        )
        .sort((a, b) => apptDate(a) - apptDate(b)),
    [appointments]
  );

  // Single most-recent past appointment: completed | canceled | noshow
  const pastAppointment = useMemo(() => {
    const wanted = new Set(['completed', 'canceled', 'noshow']);
    const candidates = appointments.filter(a => wanted.has(norm(a?.status)));
    if (!candidates.length) return null;
    return candidates.reduce((latest, cur) =>
      apptDate(cur) > apptDate(latest) ? cur : latest, candidates[0]);
  }, [appointments]);

  // After first fetch completes, set "hadActiveAtLoad" exactly once
  useEffect(() => {
    if (!loading && hadActiveAtLoadRef.current === null) {
      hadActiveAtLoadRef.current = activeAppointments.length > 0;
    }
  }, [loading, activeAppointments.length]);

  const displayName = useMemo(() => {
    const name = `${effectiveClient?.firstName || ''} ${effectiveClient?.lastName || ''}`.trim();
    return name || 'Client';
  }, [effectiveClient]);

  const handleExitToHome = () => {
    window.location.href = 'https://rakiesalon.com';
  };

  const handleGoToSchedule = (params = {}) => {
    // Ensure client is persisted for the Schedule page to consume
    if (effectiveClient) {
      localStorage.setItem('client', JSON.stringify(effectiveClient));
    }
    const qs = new URLSearchParams(params).toString();
    window.location.href = `/booking/schedule${qs ? `?${qs}` : ''}`;
  };

  const handleCancel = async (id) => {
    try {
      // Compute next list immediately so we can decide redirect precisely
      setAppointments((prev) => {
        const next = prev.filter((a) => a._id !== id);
        const nextActiveCount = next.filter((a) => ['booked', 'pending'].includes(norm(a.status))).length;

        // If user WAS on dashboard with actives, and this cancel makes it zero → go to schedule
        if (hadActiveAtLoadRef.current === true && nextActiveCount === 0) {
          // toast first, then route
          toast.info('No active appointments left. Let’s pick a new time.');
          setTimeout(() => handleGoToSchedule(), 800);
        }
        return next;
      });

      // Make API call after updating UI optimistically (or swap order if you prefer strict)
      await API.delete(`/appointments/${id}`, { data: clientAuthPayload(effectiveClient) });
      toast.success('Appointment canceled');
    } catch (err) {
      console.error('❌ Failed to cancel appointment:', err);
      toast.error('Failed to cancel appointment');
      // (Optional) Re-fetch or roll back if you didn’t delete server-side
    }
  };

  const handleEdit = (appointment) => {
    sessionStorage.setItem('editingAppointment', JSON.stringify(appointment));
    handleGoToSchedule();
  };

  // Initial-load behavior: if there were NEVER active appointments → exit to schedule
  useEffect(() => {
    if (!loading && effectiveClient) {
    if (activeAppointments.length === 0 && hadActiveAtLoadRef.current === false) {
        toast.info('No active appointments. Let’s book one.');
        const t = setTimeout(() => handleGoToSchedule(), 800);
        return () => clearTimeout(t);
      }
    }
  }, [loading, effectiveClient, activeAppointments.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const dashboardNotices = [
    ...bookingStatus.currentNotices.filter((notice) => !notice.onlineBookingOff),
    ...bookingStatus.futureNotices,
  ];
  const noticeCount = dashboardNotices.length + bookingStatus.promotions.length;

  const formatNoticeDate = (value) => {
    if (!value) return '';
    const date = new Date(`${value}T12:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  const formatNoticeRange = (notice) => {
    if (!notice?.startDate) return '';
    const start = formatNoticeDate(notice.startDate);
    const end = formatNoticeDate(notice.endDate);
    return !end || notice.startDate === notice.endDate ? start : `${start}–${end}`;
  };

  return (
    <div className="min-h-screen bg-gray-100 p-4">
      <header className="flex justify-between items-right mb-4">
        <img src={logo} alt="Rakie Salon Logo" className="h-12" />

        <div className="text-right mb-6">
          <h2 className="text-2xl font-semibold">Welcome back, {displayName}</h2>
          <button
            onClick={() => {
              sessionStorage.clear();
              localStorage.removeItem('client');
              window.location.href = '/booking';
            }}
            className="mt-1 text-sm text-blue-600 underline hover:text-blue-800"
          >
            Not you?
          </button>
        </div>

        <button onClick={handleExitToHome} className="text-sm text-blue-500 hover:underline">
          Exit
        </button>
      </header>

      {noticeCount > 0 && (
        <details className="mb-4 rounded-lg border border-gray-300 bg-white shadow-sm">
          <summary className="cursor-pointer select-none px-3 py-2 text-xs font-semibold text-gray-800">
            <span className="flex min-w-0 items-center justify-between gap-2">
              <span className={`min-w-0 truncate ${bookingStatus.storeStatus?.isOpenNow ? 'text-emerald-700' : 'text-red-700'}`}>
                {bookingStatus.storeStatus?.statusText || 'Store status available'}
              </span>
              <span className="flex shrink-0 items-center gap-1.5 whitespace-nowrap">
                {bookingStatus.promotions.length > 0 && (
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-800">
                    {bookingStatus.promotions.length} {bookingStatus.promotions.length === 1 ? 'deal' : 'deals'}
                  </span>
                )}
                {bookingStatus.futureNotices.length > 0 && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-amber-800">
                    {bookingStatus.futureNotices.length} future {bookingStatus.futureNotices.length === 1 ? 'closure' : 'closures'}
                  </span>
                )}
              </span>
            </span>
          </summary>
          <div className="space-y-2 border-t border-gray-200 p-3">
            {bookingStatus.currentNotices.filter((notice) => !notice.onlineBookingOff).map((notice) => (
              <div key={notice.id} className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-900">
                <div className="flex items-start justify-between gap-3">
                  <strong>{notice.title}</strong>
                  {formatNoticeRange(notice) && <span className="shrink-0 text-xs font-semibold text-red-700">{formatNoticeRange(notice)}</span>}
                </div>
                {notice.message && <p className="mt-1 text-xs text-red-800">{notice.message}</p>}
                {notice.storeClosed && !notice.onlineBookingOff && <p className="mt-1 text-xs font-semibold">Online booking is available for another date.</p>}
                {notice.open && notice.close && <p className="mt-1 text-xs font-semibold">Special hours: {notice.open}–{notice.close}</p>}
              </div>
            ))}
            {bookingStatus.futureNotices.map((notice) => (
              <div key={notice.id} className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                <div className="flex items-start justify-between gap-3">
                  <strong>{notice.title}</strong>
                  {formatNoticeRange(notice) && <span className="shrink-0 text-xs font-semibold text-amber-800">{formatNoticeRange(notice)}</span>}
                </div>
                {notice.message && <p className="mt-1 text-xs text-amber-900">{notice.message}</p>}
                {notice.storeClosed && !notice.onlineBookingOff && <p className="mt-1 text-xs font-semibold">Online booking will remain available for another date.</p>}
                {notice.open && notice.close && <p className="mt-1 text-xs font-semibold">Special hours: {notice.open}–{notice.close}</p>}
              </div>
            ))}
            {bookingStatus.promotions.map((promotion) => (
              <div key={promotion.id} className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-950">
                <strong>{promotion.shortLabel ? `${promotion.shortLabel} — ` : ''}{promotion.title}</strong>
                {promotion.message && <p className="mt-1 text-xs text-emerald-900">{promotion.message}</p>}
              </div>
            ))}
          </div>
        </details>
      )}

      {loading ? (
        <p>Loading appointments...</p>
      ) : !effectiveClient ? (
        <div className="bg-white shadow-md rounded p-4 text-center">
          <p className="mb-4">Please verify your phone number to view your appointments.</p>
          <a href="/booking" className="bg-blue-500 text-white px-4 py-2 rounded inline-block">
            Go to Welcome
          </a>
        </div>
      ) : (
        <>
          {/* ===== Active (editable) ===== */}
          {activeAppointments.length > 0 && (
            <section className="mb-6">
              <h3 className="text-lg font-semibold mb-3">Active Appointments</h3>
              {activeAppointments.map((appt) => (
                <div key={appt._id} className="bg-white shadow-md rounded p-4 mb-3">
                  <div className="flex flex-wrap gap-2 text-sm text-gray-700 mb-2">
                    <span className="px-2 py-0.5 rounded bg-green-50 border border-green-200">
                      {norm(appt.status).toUpperCase()}
                    </span>
                    {shouldShowClientPromotion && doesAppointmentQualifyForSpecial(appt, promotionConfig) && (
                      <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-800 font-semibold">
                        {getSpecialAppointmentBadgeText(appt, promotionConfig).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <p><strong>Service:</strong> {appt.service}</p>
                  <p><strong>Date:</strong> {appt.date}</p>
                  <p><strong>Time:</strong> {appt.time}</p>
                  {getWorkerName(appt) && <p><strong>Stylist:</strong> {getWorkerName(appt)}</p>}
                  <CouponPriceDetails appt={appt} />
                  {appt.addOns?.length > 0 && (
                    <p className="text-sm text-gray-700">
                      <strong>Add-ons:</strong>{' '}
                      {appt.addOns.map((a) => a?.name).filter(Boolean).join(', ')}
                    </p>
                  )}
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={() => handleEdit(appt)}
                      className="bg-blue-500 text-white px-4 py-2 rounded"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleCancel(appt._id)}
                      className="bg-red-500 text-white px-4 py-2 rounded"
                    >
                      Cancel Appt
                    </button>
                    <button onClick={handleExitToHome} className="bg-gray-500 text-white px-4 py-2 rounded">
                      Exit
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {/* ===== Single Past appointment (read-only) ===== */}
          <section>
            <h3 className="text-lg font-semibold mb-3">Past appointment</h3>
            {!pastAppointment ? (
              <div className="bg-white shadow-md rounded p-4 text-gray-600">
                No past appointment yet.
              </div>
            ) : (
              <div className="bg-white shadow-md rounded p-4 mb-3 opacity-90">
                <div className="flex flex-wrap gap-2 text-sm text-gray-700 mb-2">
                  <span className="px-2 py-0.5 rounded bg-slate-50 border border-slate-200">
                    {norm(pastAppointment.status).toUpperCase()}
                  </span>
                  {shouldShowClientPromotion && doesAppointmentQualifyForSpecial(pastAppointment, promotionConfig) && (
                    <span className="px-2 py-0.5 rounded bg-amber-50 border border-amber-300 text-amber-800 font-semibold">
                      {getSpecialAppointmentBadgeText(pastAppointment, promotionConfig).toUpperCase()}
                    </span>
                  )}
                </div>
                <p><strong>Service:</strong> {pastAppointment.service}</p>
                <p><strong>Date:</strong> {pastAppointment.date}</p>
                <p><strong>Time:</strong> {pastAppointment.time}</p>
                {getWorkerName(pastAppointment) && <p><strong>Stylist:</strong> {getWorkerName(pastAppointment)}</p>}
                <CouponPriceDetails appt={pastAppointment} />
                {pastAppointment.addOns?.length > 0 && (
                  <p className="text-sm text-gray-700">
                    <strong>Add-ons:</strong>{' '}
                    {pastAppointment.addOns.map((a) => a?.name).filter(Boolean).join(', ')}
                  </p>
                )}
                <p className="mt-2 text-xs text-gray-500">Read-only</p>
              </div>
            )}
          </section>
        </>
      )}

      <img
        src={logo}
        alt="Rakie Salon Logo"
        className="fixed bottom-4 right-4 w-16 h-16 opacity-30 pointer-events-none"
      />
    </div>
  );
}
