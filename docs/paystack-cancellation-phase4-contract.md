# Paystack cancellation Phase 4 test-mode contract

Date observed: 2026-08-27

Baseline: `codex/paystack-cancellation-phase3` at `c56630b`

Safety checkpoint tag: `phase3-cancellation-safety-foundation`

This report records observed Paystack test-mode behavior. It does not enable a
production provider mutation. The API runner is explicit opt-in and is not part
of ordinary CI.

Paystack documents the fetch, enable, and disable endpoints, including the
required subscription code and email token, but not the repeated-disable error
taxonomy or read-after-write timing observed here. See the
[Subscription API](https://paystack.com/docs/api/subscription/) and
[Subscriptions guide](https://paystack.com/docs/payments/subscriptions/).

## A. Test fixtures created

- Original fixture: one uniquely labelled `SS_PHASE4_CONTRACT_*` hourly plan,
  one unique `example.com` customer, one ZAR 1.00 test transaction, and one
  test subscription.
- Webhook fixture: one uniquely labelled `SS_PHASE4_CONTRACT_WEBHOOK_*` hourly
  ZAR 1.00 plan and one subscription using the original disposable customer's
  test reusable authorization.
- Retry fixture: one uniquely labelled `SS_PHASE4_CONTRACT_RETRY_*` hourly
  ZAR 1.00 plan and one subscription using that same test authorization.
- All `SUB_*`, `CUS_*`, `PLN_*`, transaction references, email addresses,
  authorization codes, and `email_token` values are redacted.
- A built-in Paystack test checkout success simulation created the reusable
  authorization. No real card or funds were used. Paystack publishes its test
  payment mechanisms in the [Test Payments guide](https://paystack.com/docs/payments/test-payments/).

## B. Fetch Subscription observed contract

`GET /subscription/:code` returned HTTP 200 and `domain: "test"` for the exact
disposable fixture. Relevant top-level fields observed were:

```text
id, domain, status, subscription_code, email_token, amount,
cron_expression, next_payment_date, open_invoice, createdAt, cancelledAt,
integration, plan, authorization, customer, invoices, invoices_history,
invoice_limit, split_code, most_recent_invoice, metadata, payments_count
```

- `subscription_code` and `email_token` were present immediately before every
  successful disable.
- `customer.customer_code` and `plan.plan_code` were nested strings. These map
  directly to the application's canonical `CUS_*` and `PLN_*` identities.
- The customer and plan objects also carried `domain: "test"`.
- The authorization object included `authorization_code`, masked card
  metadata, `channel: "card"`, and `reusable: true`.
- `next_payment_date` was an ISO timestamp.
- The observed fetch had `createdAt` but no subscription `updatedAt` or
  `updated_at`, even though some Paystack documentation examples include
  `updatedAt`. Code must not require it.
- The subscription response included `cancelledAt`; it was absent/null while
  active and present after disable.

The safe identity validation is therefore:

```text
data.subscription_code === canonical SUB_*
data.customer.customer_code === canonical CUS_*
data.plan.plan_code === canonical PLN_*
data.domain === "test" (contract harness only)
```

## C. First disable observed result

Original fixture:

- Pre-fetch: HTTP 200, `active`, `domain: "test"`, exact SUB/CUS/PLN match,
  and `email_token` present.
- `POST /subscription/disable`: HTTP 200 in approximately 236 ms with
  `{ status: true, message: "Subscription disabled successfully" }`.
- Immediate GET, begun about 1 ms after the response: HTTP 200,
  `status: "non-renewing"`, `cancelledAt` present, `email_token` still present,
  and `next_payment_date` unchanged.
- Follow-up GETs at about 1.2, 5.2, and 15.2 seconds returned the same state.

Webhook fixture reproduced the contract:

- Disable request: 2026-08-27T13:57:54.855Z to
  2026-08-27T13:57:55.084Z (229 ms), HTTP 200.
- Immediate GET completed at 2026-08-27T13:57:55.284Z and already returned
  `non-renewing`, `cancelledAt` present, token present, and the unchanged
  `next_payment_date` of 2026-08-27T14:54:00.000Z.

## D. Webhook chronology

The receiver verified `x-paystack-signature` as HMAC-SHA512 over the exact raw
request bytes using the test secret. This is the same mechanism as the Simple
Slips webhook route and Paystack's documented signature mechanism. See
[Paystack Webhooks](https://paystack.com/docs/payments/webhooks/).

- Subscription creation emitted one signed `subscription.create` event about
  one second after provider creation.
- The successful disable emitted one signed `subscription.not_renew` event at
  2026-08-27T13:57:55.445Z: 361 ms after the disable response ended.
- The first receiver poll about 200 ms after the response was empty; the event
  was present at the one-second poll.
- Payload: `domain: "test"`, `status: "non-renewing"`, with exact identities at
  `data.subscription_code`, `data.customer.customer_code`, and
  `data.plan.plan_code`.
- Payload timestamps included subscription `createdAt` and the unchanged
  `next_payment_date`; no independent provider event-occurrence timestamp was
  observed.
- No duplicate appeared through the 60-second poll.
- No `subscription.disable` appeared in the first 60 seconds. Paystack's guide
  says `subscription.not_renew` is the immediate cancellation event and
  `subscription.disable` is sent on the next payment date.
- The later end-of-period `subscription.disable` lifecycle remains unresolved;
  Phase 4 did not wait for it because verified GET plus the signed
  `subscription.not_renew` already establish non-renewal.

## E. Repeated disable result

A second disable using the identical code and token returned HTTP 404 in about
186 ms:

```json
{
  "status": false,
  "message": "Subscription with code not found or already inactive"
}
```

The final GET remained `non-renewing` with the same `cancelledAt`. The disable
endpoint is therefore not idempotent-200. A 404 response alone is ambiguous;
an exact authoritative read is required to converge a retry safely.

## F. Wrong-token result

Disable with the exact disposable subscription and a fabricated token returned
HTTP 404 in about 230 ms with the same not-found-or-inactive message. Immediate
GET still returned `active`, with no `cancelledAt`, and no webhook was captured.

This is safely classifiable as definite non-mutation only when the follow-up
exact provider read proves the subscription is still renewable. The disable
response alone is not a sufficient classification signal.

## G. Missing/wrong subscription result

For a fabricated, syntactically valid test `SUB_*`:

- GET returned HTTP 404 with `Subscription not found`.
- Disable with a fabricated token returned HTTP 404 with
  `Subscription with code not found or already inactive`.

The GET taxonomy distinguishes a missing target. The disable taxonomy does not
distinguish missing, inactive, repeated, or wrong-token cases. In production,
this mismatch should fail closed to manual review rather than being treated as
successful cancellation.

## H. Read-after-disable reliability

Yes, in both observed test-mode disable cycles an immediate authoritative GET
proved that the subscription would not renew through the exact field:

```text
data.status === "non-renewing"
```

Paystack defines `non-renewing` as active but not charged on the next payment
date. Provider read or signed `subscription.not_renew`, whichever is verified
first, can therefore confirm `provider_non_renewing`. The POST response alone
must not confirm the state.

## I. Webhook retry behavior

Paystack documents hourly test-mode retries for up to 10 hours when a webhook
does not return 200. The isolated receiver supports an HMAC-verified, persisted
fail-once response without weakening signature validation.

- Retry fixture disable: HTTP 200 in 229 ms, from
  2026-08-27T14:07:45.257Z to 2026-08-27T14:07:45.486Z.
- Immediate GET: `non-renewing`, `cancelledAt` present, and unchanged
  `next_payment_date` of 2026-08-27T15:07:00.000Z.
- First signed `subscription.not_renew`: received at
  2026-08-27T14:07:45.820Z, 335 ms after the disable response, with exact nested
  identities, `domain: "test"`, and `status: "non-renewing"`.
- The receiver recorded the raw-body SHA-256 and returned HTTP 503 exactly once,
  persisting that fail-once state before responding.
- Paystack redelivered the event at 2026-08-27T14:12:13.204Z, approximately
  267.384 seconds after the first delivery. The receiver returned HTTP 200 on
  this second attempt.
- The retry's raw-body SHA-256 was identical to the first attempt. Therefore the
  entire payload was byte-for-byte identical, including the same exact
  subscription, customer, and plan identities, `domain`, `status`, `createdAt`,
  and `next_payment_date`.
- No independent event-occurrence timestamp existed in the observed payload.
  The payload timestamps therefore stayed the same because the complete body
  stayed the same; only the receiver's local receipt timestamp changed.
- This observed test-mode retry arrived much earlier than Paystack's documented
  hourly retry interval. Consumers must not depend on the documented interval
  for deduplication or scheduling.

## J. Race/timestamp evidence

- Local disable request start/end and webhook receipt timestamps establish
  ordering at Simple Slips, but are not provider event timestamps.
- `cancelledAt` appeared on the immediate post-disable provider read and is the
  closest observed provider-side cancellation timestamp.
- `next_payment_date` did not change and cannot represent cancellation time.
- Subscription `createdAt` identifies creation, not cancellation.
- Invoice and transaction shapes can expose `paid_at`, but no cancellation
  experiment established its ordering semantics against `cancelledAt` during
  an in-flight renewal.
- No reliable subscription `updatedAt` was observed.

Settlement policy should use the verified provider non-renewing confirmation
time and transaction/invoice `paid_at` as evidence, but any near-boundary or
contradictory ordering must remain financial/manual review until Paystack's
timestamp semantics are established.

## K. Changes required to the Phase 2/3 design

1. Allow either an exact authoritative provider GET returning `non-renewing` or
   a signed exact-identity `subscription.not_renew` event to transition an
   attempt to `provider_non_renewing`, whichever arrives first.
2. Do not wait indefinitely for a webhook after a successful disable when the
   immediate exact GET already confirms `non-renewing`.
3. Treat disable 404 as ambiguous. Re-fetch the exact target: converge success
   only for verified `non-renewing`; classify verified `active` as non-mutation;
   otherwise require manual review.
4. Do not expect `email_token` or `next_payment_date` to clear after disable.
5. Do not expect re-enable to recover a disabled subscription. The one observed
   attempt returned HTTP 400, `Subscription has been cancelled, and cannot be
   reactivated`; recovery requires a new subscription flow.
6. Do not require provider `updatedAt` for validation or race ordering.
7. The existing Simple Slips lifecycle confirmation is only partially
   idempotent. A repeated `subscription.not_renew` does not re-advance the
   cancellation-attempt state, but the route continues and can rewrite the
   local cancellation timestamp, append another `subscription_not_renewing`
   billing event, and send the administrator email again. Full webhook retry
   processing is therefore not yet side-effect-idempotent and must be fixed or
   explicitly accepted before Phase 4 is closed.

## L. Exact production implementation recommendation

Design only; no implementation is enabled in this phase:

1. Under the billing-owner lock, resolve exactly one active canonical local
   SUB/CUS/PLN relationship and one open cancellation attempt.
2. Fetch Paystack and verify exact provider SUB/CUS/PLN relationships before
   mutation. Never persist or log `email_token`.
3. Persist `provider_call_started` before sending disable.
4. Call disable once with bounded timeouts and record only redacted status,
   timing, and failure taxonomy.
5. Always perform an exact provider GET after any 2xx, timeout, transport error,
   or ambiguous 404.
6. If exact GET says `non-renewing`, atomically mark
   `provider_non_renewing` and set provider confirmation time. If exact GET says
   `active` after a definite 4xx, classify non-mutation. Otherwise use
   `provider_result_unknown` or `manual_review_required`.
7. Continue processing signed lifecycle webhooks idempotently. A later exact
   `subscription.disable` may advance to `provider_disabled`; duplicates must
   be no-ops.
8. Preserve paid access until the already-paid local billing-period boundary.
9. Keep the production mutation behind a disabled release gate until this
   design is implemented and separately reviewed.

## M. Validation

- Deterministic unit coverage encodes first-disable readback, repeated-404
  convergence, wrong-token non-mutation after active readback, and fail-closed
  domain/identity/state cases.
- The provider runner is explicit opt-in and refuses non-`sk_test_` keys,
  non-test domains, identity mismatches, non-disposable labels, missing tokens,
  or mutation without the literal acknowledgement.
- Focused Phase 3 tests, the new deterministic test, TypeScript check, build,
  and full suite were rerun locally after external cleanup.
- Focused result: 3 files, 16 tests passed.
- TypeScript: passed.
- Client and server production builds: passed. Existing Vite chunk-size and
  mixed static/dynamic-import warnings remain informational.
- Full suite: 27 files and 413 tests passed, 11 skipped; 10 suites could not
  load because this isolated local environment intentionally has no database,
  Azure, or OpenAI credentials. One pre-existing source-invariant assertion in
  `invite-accept-no-cancel.test.ts` also failed against the unchanged baseline.
  None of those failures touched the new provider-contract files. The focused
  cancellation suite is green.

## N. Safety confirmation

- Only Paystack test mode was touched.
- No production database was accessed.
- No live provider identity was used.
- No deployment occurred.
- No production mutation was performed.
- The production cancellation route still contains no reachable Paystack
  subscription-disable mutation.
- The Paystack Test webhook URL was restored to its exact prior empty value;
  the existing Live webhook URL was not changed.
- The Replit application and temporary receiver were left stopped. Temporary
  Replit workspace configuration was restored from `c56630b`; the ephemeral
  `/tmp/ss_phase4_webhook` directory was already removed by a Replit environment
  restart before the guarded deletion step ran.
- The temporary raw event capture is no longer recoverable. Only redacted
  contract findings are retained in this report.
