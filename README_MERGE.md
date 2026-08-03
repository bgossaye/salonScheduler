# Merge guide — add marketing site + shared packages to your monorepo

This folder contains **only the new additions** for your workspace layout:

- `apps/site` — the marketing website (Vite + React + Tailwind + React Router)
- `packages/ui` — shared UI components (Header, Footer, CTAbar, SkipToContent, MobileStickyActions)
- `packages/tokens` — shared constants and (optional) CSS tokens

> Your existing app lives at `apps/booking` (with `frontend` and `backend`) — nothing here overwrites it.

## 1) Move these folders into your repo
Copy the following folders into your existing `salon-booking-app` root:
```
apps/site
packages/ui
packages/tokens
```

## 2) Update your **root** package.json for workspaces (if not already)
In `salon-booking-app/package.json`, ensure you have:
```jsonc
{
  "private": true,
  "workspaces": ["apps/*", "packages/*"]
}
```
> If you already use pnpm/yarn workspaces, keep your existing config; just include these globs.

## 3) Install deps from the repo root
```bash
# from salon-booking-app/
npm i
# or: pnpm i
```

## 4) Run the marketing site
```bash
# from repo root
npm run --workspace site dev
# or with pnpm:
pnpm --filter site dev
```
Open http://localhost:5173

## 5) (Optional) Use shared UI in booking app
In your booking frontend, install the workspace packages:
```bash
npm i @rakie/ui @rakie/tokens
```
Import the shared components or constants, e.g.:
```jsx
import { Header, Footer } from '@rakie/ui'
import { PHONE } from '@rakie/tokens/js'
```

## Notes
- Tailwind is configured inside `apps/site`. Because `@rakie/ui` uses Tailwind class names, `apps/site/tailwind.config.js` includes a content path to `node_modules/@rakie/ui/**/*.{js,jsx}` for class detection.
- All “Book” CTAs point to `/booking` (your scheduler remains separate).
- You can later extract more shared components into `packages/ui` as needed.
