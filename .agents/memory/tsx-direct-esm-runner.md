---
name: Direct ESM dry runs
description: How to invoke project TypeScript services directly when the Vite config uses ESM-only top-level await.
---

Use a temporary `.mts` runner and invoke it with `npx tsx /tmp/runner.mts`. Do not use `tsx -e` or the unsupported `--esm` flag for this project.

**Why:** `tsx -e` transforms eval code as CommonJS, which fails before application code loads when the project Vite config contains top-level await; this `tsx` version also rejects `--esm`.

**How to apply:** Keep the runner outside the workspace, import the service with an absolute workspace path, and print only redacted/summary results for read-only diagnostics.