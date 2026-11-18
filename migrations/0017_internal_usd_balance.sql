-- CodeRush: one internal USD balance shared by deposits, bets, settlement and manual withdrawals.
-- All amounts use integer micro-units (1 USD = 1,000,000 units).
ALTER TABLE wallet_accounts ADD COLUMN balance_currency TEXT NOT NULL DEFAULT 'USD' CHECK(balance_currency='USD');

CREATE TABLE IF NOT EXISTS wallet_balance_entries (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('deposit_credit','bet_stake','bet_win','bet_void_refund')),
  source_id TEXT NOT NULL,
  event_key TEXT NOT NULL UNIQUE,
  available_delta_units INTEGER NOT NULL,
  reserved_delta_units INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(entry_type,source_id)
);
CREATE INDEX IF NOT EXISTS idx_wallet_balance_entries_account_created
  ON wallet_balance_entries(account_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_balance_entries_user_created
  ON wallet_balance_entries(user_id,created_at DESC);

CREATE TRIGGER IF NOT EXISTS wallet_balance_entries_no_update
BEFORE UPDATE ON wallet_balance_entries
BEGIN SELECT RAISE(ABORT,'wallet balance entries are immutable'); END;
CREATE TRIGGER IF NOT EXISTS wallet_balance_entries_no_delete
BEFORE DELETE ON wallet_balance_entries
BEGIN SELECT RAISE(ABORT,'wallet balance entries are immutable'); END;

ALTER TABLE bet_tickets ADD COLUMN funding_source TEXT NOT NULL DEFAULT 'virtual_usd_balance'
  CHECK(funding_source='virtual_usd_balance');
