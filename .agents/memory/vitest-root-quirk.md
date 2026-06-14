---
name: vitest root quirk
description: vitest resolves its root to client/ here, so server tests need --root .
---

Running vitest in this repo picks up `vite.config.ts` (whose root resolves to `client/`),
so server-side tests under `server/*.test.ts` are NOT discovered by a bare `npx vitest run`.

**Run server tests with:** `npx vitest run --root . <path>`

**Why:** the only vite config is the frontend one; there is no separate vitest config and
package.json scripts cannot be edited. There is no `test` npm script.
