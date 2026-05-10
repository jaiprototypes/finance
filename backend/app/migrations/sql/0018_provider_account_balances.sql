ALTER TABLE plaid_account ADD COLUMN current_balance REAL;
ALTER TABLE plaid_account ADD COLUMN available_balance REAL;
ALTER TABLE plaid_account ADD COLUMN balance_as_of TEXT;

ALTER TABLE up_account ADD COLUMN current_balance REAL;
ALTER TABLE up_account ADD COLUMN available_balance REAL;
ALTER TABLE up_account ADD COLUMN balance_as_of TEXT;
