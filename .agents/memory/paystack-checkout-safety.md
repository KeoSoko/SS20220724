---
name: Paystack checkout safety
description: Durable ownership and concurrency rules for starting or settling Paystack checkout.
---

Covered editor/viewer membership must take precedence over ownership of the user's private workspace when resolving who controls billing.

**Why:** Invited members intentionally keep their private workspace, so checking workspace ownership first lets them bypass owner-managed billing.

**How to apply:** Any billing UI, checkout route, callback, or access check must use the same member-first billing-owner decision.

Generic checkout must fail closed while an existing paid subscription or unresolved renewal can still settle. Checkout and renewal entitlement changes must serialize on the same owner-level boundary.

**Why:** If an automatic renewal can settle after a manual recovery window opens, two distinct valid provider charges can both succeed. The approved flow may not automatically cancel or alter the existing provider subscription.

**How to apply:** Do not offer a second generic checkout for active, paid-grace, paused, failed, or past-due recurring states; retire competing pending attempts when another verified payment wins.

Server-issued checkout identity includes immutable commercial terms, not only a reference.

**Why:** A public checkout client can alter amount, plan metadata, currency, or customer fields. A server reference alone does not prove what was purchased.

**How to apply:** Snapshot the expected plan, amount, currency, provider plan code, owner email, and reference; require the verified provider transaction to match all of them before ledger or entitlement writes.

A local checkout TTL must never rotate the provider reference by itself.

**Why:** A “transaction not found” verification response does not prove that an already-open provider popup can no longer settle the old reference. Replacing it could expose two independently chargeable references.

**How to apply:** Refresh or block the same reference until provider-side invalidation is authoritative; never mint a replacement from local expiry alone, and reject settlement of retired references.

A provider-success renewal received after local cancellation intent must fail closed to financial review until the cancellation-grace policy is explicitly decided.

**Why:** Automatically reactivating extends entitlement against the user's recorded cancellation, while silently dropping a successful provider charge creates an untracked financial exception. Neither outcome is safe to guess.

**How to apply:** Serialize cancellation and settlement on the owner lock; if cancellation wins, record a manual-review event without ledger or entitlement mutation. Keep the separate cancellation-grace policy task as the place to choose any future automated behavior.

Manual Paystack identity reconciliation is also a billing-state mutation and must use the same owner-level transaction lock as checkout, webhook, and renewal processing.

**Why:** A separate lock lets a repair validate “no pending checkout” or “no conflicting identity” while another billing action commits exactly that state, making the repair's snapshot stale before its write.

**How to apply:** Acquire the shared owner-level billing lock before loading the repair snapshot, and hold it through revalidation, identity insertion, and audit logging. Do not introduce a repair-only lock namespace.