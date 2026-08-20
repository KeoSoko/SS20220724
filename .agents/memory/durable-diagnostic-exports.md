---
name: Durable diagnostic exports
description: Reliable conversion of production read-only query payloads into internal diagnostic files in the durable CodeExecution runtime.
---

When a production query must return structured per-record diagnostic data for an
internal workspace file, encode each JSON row as PostgreSQL hex
(`encode(convert_to(..., 'UTF8'), 'hex')`) and decode it with
`decodeURIComponent` over percent-encoded byte pairs.

**Why:** The durable CodeExecution runtime used for these exports did not expose
`Buffer`, `atob`, or `TextDecoder`, and rejected `new Date()` without an
argument. Repeated alternatives failed after otherwise successful read-only
queries.

**How to apply:** Keep the database operation as a single `SELECT` against the
production replica. Avoid clock reads while transforming output; obtain a
timestamp from SQL or use a known task date. Write the resulting internal file
only after parsing succeeds, and never print customer-level payloads in chat.