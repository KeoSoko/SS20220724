---
name: Background job lease fencing
description: Concurrency rule for long-running jobs whose leases can expire and be reclaimed.
---

Long-running background jobs must fence every lease renewal and terminal state change to the exact claimed attempt. Outputs must also be attempt-specific until a fenced completion publishes their identity.

**Why:** A heartbeat can fail or the event loop can stall long enough for another worker to reclaim a job. Without fencing, the stale worker can renew the new worker's lease, overwrite its output, or change its status.

**How to apply:** Whenever a leased job can outlive one lease period, include immutable attempt ownership in heartbeat, completion, and failure predicates; treat zero updated rows as ownership loss; never let stale attempts publish to a shared output path.