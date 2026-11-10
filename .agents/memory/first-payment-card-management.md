---
name: First-payment card management
description: Trust and availability decisions for first subscribers whose Paystack subscription identity arrives after settlement.
---

First purchases need the same durable, payment-linked delayed identity completion as upgrades, but must never initiate superseded-subscription retirement.

**Why:** Paystack verification can omit the subscription code, and its subscription webhook can arrive before or after settlement. Saving delayed-completion evidence only when an old plan exists leaves first subscribers permanently without management access.

**How to apply:** Require exact verified payment/subscription evidence or an unambiguous paid invoice linking the settled transaction. Customer, plan, and time matching alone is insufficient. Keep ordinary status reads local and non-mutating.

Card-management availability is separate from automatic-renewal readiness. Missing trusted details should be discoverable but disabled, with bounded local-status refresh and explicit retry/support guidance.

**Why:** A neutral or missing renewal-readiness snapshot does not mean a background check is running and does not authorize checkout as a card-update fallback.

**How to apply:** Preserve the release gate, owner boundaries, and provider/cancellation/trial exclusions. Never claim that a reconciliation is running solely because trusted identity is missing.
