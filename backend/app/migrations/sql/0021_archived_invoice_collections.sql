ALTER TABLE archived_invoice ADD COLUMN updated_at TEXT;

UPDATE archived_invoice
SET updated_at = COALESCE(updated_at, created_at, datetime('now'));

CREATE TABLE IF NOT EXISTS archived_invoice_payment_link (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  archived_invoice_id INTEGER NOT NULL,
  transaction_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(archived_invoice_id) REFERENCES archived_invoice(id),
  FOREIGN KEY(transaction_id) REFERENCES transactions(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_archived_invoice_payment_link_pair
  ON archived_invoice_payment_link(archived_invoice_id, transaction_id);

CREATE INDEX IF NOT EXISTS ix_archived_invoice_payment_link_archive
  ON archived_invoice_payment_link(archived_invoice_id);

CREATE INDEX IF NOT EXISTS ix_archived_invoice_payment_link_transaction
  ON archived_invoice_payment_link(transaction_id);
