-- Migration: Add provider_id to bulletins_soins and mf columns to providers
-- Made idempotent: skip ADD COLUMN if column already exists

-- Add MF (matricule fiscal) columns to providers
ALTER TABLE providers ADD COLUMN mf_number TEXT;
ALTER TABLE providers ADD COLUMN mf_verified INTEGER DEFAULT 0;
ALTER TABLE providers ADD COLUMN mf_verification_id TEXT;

CREATE INDEX IF NOT EXISTS idx_providers_mf_number ON providers(mf_number);

-- Add provider_id to bulletins_soins (optional FK to providers)
ALTER TABLE bulletins_soins ADD COLUMN provider_id TEXT REFERENCES providers(id);

CREATE INDEX IF NOT EXISTS idx_bulletins_soins_provider_id ON bulletins_soins(provider_id);

-- Add provider_id to actes_bulletin for per-acte provider tracking
ALTER TABLE actes_bulletin ADD COLUMN provider_id TEXT REFERENCES providers(id);
