CREATE TABLE IF NOT EXISTS classification_audit (
  id INTEGER PRIMARY KEY,
  transaction_id INTEGER NOT NULL,
  source TEXT NOT NULL,
  category_id INTEGER,
  classification TEXT NOT NULL DEFAULT 'Personal',
  merchant_name TEXT,
  note TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY(transaction_id) REFERENCES transactions(id),
  FOREIGN KEY(category_id) REFERENCES category(id)
);
