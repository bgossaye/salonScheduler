# Family invitation hardening

- Existing independent clients are added as pending invitations, never immediate active links.
- Pending links cannot be booked, viewed, edited, cancelled, or included in family appointment submission.
- Invitees may accept, decline, or report a mistaken/unauthorized request.
- Declined invitations have a runtime-configurable retry cooldown (default 24 hours); reported invitations are blocked for staff review.
- Client-created no-phone profiles remain limited to verified minor-dependent rules.
- Profile editing authority is based only on `profileType=minor_dependent` plus matching `guardianClientId`, not relationship labels.
- No-phone minor profiles remain editable with `phone: null`.
- Minor dependents cannot be unlinked online; staff must transfer/close guardianship.
- Family-created unverified profiles have welcome offers voided and use a temporary last-four PIN.
- Existing-account invitation cards use the requester-entered name until accepted to avoid exposing the matched account name.

## Report / unblock workflow
- Reporting an invitation blocks the requester/invitee pair in both directions.
- Reports create a durable FamilyInvitationAudit record and an admin warning notification.
- Admin Client Profile shows active family-invitation blocks under Family Invitation Security.
- Authorized staff with clientsEditProfile can choose Allow Invitations Again.
- Unblocking does not reactivate the old invitation; it permits a brand-new invitation.
- The prior report remains in FamilyInvitationAudit. Existing legacy blocks are backfilled into the audit collection when first unblocked.
