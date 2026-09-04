---
name: Protected-flow browser mocks
description: Reliable non-mutating browser QA for authenticated pages with JWT validation and many background reads.
---

For non-mutating browser QA of authenticated flows, establish one validated authenticated browser context and reuse it across viewport and route checks. Avoid repeatedly creating synthetic-token contexts.

**Why:** Client-side JWT decoding and concurrent background queries can clear synthetic auth or trigger error boundaries before route mocks settle. A working context remained stable across desktop/mobile and route navigation, while fresh synthetic contexts were intermittent.

**How to apply:** Use a structurally valid, non-expired JWT; intercept every required background read with the exact response shape; abort unrecognized mutations; navigate through the app in the same context; and resize that context for responsive checks.