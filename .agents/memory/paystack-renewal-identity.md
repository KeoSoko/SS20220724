---
name: Paystack renewal identity
description: Provider-shape and safety rules for matching and recovering Paystack subscription renewals.
---

Paystack subscription listing must be filtered with the numeric customer ID obtained by fetching the stored `CUS_*` code. Passing the customer code directly can return no subscriptions even when they exist.

**Why:** Live provider responses showed that fetched subscriptions expose full invoice events in `invoices_history` and transaction-shaped entries in `invoices`. They can also return multiple same-plan subscriptions in `attention`, so selecting the newest one would be an unsafe guess.

**How to apply:** Prefer exact known `SUB_*` history. For missed-webhook recovery, verify references from `most_recent_invoice`, `invoices_history`, or `invoices`. Accept a recovered identity only when one viable candidate exists or exactly one candidate is active. Keep access while identity is ambiguous and offer hosted-checkout recovery without stored-card charging.

Support may resolve an ambiguous identity only from read-only provider candidates that exactly match the stored customer and plan code, after explicit confirmation. The selected list `SUB_*` code must match the detailed record before persistence; record the acting admin in the same identity audit transaction.

**Why:** Customer-level Paystack lists can contain old same-plan subscriptions, and an inconsistent provider detail must not turn an explicit choice of one `SUB_*` into a different local identity. Support resolution is an ownership decision, not a payment or cancellation action.

**How to apply:** Fail closed when the local Paystack plan code is absent, provider detail lookup fails, a candidate’s detail mismatches customer, plan, or `SUB_*`, or confirmation is not literal. Provider calls in this flow stay limited to customer and subscription reads; preserve access while it remains unresolved.