CREATE TABLE IF NOT EXISTS paystack_subscription_identities (
  id serial PRIMARY KEY,
  user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  subscription_code text NOT NULL UNIQUE,
  customer_code text,
  plan_code text,
  status text NOT NULL DEFAULT 'active',
  provider_created_at timestamp,
  retired_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS paystack_subscription_identities_user_status_idx
ON paystack_subscription_identities (user_id, status);