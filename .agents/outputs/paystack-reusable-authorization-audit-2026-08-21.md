# Paystack Reusable Authorization Enforcement Audit
**Date:** 2026-08-21  
**Scope:** Investigation only — no production mutations  
**Status:** COMPLETE

---

## A. Current Subscription Checkout Architecture

Simple Slips uses a **client-side Paystack SDK** flow, not a server-side `transaction/initialize` call. The sequence is:

```
Customer selects plan
→ POST /api/billing/paystack/checkout (routes.ts:4075)
    • Resolves billing owner (billing-owner.ts)
    • Guards: active subscription, existing identity, paused/failed status, provider subscription count
    • Inserts paystack_checkout_attempts row (billing-service.ts:2264-2279)
    • Returns {reference, amount, currency, planCode, email} to client
→ Client opens Paystack frontend SDK popup with {reference, plan: PLN_*, amount, currency, email}
→ Paystack processes payment — auto-creates SUB_* because plan is included
→ Customer completes / abandons popup
→ POST /api/billing/paystack/subscription (routes.ts:4276)  [client callback]
    OR Paystack webhook POST /api/billing/paystack/webhook (routes.ts:4477)
→ BillingService.verifyPaystackTransaction(reference) → paystack.transaction.verify
→ extractPaystackAuthorizationEvidence(data) → reads authorization.reusable
→ BillingService.processPaystackSubscription → records identity + readiness under advisory lock
```

---

## B. Exact Paystack Initialization Payload

The server does **not** call Paystack `transaction/initialize`. It only inserts a local DB row.

Fields returned to the client (routes.ts:4254-4268):
```json
{
  "status": "created" | "reused",
  "checkout": {
    "attemptId": <number>,
    "reference": "ss_srv_<userId>_<hex>",
    "expiresAt": "<ISO timestamp>",
    "billingOwnerUserId": <number>,
    "planId": <number>,
    "planName": "premium_monthly",
    "planCode": "PLN_8l8p7v1mergg804",
    "amount": 4900,
    "currency": "ZAR",
    "billingPeriod": "monthly",
    "email": "<owner email>"
  }
}
```

The client passes these to the Paystack SDK. `planCode` (PLN_*) causes Paystack to create `SUB_*` automatically at payment time.

**No `channels` restriction is included in this payload.**

---

## C. Current Allowed Payment Channels

**All Paystack-supported channels are currently permitted.** No server-side restriction is applied. The checkout payload does not include a `channels` filter. Whatever channels Paystack presents in its popup — card, Apple Pay, bank transfer, USSD, etc. — are all accessible.

---

## D. Whether Reusable-Channel Filtering Exists

**No reusable-channel filtering exists.** The channel the customer uses is not known to Simple Slips until `transaction.verify` is called after payment.

```
PAYSTACK_REUSABLE_CHANNEL_FILTER_REQUIRES_PROVIDER_CONFIRMATION
```

The Paystack frontend SDK popup configuration may accept a `channels` array to restrict visible payment methods. Whether that parameter (a) works at the popup/inline level, (b) prevents Apple Pay from appearing, and (c) is the correct mechanism for reusable-authorization enforcement must be confirmed against current Paystack documentation before implementation.

---

## E. Historical `authorization.reusable` Handling

**Before the recurring-readiness work:**

- The legacy path called `createPaystackSubscription` (billing-service.ts:1086) which called `paystack.subscription.create({customer, plan, authorization: null})` and did not retrieve or inspect `authorization.reusable`.
- After a successful Apple Pay initial payment, Simple Slips:
  1. Recorded the payment as successful
  2. Activated the subscription
  3. Set `paystackReference` and `paystackCustomerCode`
  4. Made **no** check of `authorization.reusable`
  5. Assumed future automatic renewal would succeed
- This directly produced the Antebellum pattern: Apple Pay success → SUB_* created by Paystack → all subsequent renewal attempts fail because the authorization is not reusable.

**Historical invariant violated:**
```
payment_success was treated as recurring_ready
```

---

## F. Current `authorization.reusable` Handling

`extractPaystackAuthorizationEvidence` (paystack-renewal.ts:48-108) enforces:

