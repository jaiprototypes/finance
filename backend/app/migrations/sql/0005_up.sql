CREATE TABLE IF NOT EXISTS up_account (
  id INTEGER PRIMARY KEY,
  up_account_id TEXT NOT NULL UNIQUE,
  account_id INTEGER,
  name TEXT,
  account_type TEXT,
  ownership_type TEXT,
  currency TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  last_synced_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(account_id) REFERENCES account(id)
);

CREATE TABLE IF NOT EXISTS up_transaction (
  id INTEGER PRIMARY KEY,
  up_transaction_id TEXT NOT NULL UNIQUE,
  account_id INTEGER,
  transaction_id INTEGER,
  status TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(account_id) REFERENCES account(id),
  FOREIGN KEY(transaction_id) REFERENCES transactions(id)
);
