# Antebellum Paystack reconciliation — read-only investigation

## Environment and scope

Production was queried through the platform's read-only production replica.
No database write, provider request, checkout, entitlement change, or customer
communication was made.

## Local production state

The requested account is the resolved workspace billing owner. It has an active
Premium Monthly subscription with a local monthly billing boundary in early
August, no trusted local Paystack subscription identities, no checkout attempts,
and two completed local Paystack payments.

There are no local failed Paystack payment rows. This does not contradict
provider-side failed attempts: legacy webhook and transaction correlation was
incomplete for this account.

## Local timeline

- Late April: local trial expiry warnings, then a completed monthly payment and
  subscription activation.
- Late May: local renewal warnings for the expected monthly boundary.
- Early July: a system-originated local cancellation event is followed by a
  completed monthly payment and reactivation. This reset the local billing
  boundary.
- Late July/early August: local renewal warnings for the new boundary.

Local events do not establish whether either successful payment was a
customer-initiated checkout or a provider renewal. Local historical payment
metadata must not be used to infer the provider payment channel or reusable
authorization.

## Combined April–August evidence chain

| Period | Customer action / provider relationship | Provider transaction evidence | Local Simple Slips state | What is unproven |
| --- | --- | --- | --- | --- |
| 23–26 Apr | Provider relationship code is not supplied. | A successful R49 Apple Pay payment is supplied for 26 Apr. | Trial warnings precede a completed R49 local Paystack payment and subscription activation on 26 Apr. | Which provider subscription produced the payment, invoice association, and whether it was a customer checkout or a provider renewal. |
| 23–26 May | Provider relationship code is not supplied. | An unsuccessful R49 Card attempt is supplied for 26 May. | Renewal warnings were issued on 23 and 25 May; no failed local Paystack payment row or provider-linked billing event exists. | The subscription/invoice mapping and failure reason. |
| 26 Jun | Provider relationship code is not supplied. | An unsuccessful R49 Card attempt is supplied for 26 Jun. | No matching local payment, checkout, or provider-linked billing event exists. | The subscription/invoice mapping, initiation type, and failure reason. |
| 2 Jul | Provider relationship code is not supplied. | A successful R49 Apple Pay payment is supplied for 2 Jul. | A system-originated cancellation is recorded, followed the same day by a completed R49 local payment and subscription reactivation. | Whether the provider payment and local payment are the same transaction, which subscription produced it, and whether it was customer-initiated or recurring. |
| 26 Jul | Provider relationship code is not supplied. | An unsuccessful R49 Card attempt is supplied for 26 Jul. | No matching local payment, checkout, or provider-linked billing event exists. | The subscription/invoice mapping and failure reason. |
| 30 Jul–2 Aug | Provider relationship code is not supplied. | An R49 Card transaction on 2 Aug is supplied as `abandoned`, with “The transaction was not completed.” | Local renewal warnings were issued on 30 Jul and 1 Aug for the 2 Aug boundary; no matching local payment or checkout exists. | Whether the provider initiated it as a renewal, whether customer action was required, which subscription/invoice it belongs to, and why it became abandoned. |

## Supplied provider evidence

The supplied manual history states:

- two monthly provider subscription relationships exist and both are
  `attention`;
- successful Apple Pay payments occurred in late April and early July;
- unsuccessful Card attempts occurred in late May, late June, and late July;
- an early-August Card transaction was abandoned, with the provider message
  that the transaction was not completed.

The material does not identify either subscription code or map any transaction
to one of the two relationships. It does not supply creation dates, next-charge
dates, payment counts or revenue by relationship, invoice mappings, or
authoritative reusable-authorization evidence.

## Classification

- Attention reason for both relationships: `ATTENTION_REASON_UNPROVEN`
- Viability for each relationship: `VIABILITY_UNKNOWN`
- Canonical relationship: `NO VIABLE CANONICAL SUBSCRIPTION PROVEN`
- Duplicate-charge risk: `DUPLICATE_CHARGE_RISK UNKNOWN`
- Recommended recovery path: `MANUAL_PROVIDER_REVIEW_REQUIRED`

Apple Pay history and the existence of provider subscription records are not
evidence that either relationship can renew prospectively.

## Required next manual action

Obtain an authorized, read-only provider export or inspection that names both
subscription codes and maps each to its invoices/transactions, status, plan,
creation date, next-charge date, and authoritative authorization viability.
Until that evidence exists, do not attach an identity, disable either provider
relationship, generate a management link, or create a new checkout.

## Final operational guardrail

**DO NOT START NEW CHECKOUT — two provider subscription relationships are known
to exist, but neither can be mapped to the supplied transactions or proven
prospectively renewable. Starting recovery checkout before that inspection could
duplicate an unresolved provider relationship.**

## Historical payment policy

The April and July payments remain historical evidence only. No arrears,
collection, offset, or refund is proposed by this investigation.

ANTEBELLUM INVESTIGATION COMPLETE — NO MUTATION