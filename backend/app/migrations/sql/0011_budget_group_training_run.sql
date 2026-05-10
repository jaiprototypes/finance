CREATE TABLE IF NOT EXISTS budget_group_training_run (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  status TEXT NOT NULL,
  started_at TEXT NOT NULL,
  finished_at TEXT,
  step TEXT,
  message TEXT,
  error TEXT,
  total_merchants INTEGER NOT NULL DEFAULT 0,
  processed_merchants INTEGER NOT NULL DEFAULT 0,
  total_batches INTEGER NOT NULL DEFAULT 0,
  processed_batches INTEGER NOT NULL DEFAULT 0,
  embedding_model TEXT,
  duration_seconds REAL,
  details_json TEXT
);
