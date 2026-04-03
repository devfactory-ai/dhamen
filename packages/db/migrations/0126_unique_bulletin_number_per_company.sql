-- Migration: 0126_unique_bulletin_number_per_company
-- Description: Add unique index on bulletin_number + company_id to enforce uniqueness per company

CREATE UNIQUE INDEX IF NOT EXISTS idx_bulletins_soins_number_company
  ON bulletins_soins(bulletin_number, company_id)
  WHERE company_id IS NOT NULL;
