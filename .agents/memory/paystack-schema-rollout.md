---
name: Paystack schema rollout
description: Safe behavior while Paystack billing tables are being added or are temporarily unavailable.
---

During a Paystack schema transition, billing operations must fail closed without taking down unrelated application access. Readiness is a read-only catalog check with a short unavailable cache and must recover without a restart.

**Why:** Production schema changes are applied by the publishing flow rather than startup DDL, so old-schema application instances can run while the new billing tables are absent.

Signed provider events received in that window must be durably recorded in the existing billing-events store and replayed after readiness returns. Replay must claim records exclusively, mark completion only after the existing idempotent handler succeeds, and use bounded backoff so one poison event cannot starve later events; malformed records remain explicit manual-review items.

**Why:** A 200 response stops provider retries, while an unbounded or blocking replay queue can silently leave later renewals and lifecycle events unsettled.

**How to apply:** Any new Paystack provider path or scheduled reconciliation must use the same readiness boundary; preserve the existing settlement and identity safety rules during replay.