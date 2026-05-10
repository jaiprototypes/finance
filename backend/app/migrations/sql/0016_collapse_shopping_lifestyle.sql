INSERT INTO category(name, personal_allowed, business_allowed, tax_code, is_active)
SELECT 'Lifestyle', 1, 1, NULL, 1
WHERE EXISTS (
  SELECT 1 FROM category WHERE name = 'Shopping & Lifestyle'
)
AND NOT EXISTS (
  SELECT 1 FROM category WHERE name = 'Lifestyle'
);

UPDATE transaction_split
SET category_id = (SELECT id FROM category WHERE name = 'Lifestyle')
WHERE category_id = (SELECT id FROM category WHERE name = 'Shopping & Lifestyle');

UPDATE merchant_profile
SET default_category_id = (SELECT id FROM category WHERE name = 'Lifestyle')
WHERE default_category_id = (SELECT id FROM category WHERE name = 'Shopping & Lifestyle');

UPDATE transaction_memory
SET category_id = (SELECT id FROM category WHERE name = 'Lifestyle')
WHERE category_id = (SELECT id FROM category WHERE name = 'Shopping & Lifestyle');

UPDATE classification_audit
SET category_id = (SELECT id FROM category WHERE name = 'Lifestyle')
WHERE category_id = (SELECT id FROM category WHERE name = 'Shopping & Lifestyle');

UPDATE rule
SET category_id = (SELECT id FROM category WHERE name = 'Lifestyle')
WHERE category_id = (SELECT id FROM category WHERE name = 'Shopping & Lifestyle');

UPDATE budget_category_target
SET category_id = (SELECT id FROM category WHERE name = 'Lifestyle')
WHERE category_id = (SELECT id FROM category WHERE name = 'Shopping & Lifestyle');

UPDATE category
SET is_active = 0
WHERE name = 'Shopping & Lifestyle';
