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
Plan upgrades go through **full Paystack checkout** (the same flow as a brand-new
purchase). The owner picks a higher-capacity plan, completes checkout, and the
`charge.success` webhook activates the new plan via deterministic plan-code
resolution. Capacity rises only after a real recurring subscription exists on the
new plan. Route POST `/api/billing/upgrade` (owner-only, requireVerifiedEmail) is
intentionally inert — it just returns `{ needs_checkout: true }`.

**Why one-click stored-auth upgrades are disabled:** the old path
(`upgradeToPlanWithStoredAuth`) did a one-time `charge_authorization` for the new
tier and flipped the local plan immediately, but never migrated the recurring
Paystack subscription. At the next renewal the webhook received the OLD plan code
and correctly reconciled the customer back to the old plan — silently reducing
seats and under-charging. That method is retained only for unit tests; do not wire
it back into any request path.

**Open follow-up (next phase, not yet built):** retiring/migrating the OLD Paystack
subscription on upgrade. Until that exists, an existing active subscriber who
re-checks-out to a higher plan can still be reverted by the old subscription's
renewal, and may briefly have two Paystack subscriptions. Trial users (no prior
recurring subscription) upgrade cleanly with no revert risk.
