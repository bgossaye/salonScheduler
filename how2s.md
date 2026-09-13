# Rakie Salon — Development, Build, and Deployment HOWTO

This guide is based on the current Rakie Salon packages:

- `apps/site` — public Rakie Salon website (Create React App)
- `apps/booking/frontend` — booking/admin frontend (CRACO + React)
- `apps/booking/backend` — Express/MongoDB backend
- Production API used by the frontends: `https://rakie-backend.onrender.com`
- Production booking path: `/booking`

---

## 1. Expected local folder structure

Keep the project arranged like this:

```text
salon-booking-app/
└─ apps/
   ├─ site/
   │  ├─ package.json
   │  ├─ public/
   │  └─ src/
   │
   └─ booking/
      ├─ frontend/
      │  ├─ package.json
      │  ├─ public/
      │  └─ src/
      │
      └─ backend/
         ├─ package.json
         ├─ server.js
         ├─ public/
         ├─ routes/
         ├─ controllers/
         ├─ models/
         └─ utils/
```

### Important Windows extraction note

The backend package contains a **directory named `public/`**.

If your local backend folder already contains a **file named `public`**, Windows cannot create the `public` directory in the same location.

Before extracting/updating the backend:

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app\apps\booking\backend"
Get-Item .\public -ErrorAction SilentlyContinue
```

If `public` is shown as a file rather than a directory, rename or remove that file before extracting the backend package.

Do not delete a real `public` directory.

---

# 2. Prerequisites

Install:

- Node.js
- npm
- Git, if the project is managed through Git
- Access to the MongoDB database used by the backend

Check Node and npm:

```powershell
node --version
npm --version
```

---

# 3. First-time dependency installation

Run `npm install` separately in each package.

## Backend

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app\apps\booking\backend"
npm install
```

## Booking frontend

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app\apps\booking\frontend"
npm install
```

## Main website

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app\apps\site"
npm install
```

Normally, after `package-lock.json` is established and you want a clean reproducible install, you can use:

```powershell
npm ci
```

Do not run `npm ci` if you intentionally need npm to update the lock file.

---

# 3A. Preferred full development startup

For normal full-stack development, the preferred command from the **project root** is:

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app"
npm run dev:stack
```

This is the command currently used to start the development stack together.

The three-terminal commands documented below are the **manual/fallback method** for starting the backend, booking frontend, and main site separately.

> Note: the three component ZIPs supplied for this HOWTO contain their individual `package.json` files, but they do not include the root `package.json` that defines `dev:stack`. Therefore this guide records `npm run dev:stack` as the preferred root development command, while the exact orchestration behind that root script should be read from the repository root `package.json`.

---

# 4. Backend environment

The backend reads environment variables through `dotenv`.

At minimum, development requires the database and authentication/environment values needed by the features you are testing.

Important variables referenced by the current backend include:

```text
MONGO_URI
JWT_SECRET
PORT
NODE_ENV
ALLOWED_ORIGINS
DEV_ALLOWED_ORIGIN

TWILIO_ACCOUNT_SID
TWILIO_AUTH_TOKEN
TWILIO_FROM

GOOGLE_PLACES_API_KEY
GOOGLE_PLACE_ID

FRONTEND_BASE_URL
BACKEND_BASE_URL
PUBLIC_BOOKING_URL
PUBLIC_STAFF_BASE_URL
STAFF_PORTAL_BASE_URL
```

There are additional feature-specific SMS, email, E2E, retention, and admin settings in the backend.

Keep actual passwords, tokens, MongoDB URIs, Twilio credentials, and API keys out of source control.

---

# 5. Normal local development

The cleanest setup is three terminals.

## Terminal 1 — Backend

The backend dev script is:

```text
cross-env PORT=5000 NODE_ENV=development nodemon server.js
```

Run:

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app\apps\booking\backend"
npm run dev
```

Expected backend port:

```text
http://localhost:5000
```

Useful health check:

```text
http://localhost:5000/api/healthz
```

The backend also has a compatibility `/healthz` route that redirects to `/api/healthz`.

### Normal startup messages

You should see messages similar to:

```text
Server running on port 5000
MongoDB connected
```

Feature warnings such as Google Places billing errors do not necessarily mean the backend failed to start.

---

## Terminal 2 — Booking frontend

The booking frontend uses CRACO.

Run:

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app\apps\booking\frontend"
npm start
```

The default CRA development port is normally:

```text
http://localhost:3000
```

The booking app has:

```text
homepage: /booking
```

Its runtime `public/env.js` selects the API automatically:

- Localhost / LAN host → `http://<current-host>:5000`
- Production → `https://rakie-backend.onrender.com`

The frontend API helper automatically adds `/api`.

Example during local development:

```text
http://localhost:5000/api
```

### Development proxy

`src/setupProxy.js` also proxies:

```text
/api
/healthz
/ping
```

to:

```text
https://rakie-backend.onrender.com
```

unless `PROXY_TARGET` is overridden.

