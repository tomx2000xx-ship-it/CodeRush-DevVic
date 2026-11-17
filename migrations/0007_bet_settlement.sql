-- Phase 4: provider-backed football results and auditable demo-ticket settlement.
ALTER TABLE sports_fixtures ADD COLUMN result_home_score INTEGER;
ALTER TABLE sports_fixtures ADD COLUMN result_away_score INTEGER;
ALTER TABLE sports_fixtures ADD COLUMN result_checked_at TEXT;
CREATE INDEX IF NOT EXISTS idx_sports_fixtures_result_check
  ON sports_fixtures(result_checked_at, kickoff);

ALTER TABLE bet_tickets ADD COLUMN settled_odds REAL;
ALTER TABLE bet_tickets ADD COLUMN settled_return REAL;
ALTER TABLE bet_tickets ADD COLUMN settled_at TEXT;
CREATE INDEX IF NOT EXISTS idx_bet_tickets_status_created
  ON bet_tickets(status, created_at DESC);

ALTER TABLE bet_ticket_selections ADD COLUMN result_status TEXT NOT NULL DEFAULT 'pending'
  CHECK(result_status IN ('pending','won','lost','void'));
ALTER TABLE bet_ticket_selections ADD COLUMN result_home_score INTEGER;
ALTER TABLE bet_ticket_selections ADD COLUMN result_away_score INTEGER;
ALTER TABLE bet_ticket_selections ADD COLUMN result_fixture_status TEXT;
ALTER TABLE bet_ticket_selections ADD COLUMN result_checked_at TEXT;
ALTER TABLE bet_ticket_selections ADD COLUMN settled_at TEXT;
CREATE INDEX IF NOT EXISTS idx_bet_ticket_selections_result
  ON bet_ticket_selections(result_status, fixture_id);

CREATE TABLE IF NOT EXISTS bet_settlement_events (
  id TEXT PRIMARY KEY,
  event_key TEXT NOT NULL UNIQUE,
  ticket_id TEXT NOT NULL REFERENCES bet_tickets(id) ON DELETE CASCADE,
  selection_id TEXT REFERENCES bet_ticket_selections(id) ON DELETE SET NULL,
  event_type TEXT NOT NULL CHECK(event_type IN ('selection_result','ticket_settled')),
  previous_status TEXT,
  new_status TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_bet_settlement_events_ticket_created
  ON bet_settlement_events(ticket_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bet_settlement_events_created
  ON bet_settlement_events(created_at DESC);
