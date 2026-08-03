# System Error Window Implementation

## Goal
Owner/Admin users need a minimized-by-default dashboard window that lists backend system errors only. Warnings, debug logs, info logs, SMS delivery status logs, and other non-error logs are intentionally excluded.

## Backend additions

- Added `models/systemerrorlog.js`.
- Added `utils/systemErrorLogger.js`.
- Added `controllers/admin/systemerrorscontroller.js`.
- Added `routes/admin/systemerrors.js`.
- Registered route: `GET /api/admin/system-errors`.
- Registered route: `PATCH /api/admin/system-errors/:id/resolve`.
- Dashboard response now includes `systemErrors` summary for Owner/Admin users.

## Error capture behavior

The backend captures only:

- `console.error(...)`
- `process.unhandledRejection`
- `process.uncaughtExceptionMonitor`

Captured records are stored in MongoDB as `SystemErrorLog` documents with:

- level: always `error`
- source
- message
- stack/details when available
- route/method/admin context when available
- occurredAt timestamp
- resolved flag

## Permissions

- Owner and Admin can view the System Errors window.
- Added `systemErrorsView` permission to StaffRole defaults.
- Existing owner/admin roles are updated to have `systemErrorsView: true` without wiping custom permissions.

## Frontend additions

- Added minimized-by-default `SystemErrorWindow` inside `AdminDashboard.jsx`.
- Window shows error counts while minimized.
- Expanding the window fetches latest backend errors from `/api/admin/system-errors?limit=100`.
- Each error row can be expanded to show details and stack trace.

## Notes

This does not display SMS delivery logs. SMS logs remain in the SMS/System Health section. This window is strictly for backend system errors.
