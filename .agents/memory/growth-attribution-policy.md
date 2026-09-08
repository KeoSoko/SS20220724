---
name: Growth attribution policy
description: Durable privacy, attribution, and growth-metric semantics for acquisition reporting.
---

Use first-party attribution only. Keep first touch immutable, update latest touch only for a qualifying non-direct touch after a 30-minute session boundary, expire browser identity after 90 days, and attach only an opaque visitor UUID during registration. Honor GPC/DNT and exclude reliably identifiable admins and bots.

**Why:** Attribution is useful only if registration cannot forge campaign data and reporting does not create a shadow store of URLs, identifiers, or PII.

**How to apply:** Allow only the approved UTM fields, referrer host, landing path, and click IDs. Never retain full referrer URLs, arbitrary query parameters, fragments, email, or sensitive tokens.

Growth reporting starts at the explicit instrumentation baseline of 2026-09-08. Do not present pre-baseline visitor or attribution data as complete. Paid conversion requires a completed positive payment; trials do not qualify. Receipt activation/retention uses persisted receipt timestamps, and D1/D7/D30 denominators include only mature cohort members.

**Why:** Historical business records can support some downstream metrics, but visitor attribution did not exist before the baseline and immature cohorts would bias retention downward.

**How to apply:** Show numerator and denominator, mark unavailable evidence honestly, use local-calendar retention buckets, and keep paid receipt-depth segment denominators separate.