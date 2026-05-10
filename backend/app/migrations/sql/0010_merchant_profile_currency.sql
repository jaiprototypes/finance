ALTER TABLE merchant_profile
ADD COLUMN currency TEXT NOT NULL DEFAULT '';

DROP INDEX IF EXISTS ux_merchant_profile_norm;

CREATE UNIQUE INDEX IF NOT EXISTS ux_merchant_profile_norm_currency
  ON merchant_profile(normalized_name, currency);
