-- Billing reliability contract.
--
-- This migration is additive and idempotent, but must be applied through the
-- normal controlled production migration process before deploying application
-- code that requires the corresponding catalog checks.

ALTER TABLE "user_subscriptions"
  ADD COLUMN IF NOT EXISTS "cancellation_requested_at" timestamp;

CREATE TABLE IF NOT EXISTS "paystack_cancellation_attempts" (
  "id" serial PRIMARY KEY NOT NULL,
  "billing_owner_user_id" integer NOT NULL REFERENCES "users"("id") ON DELETE RESTRICT,
  "subscription_code" text,
  "status" text NOT NULL DEFAULT 'requested'
    CHECK ("status" IN (
      'requested',
      'provider_call_started',
      'provider_confirmation_pending',
      'provider_result_unknown',
      'failed_retryable',
      'manual_review_required',
      'provider_non_renewing',
      'provider_disabled',
      'completed'
    )),
  "requested_at" timestamp NOT NULL DEFAULT now(),
  "provider_call_started_at" timestamp,
  "provider_confirmed_at" timestamp,
  "last_checked_at" timestamp,
  "attempt_count" integer NOT NULL DEFAULT 0 CHECK ("attempt_count" >= 0),
  "failure_code" text,
  "failure_detail" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS "paystack_cancellation_attempts_one_open_owner"
  ON "paystack_cancellation_attempts" ("billing_owner_user_id")
  WHERE "status" IN (
    'requested',
    'provider_call_started',
    'provider_confirmation_pending',
    'provider_result_unknown',
    'failed_retryable',
    'manual_review_required',
    'provider_non_renewing',
    'provider_disabled'
  );

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "payment_transactions"
    WHERE "platform_transaction_id" IS NOT NULL
    GROUP BY "platform", "platform_transaction_id"
    HAVING COUNT(*) > 1
  ) THEN
    RAISE EXCEPTION 'Cannot enforce payment provider-reference uniqueness: duplicate references exist';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS "payment_transactions_platform_reference_unique"
  ON "payment_transactions" ("platform", "platform_transaction_id");
