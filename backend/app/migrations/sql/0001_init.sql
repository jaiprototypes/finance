CREATE TABLE IF NOT EXISTS account (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  currency TEXT NOT NULL,
  institution TEXT,
  note TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS category (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  personal_allowed INTEGER NOT NULL DEFAULT 1,
  business_allowed INTEGER NOT NULL DEFAULT 1,
  tax_code TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS tag (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS client (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  address TEXT,
  notes TEXT,
  is_active INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS project (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  client_id INTEGER,
  hourly_rate REAL,
  tags TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(client_id) REFERENCES client(id)
);

CREATE TABLE IF NOT EXISTS task (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(project_id) REFERENCES project(id)
);

CREATE TABLE IF NOT EXISTS invoice (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  client_id INTEGER NOT NULL,
  number TEXT NOT NULL,
  status TEXT NOT NULL,
  issue_date TEXT NOT NULL,
  due_date TEXT,
  currency TEXT NOT NULL,
  subtotal REAL NOT NULL DEFAULT 0,
  tax REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(client_id) REFERENCES client(id)
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_invoice_number ON invoice(number);

CREATE TABLE IF NOT EXISTS invoice_line_item (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  description TEXT NOT NULL,
  quantity REAL NOT NULL,
  unit_price REAL NOT NULL,
  amount REAL NOT NULL,
  FOREIGN KEY(invoice_id) REFERENCES invoice(id)
);

CREATE TABLE IF NOT EXISTS import_batch (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  source TEXT,
  file_name TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL DEFAULT 'imported',
  total_rows INTEGER NOT NULL DEFAULT 0,
  imported_rows INTEGER NOT NULL DEFAULT 0,
  duplicate_rows INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS transactions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  date TEXT NOT NULL,
  description TEXT NOT NULL,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  payee TEXT,
  notes TEXT,
  classification TEXT NOT NULL DEFAULT 'Personal',
  reconciliation_state TEXT NOT NULL DEFAULT 'imported',
  import_batch_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(account_id) REFERENCES account(id),
  FOREIGN KEY(import_batch_id) REFERENCES import_batch(id)
);

CREATE TABLE IF NOT EXISTS transaction_split (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL,
  category_id INTEGER,
  amount REAL NOT NULL,
  currency TEXT NOT NULL,
  classification TEXT NOT NULL DEFAULT 'Personal',
  notes TEXT,
  business_percent REAL,
  FOREIGN KEY(transaction_id) REFERENCES transactions(id),
  FOREIGN KEY(category_id) REFERENCES category(id)
);

CREATE TABLE IF NOT EXISTS transaction_tag (
  transaction_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (transaction_id, tag_id),
  FOREIGN KEY(transaction_id) REFERENCES transactions(id),
  FOREIGN KEY(tag_id) REFERENCES tag(id)
);

CREATE TABLE IF NOT EXISTS attachment (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL,
  file_path TEXT NOT NULL,
  file_name TEXT,
  mime_type TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(transaction_id) REFERENCES transactions(id)
);

CREATE TABLE IF NOT EXISTS import_row (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  batch_id INTEGER NOT NULL,
  row_index INTEGER NOT NULL,
  raw_json TEXT NOT NULL,
  parsed_json TEXT,
  fingerprint TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'imported',
  transaction_id INTEGER,
  error TEXT,
  FOREIGN KEY(batch_id) REFERENCES import_batch(id),
  FOREIGN KEY(transaction_id) REFERENCES transactions(id)
);

CREATE TABLE IF NOT EXISTS rule (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  field TEXT NOT NULL,
  operator TEXT NOT NULL,
  value TEXT NOT NULL,
  category_id INTEGER,
  payee TEXT,
  memo_contains TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  FOREIGN KEY(category_id) REFERENCES category(id)
);

CREATE TABLE IF NOT EXISTS budget_month (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  month TEXT NOT NULL,
  rollover_enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS budget_category_target (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  budget_month_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  rollover_amount REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(budget_month_id) REFERENCES budget_month(id),
  FOREIGN KEY(category_id) REFERENCES category(id)
);

CREATE TABLE IF NOT EXISTS debt_profile (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  account_id INTEGER NOT NULL,
  apr REAL NOT NULL,
  min_payment REAL NOT NULL,
  due_date TEXT,
  compounding TEXT NOT NULL DEFAULT 'daily',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(account_id) REFERENCES account(id)
);

CREATE TABLE IF NOT EXISTS debt_payment_link (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id INTEGER NOT NULL,
  account_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  FOREIGN KEY(transaction_id) REFERENCES transactions(id),
  FOREIGN KEY(account_id) REFERENCES account(id)
);

CREATE TABLE IF NOT EXISTS fx_rate (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  aud_per_usd REAL NOT NULL,
  source TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS ux_fx_rate_date ON fx_rate(date);

CREATE TABLE IF NOT EXISTS fx_recommendation (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  risk_profile TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  note TEXT
);

CREATE TABLE IF NOT EXISTS fx_backtest_run (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  horizon_days INTEGER NOT NULL,
  metrics_json TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS time_entry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  project_id INTEGER NOT NULL,
  task_id INTEGER,
  date TEXT NOT NULL,
  start_time TEXT,
  end_time TEXT,
  duration_minutes INTEGER NOT NULL,
  notes TEXT,
  billable INTEGER NOT NULL DEFAULT 1,
  hourly_rate REAL,
  invoiced_invoice_id INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(project_id) REFERENCES project(id),
  FOREIGN KEY(task_id) REFERENCES task(id),
  FOREIGN KEY(invoiced_invoice_id) REFERENCES invoice(id)
);

CREATE TABLE IF NOT EXISTS invoice_payment_link (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  invoice_id INTEGER NOT NULL,
  transaction_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  FOREIGN KEY(invoice_id) REFERENCES invoice(id),
  FOREIGN KEY(transaction_id) REFERENCES transactions(id)
);

CREATE TABLE IF NOT EXISTS fx_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  target_account_id INTEGER,
  provider TEXT NOT NULL DEFAULT 'manual',
  risk_profile TEXT NOT NULL DEFAULT 'neutral',
  FOREIGN KEY(target_account_id) REFERENCES account(id)
);

CREATE TABLE IF NOT EXISTS app_setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

