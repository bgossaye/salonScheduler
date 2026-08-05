# Appointment availability correction

- Only `booked`, `pending`, and legacy `confirmed` appointments block a stylist schedule.
- `completed`, `noshow`, canceled, and archived historical appointments no longer block future slot selection or final creation.
- Final database conflict checks use the same active-status definition as the availability endpoint.
