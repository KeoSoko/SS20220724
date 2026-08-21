---
name: Paystack subscription_active state
description: Why unknown recurring_readiness must not map to reconciling, and the neutral state that replaced it.
---

## Rule
`recurring_readiness = 'unknown'` is the schema default for every new identity row. It must never be treated as an active reconciliation signal on its own.

**How to apply:**
- `unknown` + future billing + no `renewal_reconciliation_pending` event → `subscription_active` (neutral; shows "Subscription active")
- `unknown` + future billing + `renewal_reconciliation_pending` event exists → `reconciling` (genuine active check)
- `unknown` + overdue billing → fall through to setup-required / recovery-signal path
- `ready` → `automatic_renewal_active` (provider-verified; distinct from unknown)
- `not_ready` → `payment_method_needs_attention`

**Why:**
Before this fix, the else-fallback in `getPaystackRenewalStatus` returned `reconciling` for any readiness value other than `ready` or `not_ready`, including the `unknown` default. 10 of 13 affected active legacy customers had future billing dates — they were correctly paying and active, but the UI showed "Renewal being checked" indefinitely because their identity rows had never been provider-verified.

**Production baseline (2026-08-21):**
- 1 genuine `reconciling` user in prod (user 344): no identity row, has `renewal_reconciliation_pending` event, overdue billing. Still correctly shows "Renewal being checked".
- Legacy unknown customers with future billing: correctly show "Subscription active" after deploy.
