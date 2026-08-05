# Single Stylist Shop Mode

Runtime settings:
- `booking.shopMode`: `auto` (recommended), `single`, or `multi`
- `booking.primaryStylistId`: optional worker ID when forcing `single`

Effective behavior:
- Auto + one active online-bookable worker => single-stylist UI
- Single => force simplified UI
- Multi => retain stylist selectors and simultaneous family booking

Single-stylist UI:
- Public booking hides stylist cards and selection controls.
- Family booking offers separate times or back-to-back only.
- Admin Appointments hides stylist filter and Stylist column.
- Admin appointment form hides stylist selector and auto-assigns the only worker.

The appointment still stores workerId/workerName internally.
