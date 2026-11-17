-- Phase 6 completion: three-tier profit-share commissions, immutable wallet credits and admin controls.
ALTER TABLE referral_program_settings ADD COLUMN commission_enabled INTEGER NOT NULL DEFAULT 1 CHECK(commission_enabled IN (0,1));
ALTER TABLE referral_program_settings ADD COLUMN level1_rate_bps INTEGER NOT NULL DEFAULT 1000 CHECK(level1_rate_bps BETWEEN 0 AND 10000);
ALTER TABLE referral_program_settings ADD COLUMN level2_rate_bps INTEGER NOT NULL DEFAULT 500 CHECK(level2_rate_bps BETWEEN 0 AND 10000);
ALTER TABLE referral_program_settings ADD COLUMN level3_rate_bps INTEGER NOT NULL DEFAULT 300 CHECK(level3_rate_bps BETWEEN 0 AND 10000);
CREATE TABLE IF NOT EXISTS wallet_referral_credits (
  id TEXT PRIMARY KEY,
  account_id TEXT NOT NULL REFERENCES wallet_accounts(id) ON DELETE RESTRICT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  source_ticket_id TEXT NOT NULL REFERENCES bet_tickets(id) ON DELETE RESTRICT,
  referred_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  referral_level INTEGER NOT NULL CHECK(referral_level BETWEEN 1 AND 3),
  rate_bps INTEGER NOT NULL CHECK(rate_bps BETWEEN 1 AND 10000),
  profit_units INTEGER NOT NULL CHECK(profit_units > 0),
  amount_units INTEGER NOT NULL CHECK(amount_units > 0),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(source_ticket_id,user_id,referral_level)
);
CREATE INDEX IF NOT EXISTS idx_wallet_referral_credits_user_created ON wallet_referral_credits(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_wallet_referral_credits_account ON wallet_referral_credits(account_id,created_at);
CREATE INDEX IF NOT EXISTS idx_wallet_referral_credits_ticket ON wallet_referral_credits(source_ticket_id);
CREATE TRIGGER IF NOT EXISTS wallet_referral_credits_no_update BEFORE UPDATE ON wallet_referral_credits BEGIN SELECT RAISE(ABORT,'referral wallet credits are immutable'); END;
CREATE TRIGGER IF NOT EXISTS wallet_referral_credits_no_delete BEFORE DELETE ON wallet_referral_credits BEGIN SELECT RAISE(ABORT,'referral wallet credits are immutable'); END;
UPDATE referral_program_settings SET commission_enabled=1,level1_rate_bps=1000,level2_rate_bps=500,level3_rate_bps=300 WHERE id=1;
