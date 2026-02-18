-- Migration: Create contracts table
-- Description: Insurance contracts linking adherents to insurers

CREATE TABLE IF NOT EXISTS contracts (
  id TEXT PRIMARY KEY,
  insurer_id TEXT NOT NULL REFERENCES insurers(id),
  adherent_id TEXT NOT NULL REFERENCES adherents(id),
  contract_number TEXT NOT NULL,
  plan_type TEXT NOT NULL CHECK (plan_type IN ('individual', 'family', 'corporate')),
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  carence_days INTEGER DEFAULT 0,
  annual_limit INTEGER,
  coverage_json TEXT NOT NULL,
  exclusions_json TEXT DEFAULT '[]',
  status TEXT DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'expired', 'cancelled')),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contracts_adherent ON contracts(adherent_id);
CREATE INDEX IF NOT EXISTS idx_contracts_insurer ON contracts(insurer_id);
CREATE INDEX IF NOT EXISTS idx_contracts_status ON contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_number ON contracts(contract_number);
CREATE INDEX IF NOT EXISTS idx_contracts_dates ON contracts(start_date, end_date);
