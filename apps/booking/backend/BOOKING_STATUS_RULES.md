# Appointment creation status rules

- Client online booking: `pending`
- Client online multi-service booking: `pending`
- Owner/admin/manager/front-desk creation: `booked`
- Stylist creating on another stylist's calendar: `pending`
- Stylist creating on their own calendar: `booked`
- Confirm (`CNF`) on a pending appointment: updates status to `booked`

Creation endpoints determine status server-side and do not trust a submitted creation status.
