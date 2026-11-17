CREATE TABLE IF NOT EXISTS api_football_rate_limit (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  next_allowed_at INTEGER NOT NULL
);
