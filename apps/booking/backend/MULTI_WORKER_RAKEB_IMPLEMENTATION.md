# Rakie Salon Multi-Worker / Role / Stylist Pricing Implementation

## Main decision implemented

The current service prices are treated as **Rakeb G's Master Stylist prices**, not generic base prices.

During the migration seed:

1. Staff roles are created if missing: Owner, Admin, Manager, Stylist, Front Desk, Assistant.
2. Rakeb G is created/updated as the protected default worker:
   - Display name: Rakeb G
   - Tier: Master Stylist
   - App role: Admin
   - Online bookable: yes
   - Chemical services: yes
   - Default/protected worker: yes
3. Every current service is assigned to Rakeb G.
4. Each current service `price` is copied into Rakeb G's worker-service `price`.
5. Each current service `duration` is copied into Rakeb G's worker-service `duration`.
6. Existing clients missing `assignedStylistId` are assigned to Rakeb G.
7. Existing appointments missing `workerId` are assigned to Rakeb G and receive a price snapshot when possible.

## Pricing rule

New booking price comes from selected worker + selected service.

Order:

1. Worker-service price and duration are required for booking.
2. Service `price` remains for legacy/menu compatibility and migration seeding.
3. Optional `startingPrice` is display-only and should not be the final booking price.

## New backend models

- `models/worker.js`
- `models/staffrole.js`

Updated models:

- `models/service.js`
- `models/appointment.js`
- `models/client.js`
- `models/admin.js`
- `models/promotiondeal.js`

## New backend routes

- Public customer stylist list: `GET /api/workers?serviceId=...`
- Admin staff control: `/api/admin/workers`
- Roles and permissions: `/api/admin/workers/roles`
- Migration button endpoint: `POST /api/admin/workers/migrate-rakeb`

## Frontend additions

- New admin panel: `Admin -> Staff / Workers`
- Role/permission editor
- Worker profile editor with photo, bio, specialties, experience, chemical permission, online visibility, and worker-service pricing
- Customer service flow now shows stylist cards with photo/bio/price/duration
- Admin appointment modal has stylist selection
- Admin appointment table has stylist and price columns and a stylist filter
- Client dashboard shows stylist and price for appointments

## Safety rules

- Rakeb G cannot be deleted/deactivated through the worker delete endpoint.
- Workers with appointments are deactivated instead of hard-deleted.
- Existing SMS wording was not intentionally changed in this pass.
- The old `Service.price` field was preserved to avoid breaking older screens.

## Next recommended phase

The role and permission structure is in place and login now returns role/permission data. The next deeper phase should add strict backend permission middleware to every admin route after confirming Rakeb/Admin can never be locked out.
