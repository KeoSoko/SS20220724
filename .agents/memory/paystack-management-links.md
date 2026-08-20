---
name: Paystack management links
description: Verified hosted payment-method update link contract and remaining live-provider limits.
---

The documented Paystack hosted card-update link contract is `GET /subscription/{SUB_*}/manage/link` with Bearer secret authentication and a successful `{ status: true, data: { link } }` response. Treat all other shapes as unusable.

**Why:** Accepting undocumented response fallbacks or a non-Paystack URL could redirect a billing owner to an untrusted destination. The provider documentation does not specify lifetime, reuse, or single-use behavior.

**How to apply:** Require an HTTPS `paystack.com/manage/subscriptions/` link after exact local/provider canonical-relationship checks and a complete non-ambiguous provider inspection. Do not infer expiry or reuse semantics; validate them only against a safe non-customer test subscription. Link failures must remain non-mutating and never fall back to checkout or historical collection.