Because `public/env.js` supplies an explicit local API base when running locally, normal local browser requests are intended to use the local backend on port 5000.

---

## Terminal 3 — Main website

The public site uses Create React App.

Because the booking frontend normally takes port 3000, use port 3001 for the site:

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app\apps\site"
$env:PORT=3001
npm start
```

Open:

```text
http://localhost:3001
```

The backend currently permits localhost origins, including ports 3000 and 3001.

---

# 6. Local development from another device on the network

The booking frontend's `public/env.js` recognizes private LAN addresses such as:

```text
192.168.x.x
10.x.x.x
```

and points the browser to:

```text
http://<same-host>:5000
```

For example, if the development PC is:

```text
192.168.1.50
```

the booking frontend will attempt:

```text
http://192.168.1.50:5000
```

for the backend.

The backend CORS configuration allows localhost automatically, but a LAN browser origin may need to be explicitly allowed.

For one development origin, set:

```text
DEV_ALLOWED_ORIGIN=http://192.168.1.50:3000
```

For several origins, use `ALLOWED_ORIGINS`, for example:

```text
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:3001,http://192.168.1.50:3000,http://192.168.1.50:3001
```

Use your actual PC LAN IP.

You may also need to allow Node/port 5000 through Windows Firewall for LAN testing.

---

# 7. Development mode vs production build

## Development mode

Development mode gives you:

- hot reload
- source-level error output
- unoptimized JavaScript
- fast code/test cycle

Commands:

```powershell
# backend
npm run dev

# booking frontend
npm start

# site
npm start
```

Do not upload the development server itself to IONOS.

---

## Production build — booking frontend

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app\apps\booking\frontend"
npm install
npm run build
```

Output:

```text
apps\booking\frontend\build\
```

The current booking package is designed to be deployed under:

```text
/booking
```

Its `.htaccess` handles `/booking` SPA routes and prevents missing JS/CSS/assets from incorrectly returning `index.html`.

Deploy the **contents** of the booking `build` directory into the production `/booking` web directory.

Make sure the deployment includes:

```text
.htaccess
env.js
index.html
app-manifest.json
static/
```

Do not accidentally omit `.htaccess` because it is a hidden/dot file.

---

## Production build — main website

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app\apps\site"
npm install
npm run build
```

Output:

```text
apps\site\build\
```

Deploy the **contents** of that `build` directory to the main web root for:

```text
https://rakiesalon.com/
```

Make sure the root deployment includes its `.htaccess`.

The site runtime configuration currently points the API to:

```text
https://rakie-backend.onrender.com
```

---

# 8. Backend production behavior

The backend has no compile/build step.

Production starts with:

```powershell
npm start
```

which runs:

```text
node server.js
```

Development instead uses:

```powershell
npm run dev
```

which runs Nodemon on port 5000.

For a production host such as Render, use production environment variables rather than a checked-in `.env` file.

The backend source also knows the relative build locations:

```text
../frontend/build
../../site/build
```

Those paths correspond to the current monorepo layout.

---

# 9. HTTPS rules

Production frontend URLs should always use HTTPS.

Current production API:

```text
https://rakie-backend.onrender.com
```

Current public site:

```text
https://rakiesalon.com
```

Current booking app:

```text
https://rakiesalon.com/booking
```

The site and booking `.htaccess` files should contain the HTTPS redirect rule at the top of the deployed versions.

That means:

```text
http://rakiesalon.com
```

must redirect to:

```text
https://rakiesalon.com
```

and:

```text
http://rakiesalon.com/booking
```

must redirect to:

```text
https://rakiesalon.com/booking
```

Do not use `http://` production URLs inside React source, `env.js`, manifests, or production configuration.

`http://localhost...` and private-LAN HTTP URLs are normal for local development.

---

# 10. Clean rebuild procedure

Use this when a frontend behaves as if an old build is still present.

## Booking frontend

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app\apps\booking\frontend"

Remove-Item -Recurse -Force .\build -ErrorAction SilentlyContinue

npm run build
```

## Main site

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app\apps\site"

Remove-Item -Recurse -Force .\build -ErrorAction SilentlyContinue

npm run build
```

If dependencies themselves are suspected:

```powershell
Remove-Item -Recurse -Force .\node_modules
npm ci
npm run build
```

Use `npm install` instead of `npm ci` if the lock file is intentionally being updated.

---

# 11. Service worker / browser cache after deployment

Both apps contain files that can participate in browser caching.

After a production deployment:

1. Verify the new `index.html` is on the server.
2. Verify the correct `.htaccess` is present.
3. Verify `env.js` is current.
4. Verify the `/static/` assets match the new build.
5. Test in a private/incognito browser window.
6. If a device still shows an old build, clear that site's browser data/service worker and reload.

Do not solve a stale-build problem by changing production URLs back to HTTP.

---

# 12. Backend tests

The current backend package provides:

```powershell
npm test
```

Watch mode:

```powershell
npm run test:watch
```

