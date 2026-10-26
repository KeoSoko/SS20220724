---
name: Background job lease fencing
description: Concurrency rule for long-running jobs whose leases can expire and be reclaimed.
---

Long-running background jobs must fence every lease renewal and terminal state change to the exact claimed attempt. Outputs must also be attempt-specific until a fenced completion publishes their identity.

**Why:** A heartbeat can fail or the event loop can stall long enough for another worker to reclaim a job. Without fencing, the stale worker can renew the new worker's lease, overwrite its output, or change its status.

**How to apply:** Whenever a leased job can outlive one lease period, include immutable attempt ownership in heartbeat, completion, and failure predicates; treat zero updated rows as ownership loss; never let stale attempts publish to a shared output path.

## Background failure isolation

Workers running inside the web process must contain rejected promises at the whole-run boundary, including job claims and failure-status writes, not just provider calls.

**Why:** Production database timeouts in background account cleanup escaped the worker and terminated the web process, causing intermittent availability failures unrelated to the requesting user's account.

**How to apply:** Keep durable jobs recoverable, release in-process running guards in `finally`, log sanitized failure codes, and test both startup and timer-triggered failures. Containment does not resolve the underlying database connectivity problem.