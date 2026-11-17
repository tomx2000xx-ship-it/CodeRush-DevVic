-- Phase 5 hardening: payout transaction hash uniqueness and append-only audit history.
CREATE UNIQUE INDEX IF NOT EXISTS idx_wallet_payout_hash
  ON wallet_transactions(network_code,payout_tx_hash)
  WHERE payout_tx_hash IS NOT NULL;
CREATE TRIGGER IF NOT EXISTS wallet_audit_no_update
BEFORE UPDATE ON wallet_audit_events
BEGIN SELECT RAISE(ABORT,'wallet audit events are immutable'); END;
CREATE TRIGGER IF NOT EXISTS wallet_audit_no_delete
BEFORE DELETE ON wallet_audit_events
BEGIN SELECT RAISE(ABORT,'wallet audit events are immutable'); END;
