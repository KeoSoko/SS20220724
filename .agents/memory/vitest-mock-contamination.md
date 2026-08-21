---
name: Vitest mockImplementationOnce contamination
description: How chained mockImplementationOnce calls leak between tests when code paths return early without consuming all queued mocks.
---

## Rule
`vi.fn().mockImplementationOnce(...)` calls queue up. If the code under test returns early (e.g., a guard returns false before reaching a later query), unused mocks remain in the queue and are consumed by the next test's calls — silently corrupting results.

**Why:** This bit us when `hasSuccessfulRecurringSettlementEvidence` tests set up 2 `mockImplementationOnce` calls (activation + failure) but the "no activation" branch returned early after consuming only the first. The leftover failure mock was consumed by the next test's first `db.select` call.

## How to apply
- Prefer spying on private methods to control boolean return values rather than mocking every sequential `db.select` call the private method makes.
  - E.g., `vi.spyOn(service as any, "hasSuccessfulRecurringSettlementEvidence").mockResolvedValue(true)` instead of chaining 3 db.select mocks.
- When you MUST mock individual `db.select` calls inside a private method (unit testing it directly), set up exactly as many `mockImplementationOnce` calls as the code path will consume — no more.
- For early-return paths, only set up the mocks that are actually reached.
- If the queue gets out of sync, `vi.mocked(db.select).mockReset()` clears it but also clears the default implementation (the `emptySelect` factory is not accessible outside the `vi.mock` closure).
