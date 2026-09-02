CREATE TABLE IF NOT EXISTS "export_jobs" (
  "id" uuid PRIMARY KEY,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "parameters" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "file_name" text,
  "content_type" text,
  "blob_name" text,
  "result_summary" jsonb,
  "error_message" text,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "lease_expires_at" timestamp,
  "expires_at" timestamp,
  "started_at" timestamp,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS "export_jobs_queue_idx"
  ON "export_jobs" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "export_jobs_user_created_idx"
  ON "export_jobs" ("user_id", "created_at" DESC);
