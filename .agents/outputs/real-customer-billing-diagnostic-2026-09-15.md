# Real Customer Billing Diagnostic — Sean Costello, Julie Briggs, Tiaan Kroese

Date: 2026-09-15
Scope: Three live support tickets, diagnosed against production code (git `main` @ `cf2cb82`,
matching what is actually deployed on Replit — verified via the Repl's own `git log`) and
read-only production Postgres queries + the Paystack dashboard. No code, data, or Paystack
state was changed while gathering this evidence.

This supersedes an earlier pass of this diagnostic that was mistakenly run against a stale
GitHub `main` (28 commits behind production). All findings below are re-verified against the
actual deployed code.

---

## 1. Sean Costello — seanc@audioscapes.co.za — registration fails with HTTP 400

**Ticket:** "I've downloaded the app and tried to register but keep getting a fail alert with '400'"

**DB evidence:** Zero rows in `users` for this email (confirmed via direct query). His
registration has never succeeded — this is not a display bug, no account exists.

**Root cause candidates, ranked, from the real `/api/register` handler**
(`server/auth.ts:781-823`):

The endpoint validates, in order, and returns 400 on the first failure:

1. `attributionVisitorId` (if the client sends one at all) must pass `isAttributionVisitorId()`
   — `server/auth.ts:788-791`. Unlikely to be Sean's issue unless the mobile client sends a
   malformed value here.
2. **`agreedToTerms === true` AND `agreedToTaxDisclaimer === true`, both booleans, both
   required** — `server/auth.ts:793-799`. This is the most likely candidate: it's a newer,
   app-wide legal-acknowledgement gate. If the mobile app build doesn't include this consent
   step, or sends it as a string/omits it, every mobile registration attempt would fail this
   way regardless of what the user enters.
3. `password` must pass `strongPasswordSchema` (`shared/schema.ts:917-932`): 8–64 chars, at
   least one lowercase, one uppercase, one digit, (likely also a special character —
   truncated in this pass, re-check `shared/schema.ts` around line 933). A weak password
   chosen on mobile would fail here — but this is user-specific, not systemic.
4. `insertUserSchema.safeParse({username, password, email, fullName})` — `server/auth.ts:810-823`.
   Any username/email format constraint here would also produce this 400.

**What's needed to pin this down exactly:** the JSON body of the 400 response includes an
`error` and `field` key (e.g. `field: "agreedToTerms"`) that identifies exactly which check
failed. Ask Sean to screenshot the actual error text if possible, or reproduce it. In the
absence of that, **check candidate #2 first** — audit whatever native/mobile client build
Sean used and confirm it actually sends `agreedToTerms: true` and `agreedToTaxDisclaimer: true`
in the POST body. This is not part of the web client behavior review in this pass; the mobile
client's source was not located in this repository during this diagnostic.

**Not a billing bug.** Unrelated to any of the Paystack/subscription work.

---

## 2. Julie Briggs — julie@mountainevents.co.za — "payment went through, now it's asking me to subscribe again"

**DB evidence:**
- `user_subscriptions`: `status = 'trial'`, plan is the free trial plan, trial ran
  2026-07-15 → 2026-08-14 (expired a month before her ticket), `total_paid = 0`, no
  `paystack_reference` / `paystack_customer_code` / `authorization_code`.
- `payment_transactions`: zero rows.
- `billing_events`: only two automated trial-expiry-warning emails (Aug 11, Aug 13).
- `paystack_checkout_attempts`: one row — id 3, `status: pending`, R49.00, created
  2026-09-01 07:12 UTC, `expires_at` 07:42 UTC same day, `completed_at: null`. Still `pending`
  two weeks later at time of this diagnostic.

**Paystack dashboard evidence (ground truth for what actually happened to her money):**
- The Sep 1 transaction (reference `ss_srv_407_e9d79a080df74b2aca4b1e1e`) is marked
  **Abandoned** — "The transaction was not completed." Event log shows she reached the 3D
  Secure authentication step and did not complete it.
- Her Paystack customer record shows **0 successful / 4 total attempts, R0.00 total spend**
  across two dates: 3 attempts on Aug 18, 1 on Sep 1. **She has never been charged.**

**Root cause: not a lost-payment bug.** Despite her belief that a payment "went through,"
there is no successful charge on either side (local DB or Paystack). Her card is failing 3D
Secure / bank authentication on every attempt. The system correctly shows her as needing to
subscribe, because she genuinely hasn't paid. **No reconciliation or manual subscription
activation is warranted or safe here** — activating her subscription now would violate "never
activate a subscription using unverified/failed payment data."

**Two real, smaller bugs found regardless (not the cause of her ticket, but worth fixing):**

1. **Only 1 of her 4 real Paystack attempts has any local trace at all.** The three Aug 18
   attempts never created a row in `paystack_checkout_attempts`. If one of those had
   succeeded, there would have been no local record to detect it against. Needs
   investigation into why those three attempts didn't create checkout-attempt rows — check
   whichever checkout-initiation code path was used that day vs. the current one.
2. **Stale `pending` checkout attempts only get resolved reactively.** Confirmed in
   `server/billing-service.ts:3676` (`closePaystackCheckoutAttemptAfterDefinitiveNonPayment`)
   and its caller at `server/routes.ts:4466-4468`: this only runs when the *same user*
   attempts *another* checkout and the system finds a reusable pending attempt. There is no
   background job that sweeps expired `pending` attempts, so a customer who never retries
   (like Julie, until this ticket) leaves a permanently stale row. Not dangerous, but noisy
   for any future audit and worth a scheduled cleanup job.

**What to tell Julie:** her card is not completing her bank's authentication step. Ask her to
try a different card, or contact her bank about 3D Secure / OTP delivery. If she retries
checkout in the app now, the stale Sep 1 attempt will be correctly detected and closed out
automatically (verified in code — see `server/routes.ts:4452-4468`).

---

## 3. Tiaan Kroese — tkroese@fs4p.co.za — User ID 385 — can't find where to update his card

**DB evidence:**
- `user_subscriptions`: `status = 'paused'`, plan `monthly`, `total_paid = 4900` (R49,
  matching his one successful Aug 15 charge), `paystack_reference: ss_1786786041765_e4r8p4uyi`,
  `paystack_customer_code: CUS_se82raj4v40zfft`, `authorization_code: AUTH_ytbmp5yplv`.
- `payment_transactions`: id 161 completed R49.00 on 2026-08-15 (his original charge); id 188
  **failed** R49.00 on 2026-09-15 (today, the renewal), `failure_reason: "Paystack
  subscription status is attention"`.
- `paystack_subscription_identities`: `status: active`, **`recurring_readiness: ready`**,
  `authorization_reusable: true`, `provider_verified_at: 2026-09-02`. This is stale — it still
  says "ready" despite the renewal failing on Sep 15, three days later. Nothing in the
  renewal-failure path updates this row's `recurring_readiness`, which is a secondary bug
  worth flagging (it means anything that trusts this row's "ready" status, elsewhere in the
  code, is being told his card is fine when it just failed).

**Root cause, confirmed against the real, deployed `getPaystackRenewalStatus()`**
(`server/billing-service.ts:5298-5368`):

```
if (subscription.status === "paused") {
  return { state: "payment_failed", recoveryCheckoutEligible: false, managementLinkEligible: false };
}
```
— `server/billing-service.ts:5304-5306`.

This check runs **before** the function ever looks at `identity.recurringReadiness`. So a
paused subscription is unconditionally assigned `renewalState: "payment_failed"` — never
`"payment_method_needs_attention"`, regardless of what the Paystack identity record says.

In the client (`client/src/pages/subscription-page.tsx`):
- `paymentMethodNeedsAttention` is `true` only when `renewalState === 'payment_method_needs_attention'`
  (line 247). For Tiaan this is always `false`.
- The **real** "Update payment method" button, which calls `managePaymentMethodMutation` and
  opens Paystack's actual hosted card-update page, is gated on
  `paymentMethodNeedsAttention && statusData?.renewalManagementLinkEligible` (lines 665,
  772-773). Tiaan never reaches this.
- Instead, because `paymentActuallyFailed` is true (his `status === 'paused'` satisfies that
  independently), he falls through to a generic button that is *labeled* "Update payment
  method" but actually calls `handleSubscribe()` — i.e. it starts an entirely new checkout,
  not a lightweight card update. This button also only exists inside the plan-comparison
  cards on the subscription page — there is no persistent "manage payment method" entry
  anywhere in account settings.

This is exactly what Tiaan described: he found *something* once (during his original Aug 15
checkout), and cannot relocate a dedicated "manage my card" option now, because one was never
actually surfaced to him — the real one requires a `renewalState` his account can never reach
from a `paused` status.

**Fix needed:** `getPaystackRenewalStatus()` should not short-circuit `paused` straight to
`payment_failed` — it should still consult `identity.recurringReadiness` (and ideally
refresh/re-verify it against Paystack rather than trusting the stale `ready` value) to decide
between `payment_failed` (genuinely needs a new checkout / manual review) and
`payment_method_needs_attention` (a working, reusable authorization exists — send them to the
real Paystack management link instead of a full new checkout). Given the existing identity
row already shows `authorization_reusable: true`, Tiaan is very likely a case that should
route to the real management-link flow.

**Immediate stopgap for Tiaan specifically, without a code change:** if
`createPaystackSubscriptionManagementLink()` (`server/billing-service.ts:1794`) returns
`{ outcome: "ready", url }` for his user id, that URL can be handed to him directly as a
one-off support action — it is read-only/verify-only by the function's own contract ("never
creates a checkout, charges an authorization, cancels a subscription, or persists the URL").
This was not executed during this diagnostic (no code was run); confirm it working before
using it.

---

## Summary for handoff

| Customer | Bug? | Root cause | File(s) |
|---|---|---|---|
| Sean | Yes (likely) | Registration 400 — most likely a missing/misconfigured `agreedToTerms`/`agreedToTaxDisclaimer` legal-acknowledgement gate in whatever mobile client he used | `server/auth.ts:793-799` |
| Julie | No (customer-side) | Card fails 3D Secure on every attempt; system correctly reflects no payment. Minor: 3 of 4 attempts left no local trace; stale `pending` rows only clean up reactively | `server/billing-service.ts:3676`, `server/routes.ts:4452-4468` |
| Tiaan | Yes (confirmed) | Paused subscriptions are hard-routed to `payment_failed`, never `payment_method_needs_attention`, so the real Paystack card-update link never surfaces — only a full-new-checkout button does | `server/billing-service.ts:5304-5306`, `client/src/pages/subscription-page.tsx:247,665,772-773` |

Priority for a fix pass: Tiaan's case first (confirmed, active, affects any paused
subscriber trying to self-serve a card update), then Sean's (blocks new signups from one
client surface), then the two minor Julie-adjacent gaps (checkout-attempt tracing gap,
reactive-only stale-attempt cleanup).
