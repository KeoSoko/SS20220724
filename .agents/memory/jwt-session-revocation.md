---
name: JWT session revocation
description: The durable contract linking browser bearer tokens, Passport sessions, logout, and device-limit records.
---

Every newly issued JWT must carry a random `jti`, and the matching active-session record must persist that exact identifier. JWT middleware, linked Passport sessions, logout, and device-limit eviction must all validate or revoke the same identifier. Do not create an unrelated random database token.

**Why:** A session table that stores a token the browser never presents makes logout and device limits appear to succeed while copied or older bearer JWTs remain valid.

**How to apply:** For any authentication issuance or revocation change, confirm the issued JWT's `jti` is persisted, checked on authenticated requests, revoked on logout/failure, and included in session-limit tests. Legacy JWTs without a `jti` may retain their compatibility path.