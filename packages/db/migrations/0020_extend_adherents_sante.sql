-- Migration: Extend adherents table for SoinFlow
-- Description: Add SoinFlow-specific columns to unify Dhamen and Santé adherents

-- Module discriminator: 'dhamen' (default) or 'sante'
ALTER TABLE adherents ADD COLUMN module TEXT DEFAULT 'dhamen'
  CHECK (module IN ('dhamen', 'sante'));

-- SoinFlow-specific fields
ALTER TABLE adherents ADD COLUMN matricule TEXT;
ALTER TABLE adherents ADD COLUMN formule_id TEXT;
ALTER TABLE adherents ADD COLUMN plafond_global INTEGER; -- Annual ceiling in millimes
ALTER TABLE adherents ADD COLUMN ayants_droit_json TEXT DEFAULT '[]'; -- JSON array of dependents

-- Company for group contracts (for 'sante' module)
ALTER TABLE adherents ADD COLUMN company_name TEXT;
ALTER TABLE adherents ADD COLUMN company_id TEXT;

-- Create indexes for SoinFlow queries
CREATE INDEX IF NOT EXISTS idx_adherents_module ON adherents(module);
CREATE INDEX IF NOT EXISTS idx_adherents_matricule ON adherents(matricule);
CREATE INDEX IF NOT EXISTS idx_adherents_formule ON adherents(formule_id);
CREATE INDEX IF NOT EXISTS idx_adherents_company ON adherents(company_id);
