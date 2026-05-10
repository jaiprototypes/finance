CREATE TABLE IF NOT EXISTS merchant_profile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  default_category_id INTEGER,
  default_classification TEXT NOT NULL DEFAULT 'Personal',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(default_category_id) REFERENCES category(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_merchant_profile_norm ON merchant_profile(normalized_name);

CREATE TABLE IF NOT EXISTS transaction_memory (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER,
  merchant TEXT,
  content TEXT NOT NULL,
  category_id INTEGER,
  classification TEXT NOT NULL DEFAULT 'Personal',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(transaction_id) REFERENCES transactions(id),
  FOREIGN KEY(category_id) REFERENCES category(id)
);

CREATE VIRTUAL TABLE IF NOT EXISTS transaction_memory_fts USING fts5(
  merchant,
  content,
  tokenize='unicode61'
);