```typescript
const reusable = authorization?.reusable;
const authorizationReusable = typeof reusable === "boolean" ? reusable : null;
```

- `reusable === false` → `recurringReadiness = "not_ready"` (line 78-85)
- `reusable === null` (JSON null) → `authorizationReusable = null` → `recurringReadiness = "unknown"` ✓
- `reusable === undefined` (missing) → `authorizationReusable = null` → `recurringReadiness = "unknown"` ✓
- `reusable === true` + customer code present + authorization bound to subscription → `recurringReadiness = "ready"` (line 86-88)
- `reusable === true` but authorization NOT bound to subscription → `recurringReadiness = "unknown"` (not ready)

**Paid access is preserved** regardless of reusability outcome — the payment is recorded and the subscription activated; only the recurring-renewal relationship is marked non-ready or unknown.

**No stored authorization charge occurs** — `legacyStoredAuthorizationChargesEnabled()` is permanently `false` (billing-service.ts:943-952).

**No automatic recovery checkout** is created when readiness is `not_ready` or `unknown`.

All authorization fields are persisted:
- `payment_transactions.provider_authorization_reusable` (billing-service.ts:2777)
- `paystack_subscription_identities.authorization_reusable` (schema.ts:461)
- `authorization_code`, `authorization_channel`, `authorization_signature` (billing-service.ts:2774-2776)

---

## G. When Paystack Creates the SUB_*

Paystack creates the `SUB_*` **during the payment popup**, when the client SDK processes a transaction that includes a `plan` parameter. This happens:

1. Before the customer's payment result is returned to Simple Slips
2. Before Simple Slips calls `transaction.verify`
3. Before Simple Slips reads `authorization.reusable`

Simple Slips first learns about the SUB_* and the authorization reusability when `transaction.verify` returns the full response.

---

## H. Whether Reusability Can Be Verified Before SUB Creation

**No.** This is a fundamental architectural constraint of the current flow.

The SUB_* already exists in Paystack before Simple Slips can inspect `authorization.reusable`. Simple Slips cannot prevent SUB_* creation when the customer uses a non-reusable payment method in the current plan-checkout flow.

The correct future design separates these:

```
Phase 1 — Verify payment method
  Initialize Paystack transaction WITHOUT plan
  Customer pays
  Verify → read authorization.reusable
  If reusable !== true: do not proceed to subscription

Phase 2 — Establish subscription (only if reusable)
  Call paystack.subscription.create with the verified authorization_code
  SUB_* is created only for verified-reusable authorizations
```

**This architectural change is not implemented in this task.**

---

## I. Root Cause of Antebellum Duplicate SUB Creation

**April 26:**
- Customer (`corinne.nk@gmail.com`) completed a Paystack checkout using Apple Pay
- Paystack auto-created `SUB_vv41mb6cjuhd66y` (plan included in checkout)
- Simple Slips (pre-hardening) activated the subscription without checking `authorization.reusable`
- Subsequent renewal attempts (May 26, Jun 26, Jul 26) all failed — Apple Pay authorization was not reusable by Paystack's recurring debit mechanism

**July 2:**
- Customer initiated a recovery checkout (renewal recovery path)
- Pre-hardening code lacked a locked provider inspection that checks whether any non-terminal provider subscription already exists for this customer
- A second checkout was permitted → customer used Apple Pay again
- Paystack auto-created `SUB_w76gwzmclvkq313`
- Same non-reusable authorization pattern → Aug 2 renewal also abandoned
- Result: two `attention` SUB_*s, neither renewable

**Two compounding failures:**
1. `authorization.reusable` not checked on first checkout (pre-hardening)
2. No locked provider subscription count check before permitting recovery checkout (pre-hardening)

---

## J. Current Protection Against Recurrence

**Layer 1 — Local identity check under advisory lock** (billing-service.ts:2180-2194):
- Active `paystack_subscription_identities` row → `checkout_blocked: renewal_relationship_available`

**Layer 2 — Locked provider reinspection** (billing-service.ts:2196-2222):
- After acquiring lock 36, calls `loadPaystackSubscriptionCandidates`
- Any non-terminal provider subscription count > 0 → `checkout_blocked`
- Provider inspection failure → `checkout_blocked: renewal_recovery_required`
- Proven by test: "fails closed when the locked provider reinspection finds a subscription" (paystack-checkout-attempt.test.ts:280-313)

