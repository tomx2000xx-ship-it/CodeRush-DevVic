ALTER TABLE admin_login_attempts ADD COLUMN client_key_hash TEXT;

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_email_created
ON admin_login_attempts(email, success, created_at);

CREATE INDEX IF NOT EXISTS idx_admin_login_attempts_client_created
ON admin_login_attempts(client_key_hash, success, created_at);
