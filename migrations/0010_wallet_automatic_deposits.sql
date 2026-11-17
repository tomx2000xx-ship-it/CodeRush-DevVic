-- Phase 5: automatic, transaction-hash-based USDT deposit verification.
ALTER TABLE wallet_transactions ADD COLUMN chain_block_number INTEGER;
ALTER TABLE wallet_transactions ADD COLUMN chain_confirmations INTEGER;
ALTER TABLE wallet_transactions ADD COLUMN chain_verified_at TEXT;
ALTER TABLE wallet_transactions ADD COLUMN chain_amount_units INTEGER;
ALTER TABLE wallet_transactions ADD COLUMN chain_from_address TEXT;
ALTER TABLE wallet_transactions ADD COLUMN chain_error TEXT;
ALTER TABLE wallet_transactions ADD COLUMN monitor_attempts INTEGER NOT NULL DEFAULT 0;

ALTER TABLE wallet_networks ADD COLUMN monitor_enabled INTEGER NOT NULL DEFAULT 1 CHECK(monitor_enabled IN (0,1));
-- BNB-Pegged USDT is not listed on Tether's current official supported-protocols page.
-- Keep it out of automatic crediting until the operator verifies and explicitly approves the asset contract.
UPDATE wallet_networks SET monitor_enabled=0 WHERE network_code='USDT_BEP20';

CREATE TABLE IF NOT EXISTS wallet_monitor_state (
  network_code TEXT PRIMARY KEY REFERENCES wallet_networks(network_code),
  last_checked_at TEXT,
  last_success_at TEXT,
  last_error TEXT,
  checked_count INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT OR IGNORE INTO wallet_monitor_state(network_code) VALUES ('USDT_TRC20'),('USDT_ERC20'),('USDT_BEP20');

CREATE INDEX IF NOT EXISTS idx_wallet_deposit_monitor
ON wallet_transactions(type,status,network_code,created_at)
WHERE type='deposit' AND status IN ('pending_review','processing');
