CREATE TABLE IF NOT EXISTS attribution_visitors (
  visitor_id UUID PRIMARY KEY,
  user_id INTEGER UNIQUE REFERENCES users(id) ON DELETE SET NULL,
  first_touch JSONB NOT NULL,
  latest_touch JSONB NOT NULL,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  latest_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  session_started_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS attribution_visitors_unattached_recent_idx
  ON attribution_visitors (user_id, latest_seen_at);
CREATE INDEX IF NOT EXISTS attribution_visitors_first_seen_idx
  ON attribution_visitors (first_seen_at);