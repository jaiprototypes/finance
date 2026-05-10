CREATE TABLE IF NOT EXISTS plaid_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  access_token TEXT NOT NULL,
  institution_id TEXT,
  institution_name TEXT,
  status TEXT NOT NULL DEFAULT 'active',
  cursor TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS plaid_account (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL,
  plaid_account_id TEXT NOT NULL,
  account_id INTEGER,
  name TEXT,
  official_name TEXT,
  type TEXT,
  subtype TEXT,
  mask TEXT,
  currency TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY(account_id) REFERENCES account(id)
);

CREATE TABLE IF NOT EXISTS plaid_transaction (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  plaid_transaction_id TEXT NOT NULL,
  pending_transaction_id TEXT,
  account_id INTEGER,
  transaction_id INTEGER,
  amount REAL NOT NULL,
  date TEXT NOT NULL,
  name TEXT,
  merchant_name TEXT,
  pending INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  FOREIGN KEY(account_id) REFERENCES account(id),
  FOREIGN KEY(transaction_id) REFERENCES transactions(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS plaid_item_item_id_idx ON plaid_item(item_id);
CREATE UNIQUE INDEX IF NOT EXISTS plaid_account_plaid_id_idx ON plaid_account(plaid_account_id);
CREATE UNIQUE INDEX IF NOT EXISTS plaid_txn_plaid_id_idx ON plaid_transaction(plaid_transaction_id);