**Layer 3 — Subscription status block** (billing-service.ts:2235-2243):
- `paused`, `payment_failed`, `past_due` → `checkout_blocked: renewal_recovery_required`

**Layer 4 — Route-level recovery guard** (routes.ts:4136-4159):
- `recoverPaystackRenewalRelationship` runs before checkout creation
- `manual_review_required` or `reconciling` → 409 before any attempt row is created

**Layer 5 — One-pending-per-owner deduplication**:
- `onConflictDoNothing` + partial unique index → never mints a second reference for same owner

---

## K. Apple Pay-Specific Findings

### Proven
- Current code enforces capability-based `authorization.reusable` check, not channel-based (paystack-renewal.ts:76-88)
- Apple Pay with `reusable=false` → `recurringReadiness = "not_ready"` (tested)
- Apple Pay with missing/null authorization → `recurringReadiness = "unknown"` (tested)
- Apple Pay with `reusable=true` but no subscription binding → `recurringReadiness = "unknown"` (tested)
- All authorization fields are preserved for diagnostics even when `not_ready`

### Strongly indicated
- Apple Pay authorizations provided by Paystack in Simple Slips' current subscription plan flow appear not to supply `reusable=true`: 25 successful Apple Pay transactions across 21 customers, zero confirmed subsequent automatic renewals
- Both Antebellum Apple Pay transactions (Apr 26, Jul 2) produced authorization codes that failed every subsequent recurring attempt

### Unknown
- Whether Apple Pay **can** provide `reusable=true` in any Paystack subscription configuration
- Whether Paystack's channel restriction (`channels` parameter) would effectively exclude Apple Pay from the popup
- Whether an Apple Pay authorization issued in a non-plan (one-time) flow would behave differently

**Do not conclude:** `Apple Pay can never recur` — the correct question is whether the authorization Paystack returns for Apple Pay in this configuration has `reusable === true`.

---

## L. Recommended Checkout Architecture

**Current (problematic):**
```
1. Client passes plan: PLN_* to Paystack popup
2. Paystack creates SUB_* during payment
3. Simple Slips discovers authorization.reusable afterward via transaction.verify
4. If not reusable: SUB_* already exists, authorization unusable for recurring debit
```

**Recommended future design (two-phase):**
```
Phase 1 — Collect and verify payment method
  Initialize Paystack transaction WITHOUT plan parameter
  Customer completes payment
  Server calls transaction.verify → reads authorization.reusable
  If reusable !== true:
    - Record payment
    - Do NOT proceed to subscription creation
    - Inform customer their payment method cannot support automatic renewal
    - Offer alternative payment method or manual-only billing

Phase 2 — Create subscription only for verified-reusable authorizations
  Call paystack.subscription.create with the verified authorization_code
  SUB_* created only when authorization.reusable === true is proven
  Record identity with recurringReadiness = "ready"
```

This eliminates orphaned, unrenewable SUB_* entries and prevents the duplicate-subscription failure mode.

**Implementation risk:** This requires significant checkout architecture changes and must not break existing card-based recurring customers. Do not implement without a separate authorized implementation task.

---

## M. Whether an Interim Apple Pay Recurring-Checkout Gate Is Recommended

**YES — recommended but not implemented in this task.**

Rationale: Until Paystack confirms that Apple Pay can supply `reusable=true` in Simple Slips' plan-checkout flow, permitting Apple Pay to initiate new recurring subscription relationships continues to produce non-renewable SUB_*s and `attention` subscriptions.

**Proposed interim gate:**
- Restrict new recurring subscription checkout initialization to channels that have demonstrated reusable authorization support (i.e., standard card)
- Mechanism: pass a `channels` array in the data returned to the client, excluding `apple_pay`
- Scope: new recurring subscription checkout only
- Does NOT apply to: existing Apple Pay subscriptions, existing customer access, one-time payments

**Constraints (from task specification):**
- Must not cancel existing Apple Pay subscriptions
- Must not alter existing customer access
- Must not refund, collect, or modify historical transactions
- Must not be implemented until separately authorized

