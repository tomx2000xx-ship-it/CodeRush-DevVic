-- Phase 6: permanent referral identity, immutable attribution and qualification tracking.
CREATE TABLE IF NOT EXISTS referral_program_settings (
  id INTEGER PRIMARY KEY CHECK(id=1),
  tracking_enabled INTEGER NOT NULL DEFAULT 1 CHECK(tracking_enabled IN (0,1)),
  rewards_enabled INTEGER NOT NULL DEFAULT 0 CHECK(rewards_enabled IN (0,1)),
  qualification_policy TEXT NOT NULL DEFAULT 'first_verified_deposit_or_first_settled_bet',
  reward_amount_units INTEGER,
  updated_by TEXT REFERENCES users(id),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(reward_amount_units IS NULL OR reward_amount_units > 0),
  CHECK(rewards_enabled=0 OR reward_amount_units IS NOT NULL)
);
INSERT OR IGNORE INTO referral_program_settings(id,tracking_enabled,rewards_enabled) VALUES(1,1,0);
CREATE TABLE IF NOT EXISTS referral_accounts (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE RESTRICT,
  referral_code TEXT NOT NULL UNIQUE,
  referred_by_user_id TEXT REFERENCES users(id) ON DELETE RESTRICT,
  attributed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  CHECK(referred_by_user_id IS NULL OR referred_by_user_id <> user_id),
  CHECK((referred_by_user_id IS NULL AND attributed_at IS NULL) OR (referred_by_user_id IS NOT NULL AND attributed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS idx_referral_accounts_referrer ON referral_accounts(referred_by_user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_referral_accounts_recent_attributed ON referral_accounts(attributed_at DESC) WHERE referred_by_user_id IS NOT NULL;
CREATE TABLE IF NOT EXISTS referral_qualifications (
  id TEXT PRIMARY KEY,
  referred_user_id TEXT NOT NULL UNIQUE REFERENCES users(id) ON DELETE RESTRICT,
  referrer_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  qualifying_action TEXT NOT NULL CHECK(qualifying_action IN ('first_deposit','first_bet')),
  source_id TEXT NOT NULL,
  qualified_at TEXT NOT NULL,
  CHECK(referred_user_id <> referrer_user_id)
);
CREATE INDEX IF NOT EXISTS idx_referral_qualifications_referrer ON referral_qualifications(referrer_user_id,qualified_at DESC);
CREATE TABLE IF NOT EXISTS referral_audit_events (
  id TEXT PRIMARY KEY,
  actor_user_id TEXT REFERENCES users(id),
  event_type TEXT NOT NULL,
  subject_user_id TEXT REFERENCES users(id),
  details_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_referral_audit_created ON referral_audit_events(created_at DESC);
