INSERT INTO category(name, personal_allowed, business_allowed, tax_code, is_active)
SELECT 'Transport', 1, 1, NULL, 1
WHERE EXISTS (
  SELECT 1 FROM category WHERE name = 'Travel'
)
AND NOT EXISTS (
  SELECT 1 FROM category WHERE name = 'Transport'
);

UPDATE transaction_split
SET category_id = (SELECT id FROM category WHERE name = 'Transport')
WHERE category_id = (SELECT id FROM category WHERE name = 'Travel');

UPDATE merchant_profile
SET default_category_id = (SELECT id FROM category WHERE name = 'Transport')
WHERE default_category_id = (SELECT id FROM category WHERE name = 'Travel');

UPDATE transaction_memory
SET category_id = (SELECT id FROM category WHERE name = 'Transport')
WHERE category_id = (SELECT id FROM category WHERE name = 'Travel');

UPDATE classification_audit
SET category_id = (SELECT id FROM category WHERE name = 'Transport')
WHERE category_id = (SELECT id FROM category WHERE name = 'Travel');

UPDATE rule
SET category_id = (SELECT id FROM category WHERE name = 'Transport')
WHERE category_id = (SELECT id FROM category WHERE name = 'Travel');

UPDATE budget_category_target
SET category_id = (SELECT id FROM category WHERE name = 'Transport')
WHERE category_id = (SELECT id FROM category WHERE name = 'Travel');

CREATE TEMP TABLE budget_category_target_compacted_travel (
  id INTEGER PRIMARY KEY,
  budget_month_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  rollover_amount REAL NOT NULL
);

INSERT INTO budget_category_target_compacted_travel(id, budget_month_id, category_id, amount, rollover_amount)
SELECT
  MIN(id) AS id,
  budget_month_id,
  category_id,
  SUM(amount) AS amount,
  SUM(rollover_amount) AS rollover_amount
FROM budget_category_target
GROUP BY budget_month_id, category_id;

DELETE FROM budget_category_target;

INSERT INTO budget_category_target(id, budget_month_id, category_id, amount, rollover_amount)
SELECT id, budget_month_id, category_id, amount, rollover_amount
FROM budget_category_target_compacted_travel;

DROP TABLE budget_category_target_compacted_travel;

CREATE TEMP TABLE budget_bucket_target_compacted_travel (
  id INTEGER PRIMARY KEY,
  budget_month_id INTEGER NOT NULL,
  budget_bucket TEXT NOT NULL,
  amount REAL NOT NULL,
  rollover_amount REAL NOT NULL
);

INSERT INTO budget_bucket_target_compacted_travel(id, budget_month_id, budget_bucket, amount, rollover_amount)
SELECT
  MIN(id) AS id,
  budget_month_id,
  CASE WHEN budget_bucket = 'travel' THEN 'transport' ELSE budget_bucket END AS budget_bucket,
  SUM(amount) AS amount,
  SUM(rollover_amount) AS rollover_amount
FROM budget_bucket_target
GROUP BY budget_month_id, CASE WHEN budget_bucket = 'travel' THEN 'transport' ELSE budget_bucket END;

DELETE FROM budget_bucket_target;

INSERT INTO budget_bucket_target(id, budget_month_id, budget_bucket, amount, rollover_amount)
SELECT id, budget_month_id, budget_bucket, amount, rollover_amount
FROM budget_bucket_target_compacted_travel;

DROP TABLE budget_bucket_target_compacted_travel;

UPDATE category
SET is_active = 0
WHERE name = 'Travel';

UPDATE category
SET is_active = 1
WHERE name = 'Transport';
