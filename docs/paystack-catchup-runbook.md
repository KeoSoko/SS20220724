# Guarded R49 renewal catch-up

This feature is **disabled by default**. It does not run at startup or from a customer screen.
No schema migration or new worker is needed. Existing durable billing events and payment-reference uniqueness are used.

## Release gates

1. Run automated billing/admin tests and TypeScript compilation.
2. Exercise preview, charge, verification, reconciliation, and replay against a dedicated Paystack **test** subscription and an isolated development database. Confirm exact provider invoice shapes and reference-not-found responses. Do not use a live customer as the contract fixture.
3. Review the changes, including the webhook reserved-reference branch and durable claims. Do not deploy/enable the feature solely because unit tests passed.
4. After deliberate deployment, set `PAYSTACK_ADMIN_CATCHUP_ENABLED=true` and `PAYSTACK_ADMIN_CATCHUP_USER_IDS=385` **only in the authorized production runtime**. Existing production credentials remain in secret storage. Never copy keys to chat or logs.

## Tiaan's preview

An authenticated administrator sends `POST /api/admin/users/385/paystack-catchup/preview`:

```json
{ "subscriptionId": 354, "invoiceCode": "INV_gzra1vypqqbmmz0" }
```

Preview fetches the canonical owner, one trusted identity, current live subscription/card, failed unpaid invoice, billing period, reference, and successful payment history. It accepts only a paused monthly ZAR 4900 account with no cancellation, pending checkout, or same-period successful R49 payment. Missing/ambiguous provider evidence fails closed.

Review the exact user, subscription, invoice, amount, reference, period end, and `ready_for_confirmation` outcome. The signed confirmation expires after five minutes. Re-preview if anything changes. Preview does not charge or create a durable attempt.

## Explicit confirmation

After human approval, send `POST /api/admin/users/385/paystack-catchup/execute` with the same target, `confirmed: true`, and the exact `confirmationToken` from preview. Never approve on behalf of the operator or put an authorization code in the body.

Execution rechecks all evidence, commits a durable owner-locked claim, submits **one** authorization charge with **no plan parameter**, and independently verifies its reference. It never creates/disables/modifies the provider subscription. It does not pretend the failed Paystack invoice itself was changed to paid; the separate catch-up transaction is linked to it in the local audit.

On `payment_and_access_applied`, independently verify the payment record, paused-to-active transition, and entitlement through the verified next provider date. The local stale failed-renewal billing date advances to that provider date; the provider schedule does not change. Turn the feature/allowlist off after the operation.

## Failure/recovery

- A claimed intent can **never** submit another charge, even after a timeout, crash, card decline, or settlement failure.
- `charge_result_unknown`: verify the stable reference. Do not use a different reference or blindly retry. An absent reference after a committed claim remains manual review: the server cannot distinguish a crash-before-charge from an in-flight provider request.
- `payment_not_successful`: no access is granted. Review with the customer; no automatic alternative checkout is created.
- `payment_received_settlement_review_required`: money was received but local state changed. Do not recollect. Investigate state and use an approved reconciliation operation.
- To recover after a network/database failure, preview again. `verify_previous_attempt_only` produces a fresh token. Execute only verifies/settles the original attempt; it cannot charge again.
- Catch-up `charge.success` webhooks are recorded, not passed into normal checkout/renewal activation. Administrator recovery is deliberately required after an interrupted execution.

Before any alternative collection, review both local history and Paystack for other successful payments, including manually collected or differently referenced payments. The R1 card-tokenization/refund flow is separate and must not be charged again.

Provider contracts: [Charge Authorization](https://paystack.com/docs/api/transaction/#charge-authorization), [subscription invoices and attention status](https://paystack.com/docs/payments/subscriptions/).
