CREATE TABLE IF NOT EXISTS "account_blob_cleanup_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "blob_name" text NOT NULL UNIQUE,
  "status" text NOT NULL DEFAULT 'queued',
  "attempt_count" integer NOT NULL DEFAULT 0,
  "last_error_code" text,
  "next_attempt_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "completed_at" timestamp,
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "account_blob_cleanup_jobs_queue_idx"
  ON "account_blob_cleanup_jobs" ("status", "created_at");

CREATE TABLE IF NOT EXISTS "account_deletion_audit" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "outcome_code" text NOT NULL,
  "aggregate_counts" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "blob_cleanup_count" integer NOT NULL DEFAULT 0,
  "created_at" timestamp NOT NULL DEFAULT now()
);

-- Safe if an early version of this migration was applied during development.
ALTER TABLE "account_deletion_audit" DROP COLUMN IF EXISTS "deleted_user_id";
ALTER TABLE "account_deletion_audit" DROP COLUMN IF EXISTS "deleted_workspace_id";