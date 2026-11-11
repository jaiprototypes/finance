-- Optional checking-derived tracking never creates duplicate loan transactions.
ALTER TABLE debt_profile ADD COLUMN credit_limit REAL;
ALTER TABLE debt_profile ADD COLUMN tracking_account_id INTEGER REFERENCES account(id);
ALTER TABLE debt_profile ADD COLUMN tracking_reference TEXT;
ALTER TABLE debt_profile ADD COLUMN balance_anchor_amount REAL;
ALTER TABLE debt_profile ADD COLUMN balance_anchor_date TEXT;
