-- Phase 2: football fixtures, bookmaker odds and provider sync state.
CREATE TABLE IF NOT EXISTS sports_fixtures (
  id TEXT PRIMARY KEY,
  league_id INTEGER NOT NULL,
  league_name TEXT NOT NULL,
  country TEXT,
  season INTEGER,
  kickoff TEXT NOT NULL,
  status_short TEXT NOT NULL,
  status_long TEXT,
  elapsed INTEGER,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  home_code TEXT,
  away_code TEXT,
  home_score INTEGER,
  away_score INTEGER,
  is_live INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  raw_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sports_fixtures_kickoff ON sports_fixtures(kickoff);
CREATE INDEX IF NOT EXISTS idx_sports_fixtures_league ON sports_fixtures(league_id,kickoff);
CREATE INDEX IF NOT EXISTS idx_sports_fixtures_live ON sports_fixtures(is_live,status_short);
CREATE TABLE IF NOT EXISTS sports_odds (
  fixture_id TEXT NOT NULL REFERENCES sports_fixtures(id) ON DELETE CASCADE,
  bookmaker_id INTEGER NOT NULL,
  bookmaker_name TEXT NOT NULL,
  market_id INTEGER NOT NULL,
  market_name TEXT NOT NULL,
  outcome_key TEXT NOT NULL,
  outcome_name TEXT NOT NULL,
  odd REAL NOT NULL,
  handicap TEXT NOT NULL DEFAULT '',
  suspended INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL,
  PRIMARY KEY(fixture_id,bookmaker_id,market_id,outcome_key,handicap)
);
CREATE INDEX IF NOT EXISTS idx_sports_odds_fixture ON sports_odds(fixture_id,market_id);
CREATE TABLE IF NOT EXISTS sports_sync_state (
  provider TEXT PRIMARY KEY,
  last_fixtures_sync TEXT,
  last_live_sync TEXT,
  last_odds_sync TEXT,
  last_error TEXT,
  updated_at TEXT NOT NULL
);