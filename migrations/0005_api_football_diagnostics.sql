CREATE TABLE IF NOT EXISTS api_football_diagnostics (
  id TEXT PRIMARY KEY,
  endpoint TEXT NOT NULL,
  http_status INTEGER,
  daily_limit TEXT,
  daily_remaining TEXT,
  minute_limit TEXT,
  minute_remaining TEXT,
  retry_after TEXT,
  provider_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_api_football_diagnostics_created
  ON api_football_diagnostics(created_at DESC);