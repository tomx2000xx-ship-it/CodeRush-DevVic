-- OpenFootball public-domain fixture source tracking.
-- This is fixture/result data only: it does not supply live scores, events or bookmaker odds.
CREATE TABLE IF NOT EXISTS sports_source_sync_state (
  provider TEXT PRIMARY KEY,
  last_success_at TEXT,
  last_attempt_at TEXT NOT NULL,
  last_error TEXT,
  datasets_loaded INTEGER NOT NULL DEFAULT 0,
  fixtures_loaded INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sports_fixtures_source_kickoff
  ON sports_fixtures(kickoff, status_short);
