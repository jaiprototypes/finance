CREATE TABLE IF NOT EXISTS budget_group (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  currency TEXT NOT NULL,
  model TEXT NOT NULL,
  merchant_count INTEGER NOT NULL,
  transaction_count INTEGER NOT NULL,
  total_amount REAL NOT NULL,
  sample_merchants TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

ALTER TABLE merchant_profile
ADD COLUMN budget_group_id INTEGER REFERENCES budget_group(id);
