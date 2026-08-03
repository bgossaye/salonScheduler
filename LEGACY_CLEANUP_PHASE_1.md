# Legacy Cleanup Phase 1 Applied

This phase removes the safest legacy files only: unused, unmounted, broken, placeholder, or deprecated compatibility files. It intentionally does **not** touch active SMS safety guards, worker migration, default PIN behavior, pricing migration, public/admin controller sharing, or dynamic promotion compatibility.

## Removed backend files

- `backend/controllers/admin/notificationsettingscontroller.js`
- `backend/controllers/external/twiliocontroller.js`
- `backend/models/adminlog.js`
- `backend/models/booking.js`
- `backend/models/calendarslot.js`
- `backend/models/settings.js`
- `backend/models/awakemarker.js`
- `backend/routes/ping1.js`
- `backend/routes/health.js`
- `backend/utils/authFlags.js`
- `backend/utils/awake.js`
- `backend/scripts/migrate_default_pins.js`
- `backend/scripts/seednotification.js`
- `backend/scripts/seedservices.js`
- `backend/scripts/seedstorehours.js`
- `backend/scripts/enablePromos.js`

## Removed frontend files

- `frontend/src/components/AdminClientManager.jsx`
- `frontend/src/components/AppointmentManager.jsx`
- `frontend/src/components/FullCalendarBooking.jsx`
- `frontend/src/components/admin/AdminClients-fixed.jsx`
- `frontend/src/components/admin/AdminStatusPane.jsx`
- `frontend/src/utils/wakeRenderBAR.js`

## Small cleanup

- Removed the stale commented Mongo-backed health route reference from `backend/server.js` because the actual route/util/model were removed.


## Removed small dead compatibility paths

- Removed the missing `../models/clients` fallback from `backend/utils/sendSMS.js`; the app now uses the real `../models/client` model directly.
- Removed the broken `../../lib/opsAlert` fallback from `backend/controllers/admin/clientadmincontroller.js`; OTP support alerts now use the existing `../../utils/opsAlert` utility.

## Not touched in this phase

These areas remain for later phases because they are active or higher-risk:

- SMS audit copy / 6 AM guard / audit-only mode / fallback text / alternate date-time guessing
- Default last-4 starter PIN and old client PIN flags
- Worker migration startup call and Rakeb default worker migration
- Legacy `Service.price` pricing compatibility
- Staff appointment permission legacy flags
- Thursday promotion compatibility seed/fallback
- Public routes using admin controllers
- Gift card route namespace/security cleanup
- Notification DB/file fallback cleanup
