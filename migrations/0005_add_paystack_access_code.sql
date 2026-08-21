-- Migration 0005: add paystack_access_code to paystack_checkout_attempts
--
-- Stores the Paystack access_code returned by server-side POST /transaction/initialize.
-- The browser receives only this code; all billing-critical fields (amount, plan, email,
-- channels) are bound by Paystack's server to the access_code and never sent to the client.

ALTER TABLE "paystack_checkout_attempts"
  ADD COLUMN IF NOT EXISTS "paystack_access_code" text;