**Blocker before implementation:**
```
PAYSTACK_REUSABLE_CHANNEL_FILTER_REQUIRES_PROVIDER_CONFIRMATION
```
Confirm with Paystack documentation that the `channels` parameter in the frontend SDK popup config excludes Apple Pay from the payment method list before implementing.

---

## N. Existing Apple Pay Customer Remediation Strategy (Planning Only)

**Do not modify any existing customer records.**

Safe classification for existing Apple Pay customers without a proven reusable authorization:
- `RECURRING_READINESS_UNKNOWN` — if no provider inspection has established the authorization is non-reusable
- `PAYMENT_METHOD_ATTENTION` — if provider evidence shows `attention` status on the provider subscription

These customers should NOT be automatically classified as failed subscriptions. Their paid access remains valid.

**Antebellum (`corinne.nk@gmail.com`) specifically:**
- Two provider subscriptions (`SUB_vv41mb6cjuhd66y`, `SUB_w76gwzmclvkq313`), both `attention`
- Neither mapped to a proven reusable authorization
- Classification: `VIABILITY_UNKNOWN` for both
- Required action: manual provider review to determine which (if either) subscription is viable and whether any authorization is reusable
- Do not start recovery checkout until one subscription is confirmed viable and renewable

**Broader Apple Pay cohort:**
- 21 customers with confirmed Apple Pay initial payments
- Remediation path: manual provider inspection per customer, then either:
  - If `reusable=true` proven: record identity with appropriate readiness
  - If `reusable=false` proven: classify `PAYMENT_METHOD_ATTENTION`, present renewal checkout (with reusable-channel restriction active)
  - If unresolvable: manual review required

---

## O. Tests and Validation

### Existing coverage (all passing)

**`server/paystack-recurring-readiness.test.ts`** (8 tests after additions):
- Apple Pay `reusable=false` → `not_ready` ✓
- Apple Pay `reusable=undefined` (absent authorization) → `unknown` ✓
- Apple Pay `reusable=true` with subscription binding → `ready` ✓
- Card `reusable=false` → `not_ready` (channel-agnostic) ✓
- `reusable=true` bound to different subscription → `not_ready` ✓
- `reusable=true` without subscription binding → `unknown` ✓
- **NEW:** JSON `null` reusable → `unknown` (not `not_ready`) ✓
- **NEW:** Authorization fields preserved even when `not_ready` ✓

**`server/paystack-checkout-attempt.test.ts`** (8 tests):
- Active subscription → checkout blocked ✓
- Overdue active → checkout blocked (can still settle) ✓
- Locked provider reinspection finds subscription → checkout blocked ✓
- Active identity rechecked under lock → checkout blocked ✓
- `paused` status → checkout blocked ✓
- One-reference deduplication across 12 simultaneous sessions ✓
- Deliberate recovery checkout permitted only when provider confirms no existing relationship ✓
- Prospective amount only (no arrears aggregation) ✓

**`server/paystack-settlement-race.test.ts`** (5 tests):
- Checkout invalidated during in-flight verification → review event, no ledger write ✓
- Idempotent duplicate settlement ✓
- Stale renewal rejected after new checkout ✓
- Trusted renewal accepted ✓
- Lifecycle stale subscription identity ✓

### Test gaps (not addressed in this investigation task)

1. **Settlement integration:** An end-to-end test of `processPaystackSubscription` where `authorization.reusable=false` proves that (a) payment is recorded, (b) subscription is activated, (c) `recurringReadiness = "not_ready"` is persisted to the identity row, and (d) no recovery checkout is automatically created. This would require mocking the full DB write path.

2. **Channel-filter implementation test:** A test confirming that a future `channels` restriction in the checkout payload excludes non-reusable channels. Not implementable until the Paystack parameter is confirmed.

---

## P. Zero-Mutation Confirmation

```
Production DB writes:          0
Paystack charges:              0
Paystack subscriptions created: 0
Paystack subscriptions disabled/cancelled: 0
Checkouts created:             0
Refunds:                       0
Historical collections:        0
Customers contacted:           0
```

---

PAYSTACK REUSABLE AUTHORIZATION AUDIT COMPLETE — READY FOR REVIEW
