# Calendar and Time Availability Audit

## Canonical blocking statuses
Only these statuses reserve time:
- pending
- booked
- confirmed

Completed, no-show, canceled, and archived appointments do not reserve time.

## Corrections
1. Fixed `isActiveAppointmentStatus()` and Mongo status filters to use the canonical active list.
2. Excluded archived records from availability and final conflict checks.
3. Legacy appointments without a stylist now block only the default stylist, not every stylist.
4. Rejected invalid, zero, negative, or excessive availability durations.
5. Admin time choices now come from the same backend availability engine used by clients.
6. Admin availability requests include full duration, stylist, service, and edit `excludeId`.
7. Booked and worker-blocked admin slots are disabled instead of remaining clickable.
8. Added stale-response protection to admin and client availability requests.
9. Client family overlap checks now use the exact submitted combined duration, including add-ons and multiple services.
10. A selected client time is cleared if a refreshed authoritative response no longer marks it free.

## Boundary behavior
The overlap rule is half-open: `[start, end)`. Therefore an appointment ending at 11:00 does not conflict with another beginning at 11:00.

## Staff override behavior
The admin form continues to display times outside ordinary store hours as a deliberate staff override. Active appointments, stylist breaks, and approved stylist blocks remain unavailable.

## Validation performed
- Backend JavaScript syntax checks passed.
- Frontend JSX/JavaScript TypeScript parser checks passed with `--noResolve`.
