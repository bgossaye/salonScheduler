# Legacy Cleanup Phase 3A - SMS Path Cleanup

Date: 2026-05-07

## Scope

This phase performs a careful SMS cleanup without removing the temporary reminder safety switches yet. The goal is to remove duplicate/stale compatibility paths while preserving live reminder behavior.

## Changes Made

### 1. Centralized SMS type/status normalization

File: `backend/utils/sendSMS.js`

Removed the local duplicate status map inside `sendSMS()` and now use the shared canonicalizer from `utils/canon.js`.

Preserved aliases:

- `booked` -> `confirmation`
- `completed` -> `thankyou`
- `canceled`, `cancelation`, `cancellation` -> `cancellation`

A supported SMS type allow-list was added so unknown values are still rejected and logged.

### 2. Removed duplicate phone masking helper

File: `backend/utils/sendSMS.js`

Removed the local catch-block `mask` function and reused the existing `maskPhoneForLog()` helper for both normal error logs and payload debug logs.

### 3. Improved date/time diagnostics for numeric `timeMinutes`

File: `backend/utils/sendSMS.js`

`timeMinutes` is now included in appointment token diagnostics and token building. The code uses `normalizeAppointmentDateTime()` before falling back to display formatting, so values like `810` are understood as minutes-from-midnight and normalized to `1:30 PM` when paired with a valid date.

This avoids false invalid-time logs for appointment objects that still carry the old/alternate `timeMinutes` field.

### 4. Removed duplicate status aliasing from admin appointment update notification

File: `backend/controllers/admin/appointmentadmincontroller.js`

Removed the local `statusMap` used only before calling `sendSMS()`. `sendSMS()` now handles canonicalization centrally.

### 5. Removed dead frontend fallback endpoint call

File: `frontend/src/components/admin/AdminNotifications.jsx`

Removed the call to the non-existent endpoint:

```txt
/admin/notificationsettings/fallback
```

The UI now logs the fetch failure and falls back to local UI defaults instead of calling a dead backend route.

### 6. Fixed cancellation template fallback key typo

File: `frontend/src/components/admin/AdminNotifications.jsx`

Changed local fallback keys from `cancelation` to `cancellation` to match the actual `TEMPLATE_TYPES` entry.

## Intentionally Not Removed Yet

These are still active and should be removed only after live SMS validation:

- `sms.auditCopy.enabled`
- `sms.auditOnlyMode.enabled`
- `sms.guard.blockSixAmReminders.enabled`
- `sms.blockIfDateTimeInvalid.enabled`
- `sms.clientName.enabled`
- `reminderFallbackText()`
- `cleanBrokenAppointmentText()`
- `polishReminderText()`
- backend file fallback in `utils/templates.js`
- `backend/data/notification-templates.json`

## Validation Performed

- `node --check backend/utils/sendSMS.js` passed.
- `node --check backend/controllers/admin/appointmentadmincontroller.js` passed.
- Backend relative `require(...)` path scan passed with 0 missing local requires.
- Confirmed removed frontend dead endpoint reference does not remain.
- Confirmed duplicate local `sendSMS()` status map does not remain.
- Confirmed duplicate local catch-block phone mask does not remain.
- Confirmed `toCanonical('cancelation')`, `toCanonical('booked')`, and `toCanonical('completed')` still normalize correctly.
- Confirmed `normalizeAppointmentDateTime('2026-05-08', 810)` returns `May 8, 2026` and `1:30 PM`.

## Next Recommended Phase

Phase 3B should remove or reduce the temporary SMS safety switches only after a few successful reminder runs confirm that date/time values are stable.

Recommended order:

1. Keep audit copy on for monitoring.
2. Validate reminder text for real tomorrow appointments.
3. Turn off audit-only mode if enabled.
4. Turn off or remove 6 AM guard after confirming no false 6 AM times.
5. Remove file-template fallback after DB templates are confirmed seeded.
6. Remove reminder text polish/fallback helpers after templates are corrected in MongoDB.
