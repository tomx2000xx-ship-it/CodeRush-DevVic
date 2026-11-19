-- Production sportsbook activation: remove demo-only ticket/funding constraints.
-- Existing tickets are preserved and reclassified; balances and ledger rows are untouched.
CREATE TABLE bet_tickets_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ticket_type TEXT NOT NULL DEFAULT 'sportsbook' CHECK(ticket_type IN ('sportsbook')),
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
  settled_odds REAL,
  settled_return REAL,
  settled_at TEXT,
  funding_source TEXT NOT NULL DEFAULT 'wallet_balance' CHECK(funding_source IN ('wallet_balance')),
  UNIQUE(user_id,idempotency_key)
);
INSERT INTO bet_tickets_new (
  id,user_id,ticket_type,status,stake,combined_odds,potential_return,currency,
  selection_count,idempotency_key,quoted_at,created_at,updated_at,
  settled_odds,settled_return,settled_at,funding_source
)
SELECT
  id,user_id,'sportsbook',status,stake,combined_odds,potential_return,currency,
  selection_count,idempotency_key,quoted_at,created_at,updated_at,
  settled_odds,settled_return,settled_at,'wallet_balance'
FROM bet_tickets;
DROP TABLE bet_tickets;
ALTER TABLE bet_tickets_new RENAME TO bet_tickets;
CREATE INDEX IF NOT EXISTS idx_bet_tickets_user_created ON bet_tickets(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bet_tickets_status ON bet_tickets(status,created_at);
CREATE INDEX IF NOT EXISTS idx_bet_tickets_status_created ON bet_tickets(status,created_at DESC);
