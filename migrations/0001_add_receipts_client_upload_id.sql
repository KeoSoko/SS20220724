ALTER TABLE receipts
ADD COLUMN IF NOT EXISTS client_upload_id text;

CREATE UNIQUE INDEX IF NOT EXISTS receipts_user_client_upload_id_unique
ON receipts (user_id, client_upload_id);
