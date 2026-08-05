# Client family booking rules

- A signed-in client can load linked family members from `GET /api/clients/:id/family?phone=...`.
- A client can link an existing client or create a new family profile through `POST /api/clients/:id/family`.
- New family profiles use the last four phone digits as a temporary PIN and must change it when signing in.
- Online family booking is limited to two selected people per transaction.
- Each selected person receives a separate appointment record.
- Appointments are scheduled sequentially with the selected service, stylist, date, and starting time.
- Every online family appointment is created as `pending` for salon confirmation.
- The backend verifies every submitted client belongs to the booking owner's linked family list.
- Larger groups or different-service family visits must be coordinated by phone.
