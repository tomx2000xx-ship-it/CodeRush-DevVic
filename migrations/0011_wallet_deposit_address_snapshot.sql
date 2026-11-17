-- Preserve the exact receiving address used when a deposit was submitted.
ALTER TABLE wallet_transactions ADD COLUMN deposit_address_snapshot TEXT;
UPDATE wallet_transactions
SET deposit_address_snapshot=(SELECT deposit_address FROM wallet_networks WHERE network_code=wallet_transactions.network_code)
WHERE type='deposit' AND deposit_address_snapshot IS NULL;