CREATE TABLE IF NOT EXISTS subcategory (
    id INTEGER PRIMARY KEY,
    category_id INTEGER NOT NULL REFERENCES category(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_subcategory_category_normalized_name
    ON subcategory(category_id, normalized_name);

ALTER TABLE transaction_split ADD COLUMN subcategory_id INTEGER REFERENCES subcategory(id);

ALTER TABLE merchant_profile ADD COLUMN default_subcategory_id INTEGER REFERENCES subcategory(id);
