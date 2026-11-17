-- Phase 5: server-authoritative USDT wallet, immutable ledger and manual crypto operations.
CREATE TABLE IF NOT EXISTS wallet_settings (
  id INTEGER PRIMARY KEY CHECK (id=1),
  enabled INTEGER NOT NULL DEFAULT 0 CHECK (enabled IN (0,1)),
  min_deposit_units INTEGER NOT NULL DEFAULT 1000000 CHECK (min_deposit_units>0),
  max_deposit_units INTEGER NOT NULL DEFAULT 100000000000 CHECK (max_deposit_units>=min_deposit_units),
  min_withdrawal_units INTEGER NOT NULL DEFAULT 1000000 CHECK (min_withdrawal_units>0),
  max_withdrawal_units INTEGER NOT NULL DEFAULT 100000000000 CHECK (max_withdrawal_units>=min_withdrawal_units),
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO wallet_settings(id,enabled) VALUES(1,0);

CREATE TABLE IF NOT EXISTS wallet_networks (
  network_code TEXT PRIMARY KEY CHECK(network_code IN ('USDT_TRC20','USDT_ERC20','USDT_BEP20')),
  asset TEXT NOT NULL DEFAULT 'USDT' CHECK(asset='USDT'),
  network_name TEXT NOT NULL,
  deposit_address TEXT,
  deposits_enabled INTEGER NOT NULL DEFAULT 0 CHECK(deposits_enabled IN (0,1)),
  withdrawals_enabled INTEGER NOT NULL DEFAULT 0 CHECK(withdrawals_enabled IN (0,1)),
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO wallet_networks(network_code,network_name) VALUES
 ('USDT_TRC20','TRON · TRC20'),
 ('USDT_ERC20','Ethereum · ERC20'),
 ('USDT_BEP20','BNB Smart Chain · BEP20');

CREATE TABLE IF NOT EXISTS wallet_accounts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  asset TEXT NOT NULL DEFAULT 'USDT' CHECK(asset='USDT'),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id,asset)
);
CREATE INDEX IF NOT EXISTS idx_wallet_accounts_user ON wallet_accounts(user_id,asset);

CREATE TABLE IF NOT EXISTS wallet_transactions (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  type TEXT NOT NULL CHECK(type IN ('deposit','withdrawal')),
  status TEXT NOT NULL CHECK(status IN ('pending_review','processing','completed','rejected')),
  amount_units INTEGER NOT NULL CHECK(amount_units>0),
  asset TEXT NOT NULL DEFAULT 'USDT' CHECK(asset='USDT'),
  network_code TEXT NOT NULL REFERENCES wallet_networks(network_code),
  tx_hash TEXT,
  destination_address TEXT,
  idempotency_key TEXT NOT NULL,
  reviewed_by TEXT REFERENCES users(id),
  reviewed_at TEXT,
  review_note TEXT,
  payout_tx_hash TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(user_id,idempotency_key),
  UNIQUE(network_code,tx_hash)
);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_user_created ON wallet_transactions(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_status_created ON wallet_transactions(status,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_transactions_type_status ON wallet_transactions(type,status);

CREATE TABLE IF NOT EXISTS wallet_ledger_entries (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  transaction_id TEXT NOT NULL REFERENCES wallet_transactions(id) ON DELETE RESTRICT,
  entry_type TEXT NOT NULL CHECK(entry_type IN ('deposit_credit','withdrawal_reserve','withdrawal_release','withdrawal_paid')),
  available_delta_units INTEGER NOT NULL DEFAULT 0,
  reserved_delta_units INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(transaction_id,entry_type)
);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_account_created ON wallet_ledger_entries(account_id,created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_ledger_user_created ON wallet_ledger_entries(user_id,created_at DESC);

CREATE TRIGGER IF NOT EXISTS wallet_ledger_no_update
BEFORE UPDATE ON wallet_ledger_entries
BEGIN SELECT RAISE(ABORT,'wallet ledger entries are immutable'); END;
CREATE TRIGGER IF NOT EXISTS wallet_ledger_no_delete
BEFORE DELETE ON wallet_ledger_entries
BEGIN SELECT RAISE(ABORT,'wallet ledger entries are immutable'); END;

CREATE TABLE IF NOT EXISTS wallet_audit_events (
  id TEXT PRIMARY KEY,
  transaction_id TEXT NOT NULL REFERENCES wallet_transactions(id) ON DELETE RESTRICT,
  actor_user_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_wallet_audit_tx_created ON wallet_audit_events(transaction_id,created_at DESC);
