-- Migration: Create claims table
-- Description: Healthcare claims for reimbursement

CREATE TABLE IF NOT EXISTS claims (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('pharmacy', 'consultation', 'hospitalization')),
  contract_id TEXT NOT NULL REFERENCES contracts(id),
  provider_id TEXT NOT NULL REFERENCES providers(id),
  adherent_id TEXT NOT NULL REFERENCES adherents(id),
  insurer_id TEXT NOT NULL REFERENCES insurers(id),
  total_amount INTEGER NOT NULL,
  covered_amount INTEGER NOT NULL,
  copay_amount INTEGER NOT NULL,
  fraud_score INTEGER DEFAULT 0,
  fraud_flags_json TEXT DEFAULT '[]',
  status TEXT DEFAULT 'pending' CHECK (status IN (
    'pending', 'eligible', 'approved', 'pending_review', 'blocked', 'rejected', 'paid'
  )),
  reconciliation_id TEXT,
  bareme_version TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  validated_at TEXT,
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_claims_adherent ON claims(adherent_id);
CREATE INDEX IF NOT EXISTS idx_claims_provider ON claims(provider_id);
CREATE INDEX IF NOT EXISTS idx_claims_insurer ON claims(insurer_id);
CREATE INDEX IF NOT EXISTS idx_claims_contract ON claims(contract_id);
CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
CREATE INDEX IF NOT EXISTS idx_claims_type ON claims(type);
CREATE INDEX IF NOT EXISTS idx_claims_date ON claims(created_at);
CREATE INDEX IF NOT EXISTS idx_claims_reconciliation ON claims(reconciliation_id);
CREATE INDEX IF NOT EXISTS idx_claims_fraud_score ON claims(fraud_score);
