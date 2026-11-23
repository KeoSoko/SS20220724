CREATE TABLE IF NOT EXISTS accountant_report_access (
  id uuid PRIMARY KEY,
  workspace_id integer NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  email text NOT NULL,
  year integer NOT NULL,
  expires_at timestamptz NOT NULL,
  accepted_at timestamptz,
  revoked_at timestamptz,
  token_hash text,
  token_expires_at timestamptz,
  session_hash text
);
CREATE INDEX IF NOT EXISTS accountant_report_access_workspace_idx ON accountant_report_access (workspace_id);
