CREATE TEMP TABLE category_taxonomy_map (
  source_name TEXT PRIMARY KEY,
  target_name TEXT NOT NULL
);

INSERT INTO category_taxonomy_map(source_name, target_name) VALUES
  ('Adult', 'Lifestyle'),
  ('Apps, Games & Software', 'Lifestyle'),
  ('Bars', 'Food'),
  ('Booze', 'Food'),
  ('Children & Family', 'Lifestyle'),
  ('Client Meals', 'Food'),
  ('Clothing & Accessories', 'Lifestyle'),
  ('Cycling', 'Transport'),
  ('Debt Payments', 'Debt'),
  ('Department Stores', 'Lifestyle'),
  ('Discount Stores', 'Lifestyle'),
  ('Education', 'Lifestyle'),
  ('Education & Student Loans', 'Debt'),
  ('Electronics', 'Lifestyle'),
  ('Entertainment & Subscriptions', 'Lifestyle'),
  ('Events & Gigs', 'Lifestyle'),
  ('Fitness & Wellbeing', 'Health'),
  ('Food & Dining', 'Food'),
  ('Fuel', 'Transport'),
  ('Gifts & Charity', 'Lifestyle'),
  ('Groceries', 'Food'),
  ('Hair & Beauty', 'Health'),
  ('Health & Medical', 'Health'),
  ('Health & Personal Care', 'Health'),
  ('Hobbies', 'Lifestyle'),
  ('Holidays & Travel', 'Travel'),
  ('Homeware & Appliances', 'Housing & Bills'),
  ('Housing', 'Housing & Bills'),
  ('Income Contractor', 'Income'),
  ('Internet', 'Housing & Bills'),
  ('Investment Proceeds', 'Income'),
  ('Investments', 'Savings'),
  ('Life Admin', 'Housing & Bills'),
  ('Maintenance & Improvements', 'Housing & Bills'),
  ('Mobile Phone', 'Housing & Bills'),
  ('News & Magazines & Books', 'Lifestyle'),
  ('Public Transport', 'Transport'),
  ('Pubs & Bars', 'Food'),
  ('Rent and Utilities & Telephone', 'Housing & Bills'),
  ('Rent & Utilities & Telephone', 'Housing & Bills'),
  ('Rent & Mortgage', 'Housing & Bills'),
  ('Restaurants', 'Food'),
  ('Restaurants & Cafes', 'Food'),
  ('Savings & Investments', 'Savings'),
  ('Software', 'Lifestyle'),
  ('Takeaway', 'Food'),
  ('Taxis & Share Cars', 'Transport'),
  ('Technology', 'Lifestyle'),
  ('Telecom', 'Housing & Bills'),
  ('Tobacco & Vaping', 'Lifestyle'),
  ('Transportation, Taxis and Ride Shares', 'Transport'),
  ('Travel', 'Travel'),
  ('TV/Music Streaming', 'Lifestyle'),
  ('Utilities', 'Housing & Bills'),
  ('Bills & Utilities', 'Housing & Bills');

INSERT INTO category(name, personal_allowed, business_allowed, tax_code, is_active)
SELECT map.target_name, 1, 1, NULL, 1
FROM category_taxonomy_map map
WHERE EXISTS (
  SELECT 1
  FROM category source
  WHERE source.name = map.source_name
)
AND NOT EXISTS (
  SELECT 1
  FROM category target
  WHERE target.name = map.target_name
)
GROUP BY map.target_name;

UPDATE transaction_split
SET category_id = (
  SELECT target.id
  FROM category source
  JOIN category_taxonomy_map map ON map.source_name = source.name
  JOIN category target ON target.name = map.target_name
  WHERE source.id = transaction_split.category_id
)
WHERE category_id IN (
  SELECT source.id
  FROM category source
  JOIN category_taxonomy_map map ON map.source_name = source.name
);

UPDATE merchant_profile
SET default_category_id = (
  SELECT target.id
  FROM category source
  JOIN category_taxonomy_map map ON map.source_name = source.name
  JOIN category target ON target.name = map.target_name
  WHERE source.id = merchant_profile.default_category_id
)
WHERE default_category_id IN (
  SELECT source.id
  FROM category source
  JOIN category_taxonomy_map map ON map.source_name = source.name
);

UPDATE transaction_memory
SET category_id = (
  SELECT target.id
  FROM category source
  JOIN category_taxonomy_map map ON map.source_name = source.name
  JOIN category target ON target.name = map.target_name
  WHERE source.id = transaction_memory.category_id
)
WHERE category_id IN (
  SELECT source.id
  FROM category source
  JOIN category_taxonomy_map map ON map.source_name = source.name
);

UPDATE classification_audit
SET category_id = (
  SELECT target.id
  FROM category source
  JOIN category_taxonomy_map map ON map.source_name = source.name
  JOIN category target ON target.name = map.target_name
  WHERE source.id = classification_audit.category_id
)
WHERE category_id IN (
  SELECT source.id
  FROM category source
  JOIN category_taxonomy_map map ON map.source_name = source.name
);

UPDATE rule
SET category_id = (
  SELECT target.id
  FROM category source
  JOIN category_taxonomy_map map ON map.source_name = source.name
  JOIN category target ON target.name = map.target_name
  WHERE source.id = rule.category_id
)
WHERE category_id IN (
  SELECT source.id
  FROM category source
  JOIN category_taxonomy_map map ON map.source_name = source.name
);

UPDATE budget_category_target
SET category_id = (
  SELECT target.id
  FROM category source
  JOIN category_taxonomy_map map ON map.source_name = source.name
  JOIN category target ON target.name = map.target_name
  WHERE source.id = budget_category_target.category_id
)
WHERE category_id IN (
  SELECT source.id
  FROM category source
  JOIN category_taxonomy_map map ON map.source_name = source.name
);

CREATE TEMP TABLE budget_category_target_compacted (
  id INTEGER PRIMARY KEY,
  budget_month_id INTEGER NOT NULL,
  category_id INTEGER NOT NULL,
  amount REAL NOT NULL,
  rollover_amount REAL NOT NULL
);

INSERT INTO budget_category_target_compacted(id, budget_month_id, category_id, amount, rollover_amount)
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
FROM budget_category_target_compacted;

DROP TABLE budget_category_target_compacted;

UPDATE category
SET is_active = 0
WHERE name IN (SELECT source_name FROM category_taxonomy_map);

UPDATE category
SET is_active = 1
WHERE name IN (
  'Income',
  'Business',
  'Housing & Bills',
  'Food',
  'Transport',
  'Health',
  'Lifestyle',
  'Debt',
  'Savings',
  'Travel',
  'Cash & ATM',
  'Transfers',
  'Friends & Family'
);

DROP TABLE category_taxonomy_map;
