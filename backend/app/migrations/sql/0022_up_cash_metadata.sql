-- Provider cash adjustments are separate from the merchant purchase amount.
ALTER TABLE up_transaction ADD COLUMN round_up_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE up_transaction ADD COLUMN cashback_amount REAL NOT NULL DEFAULT 0;
ALTER TABLE up_transaction ADD COLUMN transfer_account_id TEXT;
ALTER TABLE up_transaction ADD COLUMN settled_at TEXT;
ALTER TABLE up_transaction ADD COLUMN cash_metadata_synced_at TEXT;
