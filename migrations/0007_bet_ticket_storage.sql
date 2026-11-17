-- Phase 3.2: user-owned, auditable ticket storage. Demo-only until wallet and settlement phases are completed.
CREATE TABLE IF NOT EXISTS bet_tickets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_type TEXT NOT NULL DEFAULT 'demo' CHECK(ticket_type IN ('demo')),
  status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open','won','lost','void')),
  stake REAL NOT NULL CHECK(stake >= 1 AND stake <= 5000),
  combined_odds REAL NOT NULL CHECK(combined_odds > 1 AND combined_odds <= 1000000),
  potential_return REAL NOT NULL CHECK(potential_return >= 0),
  currency TEXT NOT NULL DEFAULT 'USD' CHECK(currency='USD'),
  selection_count INTEGER NOT NULL CHECK(selection_count BETWEEN 1 AND 20),
  idempotency_key TEXT NOT NULL,
  quoted_at TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  UNIQUE(user_id,idempotency_key)
);
CREATE INDEX IF NOT EXISTS idx_bet_tickets_user_created ON bet_tickets(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bet_tickets_status ON bet_tickets(status,created_at);
CREATE TABLE IF NOT EXISTS bet_ticket_selections (
  id TEXT PRIMARY KEY,
  ticket_id TEXT NOT NULL REFERENCES bet_tickets(id) ON DELETE CASCADE,
  selection_index INTEGER NOT NULL CHECK(selection_index BETWEEN 0 AND 19),
  fixture_id TEXT NOT NULL,
  home_team TEXT NOT NULL,
  away_team TEXT NOT NULL,
  league_name TEXT NOT NULL,
  outcome_key TEXT NOT NULL CHECK(outcome_key IN ('home','draw','away')),
  outcome_name TEXT NOT NULL,
  odd REAL NOT NULL CHECK(odd > 1),
  odds_updated_at TEXT NOT NULL,
  UNIQUE(ticket_id,selection_index),
  UNIQUE(ticket_id,fixture_id)
);
CREATE INDEX IF NOT EXISTS idx_bet_ticket_selections_ticket ON bet_ticket_selections(ticket_id,selection_index);
