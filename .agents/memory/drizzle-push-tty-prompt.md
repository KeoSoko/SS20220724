---
name: drizzle db:push interactive prompt blocker
description: Why `npm run db:push` can hang/block in this repl and how to apply schema columns safely.
---

`npm run db:push` (drizzle-kit push) can block on an interactive raw-TTY prompt that
does NOT read piped stdin (`printf '\n' | ...` and `--force` both fail to dismiss it).

The recurring trigger here is a PRE-EXISTING drift unrelated to most tasks: schema.ts
declares `unique().on(receipts.userId, receipts.clientUploadId)` but the dev DB lacks
that constraint, so every push prompts "add the constraint without truncating / truncate
the table?" on the 7500+ row receipts table.

**How to apply schema changes when this blocks you:**
- For purely additive columns, apply them directly to the dev DB with idempotent
  `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` (via the executeSql sandbox). Keep
  schema.ts as the source of truth — Replit's Publish flow diffs schema.ts against prod,
  so additive columns still propagate on deploy.
- Do NOT blindly force the push through; choosing the constraint option risks failing
  on duplicate rows and could abort the whole push (including your columns).

**Why:** schema.ts is authoritative for prod publish; the receipts-constraint prompt is
orthogonal drift outside billing/most tasks and must not be "fixed" as a side effect.
