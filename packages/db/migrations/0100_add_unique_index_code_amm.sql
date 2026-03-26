-- Migration: Replace regular index on code_amm with a UNIQUE partial index
-- Required for INSERT ... ON CONFLICT(code_amm) DO UPDATE upsert pattern
-- Partial index (WHERE code_amm IS NOT NULL) preserves existing PCT medications without code_amm

DROP INDEX IF EXISTS idx_medications_code_amm;
CREATE UNIQUE INDEX IF NOT EXISTS idx_medications_code_amm_unique ON medications(code_amm) WHERE code_amm IS NOT NULL;
