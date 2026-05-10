CREATE TABLE IF NOT EXISTS budget_group_target (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  budget_month_id INTEGER NOT NULL,
  budget_group_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  rollover_amount REAL NOT NULL DEFAULT 0,
  FOREIGN KEY(budget_month_id) REFERENCES budget_month(id),
  FOREIGN KEY(budget_group_id) REFERENCES budget_group(id),
  UNIQUE(budget_month_id, budget_group_id)
);
