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

## Post-merge setup must NOT run db:push

`scripts/post-merge.sh` runs automatically after every task merge with stdin closed and
a timeout. It must be non-interactive, idempotent, and non-destructive. It now runs
**`npm install` only** — db:push was removed.

Two independent reasons db:push is wrong here:
1. Constraint name drift: many unique constraints existed under Postgres-default `_key`
   names while schema.ts expects drizzle's `_unique` names, so push prompts to add them.
   (Resolved by renaming DB constraints to the `_unique` names + adding the missing
   `users_email_unique`; no duplicate data existed so all were safe.)
2. **Destructive legacy-column drift (the dangerous one):** the live `users` table still
   has ~14 legacy columns (timezone, language, currency, notification_preferences,
   tax_year_end, business_registration_number, vat_number, trial_ends_at, api_key,
   api_key_expires_at, last_backup_at, storage_used, max_storage_limit, preferences) +
   ≥1 legacy table that were intentionally migrated OUT of `users` into dedicated tables
   (userPreferences, businessProfiles, taxSettings, userSubscriptions). schema.ts no
   longer declares them, so db:push wants to DROP them — irreversible data loss for the
   real users. NEVER auto-force this; dropping legacy columns is a deliberate, human-
   approved migration, not a post-merge action.

The DB is shared/persistent across task environments (the app boots cleanly post-merge
without any push), so post-merge does NOT need to sync schema at all. Apply real schema
changes deliberately via SQL.
