-- Phase 13: enforce a daily internal request budget for all football provider calls.
-- 75 calls/day leaves a safety reserve below API-Football's historical 100/day free allowance.
CREATE TABLE IF NOT EXISTS api_football_request_budget (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  utc_day TEXT NOT NULL,
  used INTEGER NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at TEXT NOT NULL
);
