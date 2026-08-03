# Rakie Salon Full E2E Regression Test Script

This package adds a comprehensive regression runner:

```bash
npm run test:e2e:full -- --base-url=http://localhost:5000
```

Or let the script start the backend itself:

```bash
npm run test:e2e:full:start
```

## What it validates

The script validates the newest worker/role/dashboard/system-error architecture end to end:

- Backend health endpoint
- Admin login happy path and wrong-password failure
- Auth-protected dashboard rejection without token
- Rakeb G default worker migration
- Role and permission CRUD
- Protected role delete failure
- Service/add-on create, edit, suggested add-ons, delete
- Chemical-service flags
- Worker/stylist create, edit, profile photo, bio, specialties, service prices and durations
- Worker chemical-permission filtering on customer stylist selection
- Default Rakeb G delete protection
- Client admin create, edit, details, phone lookup, duplicate failure, delete
- Client signup OTP/PIN flow using a known seeded OTP
- OTP wrong-code failure
- Client PIN login and reset flow
- Deal/coupon create, edit, worker/tier targeting, archive/delete
- Appointment create, worker pricing snapshot, add-on price, coupon discount, status edit, client appointment list, delete
- Online booking disabled fallback and re-enabled booking happy path
- Availability blocking for booked worker time
- Admin dashboard, reports, export
- Owner/admin system error window list and resolve
- Store hours update/restore
- Gift card create/search/redeem/update/delete and failure paths
- SMS/date-time helper fallback checks, including `810` minutes = `1:30 PM`
- Twilio inbound unsigned webhook safety behavior

## Safety behavior

The script is safe by default:

- It refuses non-local URLs unless `RAKIE_E2E_ALLOW_REMOTE=true`.
- If it starts the backend itself, it strips Twilio environment variables unless `RAKIE_E2E_ALLOW_SMS=true`.
- If you test an already-running server and your shell has Twilio env vars, it refuses unless `RAKIE_E2E_ASSUME_SERVER_SMS_SAFE=true`.
- It creates only E2E-tagged data and deletes only records it created.
- Use `SKIP_CLEANUP=true` when you want to inspect test records manually.

## Recommended local run

From the backend folder:

```bash
cp .env.example .env  # if needed
# Make sure MONGO_URI and JWT_SECRET are set.
npm install
npm run test:e2e:full:start
```

## Run against an already-running local backend

```bash
npm run test:e2e:full -- --base-url=http://localhost:5000
```

## Run against staging only

```bash
RAKIE_E2E_ALLOW_REMOTE=true \
RAKIE_E2E_ASSUME_SERVER_SMS_SAFE=true \
npm run test:e2e:full -- --base-url=https://your-staging-backend.example.com
```

Do not run this against production unless you intentionally want temporary E2E test records created and then removed.
