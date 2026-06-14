---
name: Workspace seat capacity & over-capacity policy
description: How per-plan seat limits are enforced on invites/membership and what happens when an owner downgrades/expires.
---

# Workspace seat capacity

Capacity for a workspace = the **owner's** plan `maxSeats`, resolved through the
same deterministic, fail-closed path used for access (`getSubscriptionStatus(ownerId).seatCapacity`).
A workspace with an inactive/expired/missing owner subscription falls back to **1
seat (Solo)**. Seat math lives in `server/workspace-seats.ts` (`getWorkspaceSeatInfo`).

Seat model:
- Every workspace_members row (including the owner) occupies one seat.
- Each pending (unaccepted, unexpired) invite **reserves** a seat, so a workspace
  can never over-commit between invite-send and accept.
- `availableSeats = max(0, capacity - members - pendingInvites)`.

## Over-capacity policy (deliberate)
**Never auto-evict members.** When an owner downgrades or their subscription
expires, capacity falls (often back to 1) but existing members are retained.
This surfaces as `isOverCapacity = usedSeats > capacity`. The only consequence is
that **growth is blocked**: invite-send and invite-accept are refused until the
owner upgrades or removes members.

**Why:** silently kicking out collaborators on a billing lapse is destructive and
surprising. Blocking growth (not access) is the safe, reversible behavior.

**How to apply:** enforcement is at two gates in `server/routes.ts` —
POST `/api/workspace/invite` (checks `availableSeats <= 0`) and POST
`/api/workspace/accept-invite` (checks `usedSeats >= capacity` at accept time,
since a seat could have filled between send and accept). Both return HTTP 403 with
structured error `seat_limit_reached`.

## Upgrade path
`billingService.upgradeToPlanWithStoredAuth(userId, targetPlanId)` does a one-click
upgrade using the stored Paystack authorization (`charge_authorization`), then
atomically switches the local plan so capacity increases immediately. It refuses
non-upgrades (`not_an_upgrade` when target maxSeats <= current) and returns
`{ success:false, needsCheckout:true }` when there is no stored auth / no Paystack /
no existing subscription, so the caller falls back to full checkout. Route: POST
`/api/billing/upgrade` (owner-only, requireVerifiedEmail).

**Limitation (known):** the upgrade performs a one-time charge for the new tier
and flips the plan locally; it does NOT create a second Paystack subscription
(avoids double-charge). The next renewal is reconciled by plan code via the
existing webhook/reconciliation pipeline. If a Paystack-side subscription object
must reflect the new plan immediately, that reconciliation is a separate concern.
