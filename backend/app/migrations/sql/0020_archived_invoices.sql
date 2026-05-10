CREATE TABLE IF NOT EXISTS archived_invoice (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  number TEXT,
  status TEXT NOT NULL DEFAULT 'archived',
  issue_date TEXT,
  due_date TEXT,
  currency TEXT NOT NULL DEFAULT 'USD',
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  file_path TEXT NOT NULL,
  file_name TEXT NOT NULL,
  mime_type TEXT,
  checksum TEXT NOT NULL,
  source_label TEXT NOT NULL DEFAULT 'upload',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(client_id) REFERENCES client(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_archived_invoice_checksum
  ON archived_invoice(checksum);

CREATE INDEX IF NOT EXISTS ix_archived_invoice_client_issue
  ON archived_invoice(client_id, issue_date);
