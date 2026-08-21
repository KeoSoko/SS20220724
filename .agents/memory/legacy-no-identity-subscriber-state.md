---
name: Legacy no-identity subscriber state
description: Covers the design for paying customers who have no paystack_subscription_identities row (legacy cohort) and how to surface the correct billing state for them.
---

## Rule
When `getPaystackRenewalStatus` finds no identity row and billing is future-dated:
1. Check for `renewal_recovery_manual_review` / `renewal_reconciliation_pending` signals first — these take precedence.
2. Call `hasSuccessfulRecurringSettlementEvidence` — returns true when there is at least one `subscription_activated` event newer than any `subscription_failed` event.
3. Evidence present → `{ state: "subscription_active", recoveryCheckoutEligible: false }`.
4. No evidence → `{ state: "renewal_setup_required", recoveryCheckoutEligible: false }`.

**Why:** 33 active legacy customers had their charges processed but never had an identity row created (pre-dated the server-side identity recording flow). Their billing UI showed "Renewal needs review" with a disabled button. 2 users (7 and 100) have zero activations and should stay on `renewal_setup_required`.

**Critical constraint:** `recoveryCheckoutEligible` is ALWAYS false for the no-identity future-billing path — setting it true risks creating a duplicate Paystack subscription for a customer who is already paying.

## Safe identity recovery
`attemptSafeLegacyWebhookIdentityRecovery(data, renewalEvidence)` handles `charge.success` webhooks that have a `subscription_code` but no known identity row. Three gates must all pass:
1. Subscription code not already owned by any row.
2. Exactly one local active subscription matches the customer code (no ambiguity).
3. No active identity already exists for the resolved user.

If all pass: records identity via `recordPaystackSubscriptionIdentity` with `allowNewActive: true`. Never opens checkout or charges the customer.
