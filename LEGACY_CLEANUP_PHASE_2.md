# Rakie Salon Legacy Cleanup — Phase 2 Report

## Phase
Careful-risk Phase 2: split public/client routes away from admin controllers.

## Goal
Remove the dangerous duplicate path where public `/api/clients` and `/api/appointments` routes were importing admin controllers. Public/client functionality now has dedicated client controllers with narrower behavior.

## Files changed

### Added
- `backend/controllers/client/clientcontroller.js`
- `backend/controllers/client/appointmentcontroller.js`

### Updated
- `backend/routes/client/clients.js`
- `backend/routes/client/appointments.js`

## What changed

### Public clients
`backend/routes/client/clients.js` now imports:

```js
../../controllers/client/clientcontroller
```

instead of:

```js
../../controllers/admin/clientadmincontroller
```

Public client behavior preserved:
- phone lookup by `/api/clients?phone=...`
- client login by phone/PIN
- OTP request/verify/set PIN
- public profile creation with OTP requirement
- public profile update for normal client-facing fields

Public client behavior restricted:
- no public access to admin client list/search
- no public stylist assignment switching
- no public client delete
- no public photo upload
- no public admin PIN unlock/reset/send-reset-OTP by client id
- no public notes/payment/admin-only fields editing except the legacy name-upgrade nickname compatibility path

### Public appointments
`backend/routes/client/appointments.js` now imports:

```js
../../controllers/client/appointmentcontroller
```

instead of:

```js
../../controllers/admin/appointmentadmincontroller
```

Public appointment behavior preserved:
- client appointment list by `/api/appointments/client/:id`
- compatibility list by `/api/appointments?clientId=...` or `/api/appointments?phone=...`
- public appointment creation
- public appointment edit through PATCH/PUT `/api/appointments/:id`
- compatibility update endpoints used by the frontend fallback list
- client cancel from dashboard/confirmation screen

Public appointment behavior restricted:
- public route no longer checks or inherits admin permissions
- public delete no longer hard-deletes appointments; it soft-cancels by setting `status: 'canceled'`
- public update only accepts appointment-facing fields such as service/date/time/worker/add-ons/coupon/status
- admin delete remains only under `/api/admin/appointments/:id` with admin permission

## Important compatibility note
Public appointment cancel still accepts appointment id only because the current frontend calls:

```js
DELETE /api/appointments/:id
```

without sending a client session token or clientId in the body. This phase intentionally preserves customer cancel behavior, but reduces damage by changing public delete from hard-delete to soft-cancel.

A future authentication cleanup should add a signed client session or cancel token so public edit/cancel can prove client ownership.

## Validation performed
- Syntax check passed for changed files:
  - `backend/controllers/client/clientcontroller.js`
  - `backend/controllers/client/appointmentcontroller.js`
  - `backend/routes/client/clients.js`
  - `backend/routes/client/appointments.js`
- Relative `require(...)` path check passed across backend.
- Public routes now reference only client controllers.
- Admin routes still reference admin controllers.

## Remaining related cleanup
Do not remove these yet unless explicitly planned:
- default last-4 PIN legacy
- SMS audit/6AM/date-time guard legacy
- automatic Rakeb worker migration
- service-level legacy price field
- hardcoded/default Thursday deal compatibility
- gift card admin route mounted outside `/api/admin`

## Recommended next phase
Phase 3 should clean SMS fallback/safety layers only after testing reminders carefully. The best order is:
1. preserve current confirmed booking and confirmation SMS behavior
2. add/confirm date-time validation logs
3. verify reminders for several realistic appointments
4. then remove temporary audit-only/copy/6AM fallback layers one by one
