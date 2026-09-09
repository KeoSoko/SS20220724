CREATE TABLE IF NOT EXISTS "lifecycle_deliveries" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "campaign_key" text NOT NULL,
  "campaign_version" integer NOT NULL,
  "user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "status" text NOT NULL DEFAULT 'eligible',
  "eligible_at" timestamptz NOT NULL DEFAULT now(),
  "claim_at" timestamptz,
  "send_started_at" timestamptz,
  "sent_at" timestamptz,
  "suppressed_at" timestamptz,
  "failed_at" timestamptz,
  "retry_at" timestamptz,
  "audited_at" timestamptz,
  "attempt_count" integer NOT NULL DEFAULT 0,
  "error_class" text,
  "error_code" text,
  "due_at" timestamptz NOT NULL,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT "lifecycle_campaign_version_user_unique" UNIQUE ("campaign_key","campaign_version","user_id"),
  CONSTRAINT "lifecycle_delivery_status_check" CHECK ("status" IN ('eligible','claimed','sending','uncertain','retry','sent','suppressed','failed')),
  CONSTRAINT "lifecycle_delivery_attempt_check" CHECK ("attempt_count" >= 0)
);
CREATE INDEX IF NOT EXISTS "lifecycle_deliveries_status_due_idx" ON "lifecycle_deliveries" ("status","due_at");
CREATE INDEX IF NOT EXISTS "lifecycle_deliveries_claim_idx" ON "lifecycle_deliveries" ("claim_at");
CREATE INDEX IF NOT EXISTS "lifecycle_deliveries_user_idx" ON "lifecycle_deliveries" ("user_id");
CREATE INDEX IF NOT EXISTS "email_events_user_type_time_idx" ON "email_events" ("user_id","event_type","timestamp");

CREATE TABLE IF NOT EXISTS "lifecycle_preferences" (
  "user_id" integer PRIMARY KEY REFERENCES "users"("id") ON DELETE CASCADE,
  "marketing_opted_out" boolean NOT NULL DEFAULT false,
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS "lifecycle_scheduler_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "started_at" timestamptz NOT NULL DEFAULT now(),
  "completed_at" timestamptz,
  "eligible_count" integer NOT NULL DEFAULT 0,
  "claimed_count" integer NOT NULL DEFAULT 0,
  "sent_count" integer NOT NULL DEFAULT 0,
  "suppressed_count" integer NOT NULL DEFAULT 0,
  "failed_count" integer NOT NULL DEFAULT 0
);