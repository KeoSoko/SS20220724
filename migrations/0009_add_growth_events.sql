CREATE TABLE IF NOT EXISTS growth_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  event_name TEXT NOT NULL,
  occurred_at TIMESTAMP NOT NULL DEFAULT NOW(),
  event_data JSONB,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT growth_events_user_id_event_name_unique UNIQUE (user_id, event_name)
);

CREATE INDEX IF NOT EXISTS growth_events_event_name_occurred_at_idx
  ON growth_events (event_name, occurred_at);