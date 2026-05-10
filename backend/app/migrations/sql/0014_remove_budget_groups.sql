DROP INDEX IF EXISTS ux_merchant_profile_norm_currency;

CREATE TABLE IF NOT EXISTS merchant_profile_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT '',
  default_category_id INTEGER,
  default_classification TEXT NOT NULL DEFAULT 'Personal',
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(default_category_id) REFERENCES category(id)
);

INSERT INTO merchant_profile_new (
  id,
  name,
  normalized_name,
  currency,
  default_category_id,
  default_classification,
  notes,
  created_at,
  updated_at
)
SELECT
  id,
  name,
  normalized_name,
  COALESCE(currency, ''),
  default_category_id,
  default_classification,
  notes,
  created_at,
  updated_at
FROM merchant_profile;

DROP TABLE merchant_profile;

ALTER TABLE merchant_profile_new RENAME TO merchant_profile;

CREATE UNIQUE INDEX IF NOT EXISTS ux_merchant_profile_norm_currency
  ON merchant_profile(normalized_name, currency);

DROP TABLE IF EXISTS budget_group_target;
DROP TABLE IF EXISTS budget_group_training_run;
DROP TABLE IF EXISTS budget_group;