Coverage:

```powershell
npm run test:coverage
```

Full E2E script:

```powershell
npm run test:e2e:full
```

E2E with the script starting the backend:

```powershell
npm run test:e2e:full:start
```

The latter uses:

```text
http://localhost:5000
```

by default.

Be careful with E2E environment settings that can permit real SMS or remote-system changes.

---

# 13. Quick daily development startup

## Preferred method

From the repository root:

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app"
npm run dev:stack
```

Use the manual three-window method below only when you want to run/debug the services separately or if `dev:stack` is unavailable.

## Manual fallback

Use three PowerShell windows.

### Window 1

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app\apps\booking\backend"
npm run dev
```

### Window 2

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app\apps\booking\frontend"
npm start
```

### Window 3

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app\apps\site"
$env:PORT=3001
npm start
```

Then use:

```text
Booking: http://localhost:3000
Site:    http://localhost:3001
API:     http://localhost:5000
```

---

# 14. Quick production build

### Booking

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app\apps\booking\frontend"
npm run build
```

Deploy:

```text
frontend\build\  →  rakiesalon.com/booking/
```

### Site

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app\apps\site"
npm run build
```

Deploy:

```text
site\build\  →  rakiesalon.com web root
```

### Backend

There is no frontend-style build step.

Production command:

```powershell
cd "C:\Users\Rakie\Documents\salon-booking-app\apps\booking\backend"
npm start
```

---

# 15. Before deploying — checklist

- [ ] Backend starts without a fatal error.
- [ ] MongoDB connects.
- [ ] `/api/healthz` responds.
- [ ] Booking frontend works locally.
- [ ] Main site works locally.
- [ ] Booking frontend production build completes.
- [ ] Main site production build completes.
- [ ] Site `.htaccess` is included.
- [ ] Booking `.htaccess` is included.
- [ ] Production `env.js` points to HTTPS API.
- [ ] `https://rakiesalon.com` loads.
- [ ] `https://rakiesalon.com/booking` loads.
- [ ] HTTP URLs redirect to HTTPS.
- [ ] Admin login route works.
- [ ] Public booking flow works.
- [ ] No production secrets were copied into frontend files.
- [ ] Test from a fresh/private browser session after deployment.

---

# 16. Common problems

## `EADDRINUSE`

A port is already occupied.

Check:

```powershell
netstat -ano | findstr :5000
netstat -ano | findstr :3000
netstat -ano | findstr :3001
```

---

## `EBUSY` or unable to watch `public.zip`

Nodemon/Windows is trying to watch a locked archive.

Do not keep deployment ZIP archives inside a directory Nodemon needs to watch if they cause local problems.

Move the ZIP outside the backend source tree, or configure Nodemon to ignore ZIP files for local development.

This is a local development/watch issue, not proof that the production server is broken.

---

## `public` cannot be created

Check whether the backend directory contains a **file** named `public`.

The source package expects:

```text
backend/public/
```

to be a directory.

Rename/remove the conflicting file before extracting.

---

## CORS blocked on phone/LAN

Add the actual development browser origin to `DEV_ALLOWED_ORIGIN` or `ALLOWED_ORIGINS`, restart the backend, and verify Windows Firewall permits the needed local ports.

---

## Google reviews `REQUEST_DENIED`

If the server reports that Google Places requires billing, the app may use its server-side backup/fallback, but live Google Places results require the appropriate Google Cloud project/API/billing configuration.

This does not by itself mean Express or MongoDB failed.

---

## Frontend still looks old after upload

Verify:

- the new build was actually uploaded
- `.htaccess` was uploaded
- `index.html` is new
- `env.js` is new
- hashed `static/` files correspond to the current build
- old browser/service-worker cache is cleared

---

# 17. Do not mix these commands

Use the command that belongs to the package you are inside:

| Package | Development | Production build/start |
|---|---|---|
| Repository root | `npm run dev:stack` | orchestration/development only |
| `apps/site` | `npm start` | `npm run build` |
| `apps/booking/frontend` | `npm start` | `npm run build` |
| `apps/booking/backend` | `npm run dev` | `npm start` |

The backend does **not** use `npm run build`.

The two React frontends do **not** use `npm run dev` in their current package files.

---

# 18. Recommended update workflow

When receiving a new package/version:

1. Back up the current working folder.
2. Confirm whether the package contains a `public/` directory before extracting.
3. Do not extract over a conflicting file named `public`.
4. Preserve your environment/secrets separately.
5. Run `npm install` or `npm ci`.
6. Start backend in development mode.
7. Start booking frontend.
8. Start the main site on port 3001.
9. Test locally.
10. Run both frontend production builds.
11. Upload only the intended production build output.
12. Keep HTTPS `.htaccess` files in their correct locations.
13. Test HTTP → HTTPS redirection.
14. Test booking and admin routes in an incognito/private browser.

---

_Last prepared from the Rakie Salon site, booking frontend, and backend packages dated September 12, 2026._
