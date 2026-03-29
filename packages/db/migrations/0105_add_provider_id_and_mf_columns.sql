-- Migration: Add provider_id to bulletins_soins and mf columns to providers
-- NOTE: mf_* columns already exist on staging. provider_id columns need to be added.

CREATE INDEX IF NOT EXISTS idx_providers_mf_number ON providers(mf_number);

-- Add provider_id to bulletins_soins
ALTER TABLE bulletins_soins ADD COLUMN provider_id TEXT REFERENCES providers(id);
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_provider_id ON bulletins_soins(provider_id);

-- Add provider_id to actes_bulletin
ALTER TABLE actes_bulletin ADD COLUMN provider_id TEXT REFERENCES providers(id);
