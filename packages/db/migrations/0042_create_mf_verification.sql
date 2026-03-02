-- Migration: Create MF (Matricule Fiscal) verification table for practitioners
-- MF = Matricule Fiscal (Tax ID in Tunisia)

CREATE TABLE IF NOT EXISTS practitioner_mf_verifications (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  mf_number TEXT NOT NULL,
  company_name TEXT,
  activity_type TEXT,
  registration_date TEXT,
  verification_status TEXT NOT NULL DEFAULT 'pending', -- pending, verified, rejected, expired
  verification_date TEXT,
  verified_by TEXT REFERENCES users(id),
  verification_source TEXT, -- manual, api, document
  rejection_reason TEXT,
  document_url TEXT,
  raw_response_json TEXT,
  expires_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mf_verifications_provider ON practitioner_mf_verifications(provider_id);
CREATE INDEX IF NOT EXISTS idx_mf_verifications_mf_number ON practitioner_mf_verifications(mf_number);
CREATE INDEX IF NOT EXISTS idx_mf_verifications_status ON practitioner_mf_verifications(verification_status);

-- Note: MF fields (mf_number, mf_verified, mf_verification_id) may already exist in providers table
-- SQLite doesn't support ADD COLUMN IF NOT EXISTS, skipping to avoid duplicate column errors
