CREATE TABLE IF NOT EXISTS budget_bucket_target (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  budget_month_id INTEGER NOT NULL,
  budget_bucket TEXT NOT NULL,
  amount REAL NOT NULL,
  rollover_amount REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(budget_month_id) REFERENCES budget_month(id),
  UNIQUE(budget_month_id, budget_bucket)
);
