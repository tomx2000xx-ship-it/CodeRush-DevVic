CREATE TABLE IF NOT EXISTS api_football_usage (
  utc_date TEXT PRIMARY KEY,
  request_count INTEGER NOT NULL DEFAULT 0 CHECK (request_count >= 0)
);
