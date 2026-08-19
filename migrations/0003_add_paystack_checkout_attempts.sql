CREATE TABLE IF NOT EXISTS "paystack_checkout_attempts" (
  "id" serial PRIMARY KEY NOT NULL,
  "billing_owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "requested_by_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "plan_id" integer NOT NULL REFERENCES "subscription_plans"("id"),
  "amount" integer NOT NULL,
  "currency" text NOT NULL,
  "paystack_plan_code" text NOT NULL,
  "customer_email" text NOT NULL,
  "paystack_reference" text NOT NULL UNIQUE,
  "status" text NOT NULL DEFAULT 'pending' CHECK ("status" IN ('pending', 'completed', 'failed', 'expired', 'cancelled')),
  "expires_at" timestamp NOT NULL,
  "completed_at" timestamp,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

ALTER TABLE "paystack_checkout_attempts"
  ADD COLUMN IF NOT EXISTS "amount" integer,
  ADD COLUMN IF NOT EXISTS "currency" text,
  ADD COLUMN IF NOT EXISTS "paystack_plan_code" text,
  ADD COLUMN IF NOT EXISTS "customer_email" text;

UPDATE "paystack_checkout_attempts" AS attempts
SET
  "amount" = COALESCE(attempts."amount", plans."price"),
  "currency" = COALESCE(attempts."currency", plans."currency"),
  "paystack_plan_code" = COALESCE(attempts."paystack_plan_code", plans."paystack_plan_code"),
  "customer_email" = COALESCE(attempts."customer_email", owners."email")
FROM "subscription_plans" AS plans, "users" AS owners
WHERE attempts."plan_id" = plans."id"
  AND attempts."billing_owner_user_id" = owners."id"
  AND (
    attempts."amount" IS NULL
    OR attempts."currency" IS NULL
    OR attempts."paystack_plan_code" IS NULL
    OR attempts."customer_email" IS NULL
  );

ALTER TABLE "paystack_checkout_attempts"
  ALTER COLUMN "amount" SET NOT NULL,
  ALTER COLUMN "currency" SET NOT NULL,
  ALTER COLUMN "paystack_plan_code" SET NOT NULL,
  ALTER COLUMN "customer_email" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "paystack_checkout_attempts_one_pending_owner"
  ON "paystack_checkout_attempts" ("billing_owner_user_id")
  WHERE "status" = 'pending';

CREATE INDEX IF NOT EXISTS "paystack_checkout_attempts_status_expiry_idx"
  ON "paystack_checkout_attempts" ("status", "expires_at");