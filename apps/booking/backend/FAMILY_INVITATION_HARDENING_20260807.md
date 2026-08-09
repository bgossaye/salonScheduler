# Family Invitation Hardening — 2026-08-07

Implemented without changing the normal customer invitation flow:

- Family-management endpoints now require a signed client JWT; phone number possession is no longer authorization.
- Client JWTs are issued after successful PIN login and after OTP-backed PIN setup/reset.
- Family batch booking verifies the authenticated booking owner and active `canBook` family permissions server-side.
- Public invitation endpoints use no-store/no-cache, no-referrer, and no-index headers.
- Public invitation page adds no-referrer and no-index meta policies while open.
- Invitation read/action and send/resend endpoints are rate limited (higher development limits for local testing).
- Production cannot print invitation bearer URLs even if a debug environment variable was accidentally left enabled.
- Accept/decline/report updates are applied to both family-link records inside MongoDB transactions, preventing double-response races and split pair state.
- Expired invitation bearer token hashes are cleared every six hours.
- Audit history now supports invited, resent, accepted, declined, reported, canceled, decline_override, and unblocked events; bearer tokens are never written to audit records.
- Existing admin unblock/decline-override routes remain permission protected and now record the decline override explicitly.

Deployment note: clients whose browser already had an old pre-hardening `client` localStorage session but no `clientToken` will need to sign in once again. New logins store the token automatically; normal UI flow is unchanged afterward.
