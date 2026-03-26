-- Fix: Replace partial unique index with full unique index on code_amm
-- SQLite partial indexes (WHERE ... IS NOT NULL) are incompatible with ON CONFLICT upsert
-- NULL values are always considered distinct in SQLite, so existing PCT meds without code_amm are unaffected

DROP INDEX IF EXISTS idx_medications_code_amm_unique;
CREATE UNIQUE INDEX IF NOT EXISTS idx_medications_code_amm ON medications(code_amm);
