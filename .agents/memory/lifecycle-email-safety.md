---
name: Lifecycle email safety
description: Durable rollout, classification, idempotency, and failure-handling rules for lifecycle mail.
---

Lifecycle campaigns are versioned and default off behind a master flag plus a per-campaign flag. Only accounts created on or after the explicit rollout baseline may enroll; historical users require a separately designed backfill.

**Why:** Enabling a new scheduler against the full user table could create an immediate historical-email flood.

**How to apply:** Keep enrollment bounded and idempotent, preserve the campaign/version/user uniqueness rule, and never change defaults to enabled as part of ordinary feature work.

Marketing lifecycle mail honours opt-out, provider unsubscribe, bounce/complaint suppression, Johannesburg quiet hours, and a rolling frequency cap. Account-access verification remains transactional and does not consult marketing opt-out; existing reset, security, receipt, billing, and legal mail stays independent.

**Why:** Marketing preferences must prevent unwanted engagement mail without blocking account recovery or required transactional communication.

**How to apply:** Classify every campaign before adding it, and apply both enrollment-time and immediate pre-send eligibility checks.

Once an external send begins, a crash or network result with unknown acceptance moves the ledger row to an uncertain terminal state and it is never automatically retried.

**Why:** SendGrid cannot provide an atomic transaction with the local database; retrying an ambiguous request can duplicate mail.

**How to apply:** Reclaim stale pre-send claims only. Retry only explicit transient provider responses, and require manual review for uncertain rows.