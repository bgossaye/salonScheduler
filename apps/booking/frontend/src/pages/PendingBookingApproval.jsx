import React, { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import API from '../api';
import logo from '../assets/TheRSlogo.png';

function toMinutes(value) {
  const match = String(value || '').match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}

function formatMinutes(total) {
  if (!Number.isFinite(total)) return '';
  const normalized = ((total % 1440) + 1440) % 1440;
  let hour = Math.floor(normalized / 60);
  const minute = normalized % 60;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  hour = hour % 12 || 12;
  return `${hour}:${String(minute).padStart(2, '0')} ${suffix}`;
}

function durationLabel(minutes) {
  const value = Math.max(0, Number(minutes) || 0);
  const hours = Math.floor(value / 60);
  const mins = value % 60;
  if (!hours) return `${mins} min`;
  if (!mins) return `${hours} hr${hours === 1 ? '' : 's'}`;
  return `${hours} hr ${mins} min`;
}

function ScheduleRow({ row, duration }) {
  const start = toMinutes(row.time);
  const actualDuration = Math.max(1, Number(duration ?? row.duration) || 60);
  const end = start === null ? null : start + actualDuration;
  const target = Boolean(row.isTarget);

  return (
    <div
      className={target
        ? 'relative flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 shadow-sm'
        : 'flex items-start gap-2 border-b border-gray-100 px-2 py-2 last:border-b-0'}
    >
      <div className={`w-4 shrink-0 pt-0.5 text-center font-bold ${target ? 'text-amber-700' : 'text-transparent'}`}>
        ▶
      </div>
      <div className="w-28 shrink-0 text-xs font-semibold text-gray-700">
        {row.timeLabel || row.time}{end !== null ? `–${formatMinutes(end)}` : ''}
      </div>
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm ${target ? 'font-bold text-gray-950' : 'font-medium text-gray-800'}`}>
          {row.clientName} · {row.serviceName}
        </div>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-gray-500">
          <span>{durationLabel(actualDuration)}</span>
          {target ? (
            <span className="rounded-full bg-amber-200 px-2 py-0.5 font-bold tracking-wide text-amber-900">PENDING</span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

export default function PendingBookingApproval() {
  const { token } = useParams();
  const [loading, setLoading] = useState(true);
  const [confirming, setConfirming] = useState(false);
  const [appointment, setAppointment] = useState(null);
  const [schedule, setSchedule] = useState([]);
  const [duration, setDuration] = useState(60);
  const [error, setError] = useState('');
  const [confirmed, setConfirmed] = useState(false);

  useEffect(() => {
    let active = true;
    async function load() {
      setLoading(true);
      setError('');
      try {
        const response = await API.get(`/pending-booking-approval/${encodeURIComponent(token)}`);
        if (!active) return;
        const next = response?.data?.appointment || null;
        setAppointment(next);
        setSchedule(Array.isArray(response?.data?.schedule) ? response.data.schedule : []);
        setDuration(Math.max(15, Number(next?.duration) || 60));
        if (String(next?.status || '').toLowerCase() === 'booked') setConfirmed(true);
      } catch (err) {
        if (!active) return;
        setError(err?.response?.data?.error || 'Unable to open this booking approval link.');
      } finally {
        if (active) setLoading(false);
      }
    }
    load();
    return () => { active = false; };
  }, [token]);

  const scheduleView = useMemo(() => {
    const sorted = [...schedule].sort((a, b) => (toMinutes(a.time) ?? 9999) - (toMinutes(b.time) ?? 9999));
    const rendered = [];
    sorted.forEach((row, index) => {
      if (index > 0) {
        const previous = sorted[index - 1];
        const previousStart = toMinutes(previous.time);
        const previousDuration = previous.isTarget ? duration : Math.max(1, Number(previous.duration) || 60);
        const previousEnd = previousStart === null ? null : previousStart + previousDuration;
        const currentStart = toMinutes(row.time);
        if (previousEnd !== null && currentStart !== null && currentStart - previousEnd >= 15) {
          rendered.push({
            kind: 'gap',
            key: `gap-${previous.appointmentId}-${row.appointmentId}`,
            start: previousEnd,
            end: currentStart,
          });
        }
      }
      rendered.push({ kind: 'appointment', key: row.appointmentId, row });
    });
    return rendered;
  }, [schedule, duration]);

  const conflict = useMemo(() => {
    if (!appointment) return null;
    const targetStart = toMinutes(appointment.time);
    if (targetStart === null) return null;
    const targetEnd = targetStart + duration;
    const others = schedule
      .filter((row) => !row.isTarget)
      .map((row) => ({ ...row, startMin: toMinutes(row.time) }))
      .filter((row) => row.startMin !== null)
      .sort((a, b) => a.startMin - b.startMin);

    const previous = [...others].reverse().find((row) => row.startMin < targetStart);
    if (previous) {
      const previousEnd = previous.startMin + Math.max(1, Number(previous.duration) || 60);
      if (previousEnd > targetStart) {
        return { direction: 'previous', row: previous, at: targetStart };
      }
    }

    const next = others.find((row) => row.startMin >= targetStart);
    if (next && targetEnd > next.startMin) {
      return { direction: 'next', row: next, at: next.startMin };
    }
    return null;
  }, [appointment, schedule, duration]);

  async function confirmAppointment() {
    if (confirming || confirmed) return;
    setConfirming(true);
    setError('');
    try {
      const response = await API.post(`/pending-booking-approval/${encodeURIComponent(token)}/confirm`, { duration });
      setAppointment(response?.data?.appointment || appointment);
      setConfirmed(true);
    } catch (err) {
      const code = err?.response?.data?.code;
      const message = err?.response?.data?.error || 'Unable to confirm this appointment.';
      if (code === 'APPOINTMENT_ALREADY_RESOLVED' && err?.response?.data?.currentStatus === 'booked') {
        setConfirmed(true);
      } else {
        setError(message);
      }
    } finally {
      setConfirming(false);
    }
  }

  const originalDuration = Math.max(15, Number(appointment?.duration) || 60);
  const durationChanged = duration !== originalDuration;
  const adminScheduleUrl = appointment?.date
    ? `/booking/admin/appointments?date=${encodeURIComponent(appointment.date)}`
    : '/booking/admin/appointments';

  return (
    <div className="min-h-screen bg-gray-100 flex items-start justify-center px-3 py-6 sm:px-4 sm:py-10">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-lg p-5 sm:p-6 text-center">
        <img src={logo} alt="Rakie Salon" className="w-20 h-20 object-contain mx-auto mb-2" />
        <h1 className="text-2xl font-semibold text-gray-900">Booking Request</h1>

        {loading && <p className="mt-6 text-gray-600">Loading appointment…</p>}

        {!loading && appointment && (
          <div className="mt-5 text-left rounded-xl border border-gray-200 p-4 space-y-1.5">
            <div><span className="font-semibold">Client:</span> {appointment.clientName}</div>
            <div><span className="font-semibold">Service:</span> {appointment.serviceName}</div>
            <div><span className="font-semibold">Date:</span> {appointment.dateLabel}</div>
            <div><span className="font-semibold">Time:</span> {appointment.timeLabel}</div>
            <div><span className="font-semibold">Allocated:</span> {durationLabel(originalDuration)}</div>
            {appointment.workerName ? <div><span className="font-semibold">Stylist:</span> {appointment.workerName}</div> : null}
          </div>
        )}

        {!loading && appointment && schedule.length > 0 && (
          <div className="mt-5 text-left">
            <div className="mb-2 flex items-end justify-between gap-3">
              <div>
                <h2 className="text-sm font-bold text-gray-900">
                  {appointment.workerName ? `${appointment.workerName} — ` : ''}{appointment.dateLabel}
                </h2>
                <p className="text-xs text-gray-500">Day schedule</p>
              </div>
              <a href={adminScheduleUrl} className="text-xs font-semibold text-gray-700 underline underline-offset-2">
                Full schedule
              </a>
            </div>

            <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
              {scheduleView.map((item) => item.kind === 'gap' ? (
                <div key={item.key} className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 text-xs text-gray-500">
                  <span className="w-4" />
                  <span className="w-28 font-medium">{formatMinutes(item.start)}–{formatMinutes(item.end)}</span>
                  <span className="font-semibold tracking-wide">OPEN</span>
                </div>
              ) : (
                <ScheduleRow
                  key={item.key}
                  row={item.row}
                  duration={item.row.isTarget ? duration : item.row.duration}
                />
              ))}
            </div>
          </div>
        )}

        {!loading && !confirmed && appointment && String(appointment.status || '').toLowerCase() === 'pending' && (
          <div className="mt-5 rounded-xl border border-gray-200 bg-gray-50 p-4 text-left">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Stylist needs</div>
                <div className="mt-0.5 text-lg font-bold text-gray-900">{durationLabel(duration)}</div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setDuration((value) => Math.max(15, value - 15))}
                  className="h-10 w-10 rounded-lg border border-gray-300 bg-white text-xl font-bold text-gray-800"
                  aria-label="Reduce duration by 15 minutes"
                >−</button>
                <button
                  type="button"
                  onClick={() => setDuration((value) => Math.min(720, value + 15))}
                  className="h-10 w-10 rounded-lg border border-gray-300 bg-white text-xl font-bold text-gray-800"
                  aria-label="Increase duration by 15 minutes"
                >+</button>
              </div>
            </div>
            {durationChanged ? (
              <button type="button" onClick={() => setDuration(originalDuration)} className="mt-2 text-xs font-semibold text-gray-600 underline">
                Reset to allocated {durationLabel(originalDuration)}
              </button>
            ) : null}
          </div>
        )}

        {!loading && !confirmed && appointment && conflict && (
          <div className="mt-3 rounded-xl border border-red-300 bg-red-50 p-3 text-left text-sm text-red-800">
            <div className="font-bold">⚠ Schedule conflict</div>
            <div className="mt-1">
              {conflict.direction === 'next'
                ? `This duration runs into ${conflict.row.clientName} at ${conflict.row.timeLabel || formatMinutes(conflict.at)}.`
                : `The previous appointment overlaps this ${appointment.timeLabel} start time.`}
            </div>
          </div>
        )}

        {!loading && confirmed && (
          <div className="mt-6 rounded-xl bg-green-50 border border-green-200 p-4 text-green-800 font-medium">
            Appointment confirmed. The customer confirmation text has been sent.
          </div>
        )}

        {!loading && !confirmed && appointment && String(appointment.status || '').toLowerCase() === 'pending' && (
          <button
            type="button"
            onClick={confirmAppointment}
            disabled={confirming}
            className="mt-5 w-full rounded-xl bg-black text-white py-3 px-4 font-semibold disabled:opacity-60"
          >
            {confirming ? 'Confirming…' : durationChanged ? `Confirm · ${durationLabel(duration)}` : 'Confirm Appointment'}
          </button>
        )}

        {!loading && appointment && !confirmed && String(appointment.status || '').toLowerCase() !== 'pending' && (
          <div className="mt-6 rounded-xl bg-gray-50 border border-gray-200 p-4 text-gray-700">
            This booking is already {appointment.status || 'resolved'}.
          </div>
        )}

        {error && (
          <div className="mt-6 rounded-xl bg-red-50 border border-red-200 p-4 text-red-700">
            {error}
          </div>
        )}
      </div>
    </div>
  );
}
