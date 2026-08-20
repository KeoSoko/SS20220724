# Junocars billing-date investigation — read-only

## Scope

This report records a read-only investigation of the billing-date discrepancy for
the approved billing owner and subscription. It contains no customer email,
provider identifiers, credentials, or payment authorization data.

No intentional database write, provider mutation, or Paystack request was made
by this investigation.

## Production finding

The production replica does **not** have the reported June date. Its current
local subscription is active and has:

- next billing date: **2026-08-23 06:00:20.934 UTC**
- last payment date: **2026-07-23 06:00:20.934 UTC**
- five completed local Paystack payments through July 23
- no active local Paystack subscription-identity row

The previously observed June date belonged to the development database's older
state. It must not be used as evidence of current production billing state.

## Local chronology supported by the production ledger and events

1. Successful local Paystack settlements occurred on March 23, April 23, and
   May 23. Each normal settlement advances the local date by one billing period.
2. The May 23 settlement therefore established the June 23 boundary.
3. A June 23 legacy `invoice.payment_failed` event was recorded with missing
   user metadata. No completed June payment was added to the local ledger.
4. On July 23, the local subscription was cancelled and then activated twice;
   two local completed R49 payments were recorded. The final July activation
   established the current local August 23 date.

There is no row-version history for `user_subscriptions`, so this is the
complete timeline only insofar as the local payment ledger and billing events
establish it.

## Root cause

The June date was a stale boundary in the development database following the
May settlement and failed June renewal. It was not a production value that had
reverted from August.

The difference is environment drift: production's July 23 legacy activation
path had already advanced production to August, while development retained the
older March–June history.

## Provider-date evidence

The supplied manual facts establish a surviving active monthly provider
relationship, but none of the supplied export/instruction artifacts includes a
provider-issued **future next-charge date**. The August date is a verified local
result of the July 23 settlement, not proof of Paystack's current scheduled
charge date.

No prospective billing-date repair is safe to propose without that provider
date. In particular, the approximate “around August 23” expectation must not
be treated as provider evidence.

## Reconciliation behavior

Production currently has a future local date, so its scheduler does not treat
this subscription as overdue.

If a local date is overdue:

- reconciliation can read the provider subscription and apply an already-paid,
  verified provider transaction to the local ledger;
- it cannot create checkout, charge a card, or mutate the provider;
- it can pause local access only after an exact-identity provider invoice is
  authoritatively unpaid or failed;
- unresolved or payment-required cases can produce recurring admin alerts;
- it never collects a historical June amount merely because a local date is
  old.

An active identity with `unknown` readiness is sufficient for the current
reconciliation code to inspect provider invoices; `unknown` does not itself
authorize a stored-card charge.

## Source evidence

- `server/billing-service.ts` — verified settlement advances local billing
  dates; overdue reconciliation selects active rows with past dates and acts
  only on provider invoice evidence.
- `server/subscription-middleware.ts` — active subscriptions retain access
  while renewal reconciliation is unresolved; unpaid exact-identity evidence
  is required before moving to payment-required state.

## Conclusion

No billing-date mutation is proposed or required from this investigation.
The production local date is already August 23; the authoritative provider
future charge date remains unproven.