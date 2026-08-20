ALTER TABLE "paystack_subscription_identities"
  ADD COLUMN IF NOT EXISTS "recurring_readiness" text NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS "authorization_code" text,
  ADD COLUMN IF NOT EXISTS "authorization_channel" text,
  ADD COLUMN IF NOT EXISTS "authorization_signature" text,
  ADD COLUMN IF NOT EXISTS "authorization_reusable" boolean,
  ADD COLUMN IF NOT EXISTS "provider_verified_at" timestamp;

ALTER TABLE "payment_transactions"
  ADD COLUMN IF NOT EXISTS "provider_transaction_id" text,
  ADD COLUMN IF NOT EXISTS "provider_channel" text,
  ADD COLUMN IF NOT EXISTS "provider_authorization_code" text,
  ADD COLUMN IF NOT EXISTS "provider_authorization_channel" text,
  ADD COLUMN IF NOT EXISTS "provider_authorization_signature" text,
  ADD COLUMN IF NOT EXISTS "provider_authorization_reusable" boolean,
  ADD COLUMN IF NOT EXISTS "provider_verified_at" timestamp,
  ADD COLUMN IF NOT EXISTS "recurring_readiness" text NOT NULL DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS "payment_transactions_provider_transaction_idx"
  ON "payment_transactions" ("platform", "provider_transaction_id");