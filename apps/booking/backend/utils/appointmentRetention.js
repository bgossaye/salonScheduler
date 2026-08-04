const Appointment = require('../models/appointment');
const { getRuntimeBoolean, getRuntimeNumber } = require('./runtimeSettings');

const DAY_MS = 24 * 60 * 60 * 1000;

function cutoffDateString(days, now = new Date()) {
  return new Date(now.getTime() - Math.max(1, Number(days)) * DAY_MS).toISOString().slice(0, 10);
}

async function getPolicy() {
  return {
    completedDays: await getRuntimeNumber('appointmentRetention.archiveCompletedDays', 180),
    canceledDays: await getRuntimeNumber('appointmentRetention.archiveCanceledDays', 90),
    noShowDays: await getRuntimeNumber('appointmentRetention.archiveNoShowDays', 180),
    permanentDeleteEnabled: await getRuntimeBoolean('appointmentRetention.permanentDeleteEnabled', false),
    deleteArchivedDays: await getRuntimeNumber('appointmentRetention.deleteArchivedDays', 1095),
  };
}

function archiveQueries(policy, now = new Date()) {
  const base = { archived: { $ne: true }, retentionHold: { $ne: true } };
  return [
    { label: 'completed', filter: { ...base, status: 'completed', date: { $lte: cutoffDateString(policy.completedDays, now) } } },
    { label: 'canceled', filter: { ...base, status: { $in: ['canceled', 'cancelled'] }, date: { $lte: cutoffDateString(policy.canceledDays, now) } } },
    { label: 'noshow', filter: { ...base, status: 'noshow', date: { $lte: cutoffDateString(policy.noShowDays, now) } } },
  ];
}

async function previewAppointmentRetention(now = new Date()) {
  const policy = await getPolicy();
  const groups = {};
  for (const item of archiveQueries(policy, now)) groups[item.label] = await Appointment.countDocuments(item.filter);
  const deleteBefore = new Date(now.getTime() - policy.deleteArchivedDays * DAY_MS);
  const deleteEligible = policy.permanentDeleteEnabled
    ? await Appointment.countDocuments({ archived: true, retentionHold: { $ne: true }, archivedAt: { $lte: deleteBefore } })
    : 0;
  return { policy, archiveEligible: groups, archiveTotal: Object.values(groups).reduce((a,b)=>a+b,0), deleteEligible };
}

async function runAppointmentRetention({ now = new Date(), source = 'manual', updatedBy = '' } = {}) {
  const policy = await getPolicy();
  const archived = {};
  for (const item of archiveQueries(policy, now)) {
    const result = await Appointment.updateMany(item.filter, {
      $set: { archived: true, archivedAt: now, archiveReason: `retention-policy:${item.label}:${source}` },
    });
    archived[item.label] = result.modifiedCount || 0;
  }
  let deleted = 0;
  if (policy.permanentDeleteEnabled) {
    const deleteBefore = new Date(now.getTime() - policy.deleteArchivedDays * DAY_MS);
    const result = await Appointment.deleteMany({ archived: true, retentionHold: { $ne: true }, archivedAt: { $lte: deleteBefore } });
    deleted = result.deletedCount || 0;
  }
  const summary = { source, updatedBy, ranAt: now, policy, archived, archivedTotal: Object.values(archived).reduce((a,b)=>a+b,0), deleted };
  console.log('[appointment-retention] cleanup completed', summary);
  return summary;
}

module.exports = { previewAppointmentRetention, runAppointmentRetention };
