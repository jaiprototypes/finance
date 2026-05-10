ALTER TABLE plaid_transaction ADD COLUMN merchant_category_code TEXT;
ALTER TABLE plaid_transaction ADD COLUMN pfc_primary TEXT;
ALTER TABLE plaid_transaction ADD COLUMN pfc_detailed TEXT;

ALTER TABLE up_transaction ADD COLUMN up_category_id TEXT;
ALTER TABLE up_transaction ADD COLUMN up_category_name TEXT;
