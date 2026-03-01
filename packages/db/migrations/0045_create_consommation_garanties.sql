-- Migration: Create consommation_garanties table
-- Suivi de consommation des garanties par adhérent et ayant droit

-- Table des plafonds par type de soin (définis dans le contrat)
CREATE TABLE IF NOT EXISTS contract_coverage_limits (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id),
  care_type TEXT NOT NULL, -- consultation, pharmacy, lab, hospital, dental, optical, maternity
  care_label TEXT NOT NULL, -- Label français
  annual_limit REAL NOT NULL, -- Plafond annuel en TND
  per_event_limit REAL, -- Plafond par acte (optionnel)
  reimbursement_rate REAL NOT NULL DEFAULT 80, -- Taux de remboursement %
  waiting_period_days INTEGER DEFAULT 0, -- Délai de carence
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_coverage_limits_contract ON contract_coverage_limits(contract_id);
CREATE INDEX IF NOT EXISTS idx_coverage_limits_type ON contract_coverage_limits(care_type);

-- Table de consommation par bénéficiaire
CREATE TABLE IF NOT EXISTS beneficiary_consumption (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id),
  adherent_id TEXT NOT NULL REFERENCES adherents(id),
  beneficiary_id TEXT, -- NULL = adherent principal
  beneficiary_name TEXT NOT NULL,
  care_type TEXT NOT NULL,
  year INTEGER NOT NULL,
  total_consumed REAL NOT NULL DEFAULT 0,
  total_claims INTEGER NOT NULL DEFAULT 0,
  last_claim_date TEXT,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_consumption_unique ON beneficiary_consumption(contract_id, COALESCE(beneficiary_id, 'principal'), care_type, year);
CREATE INDEX IF NOT EXISTS idx_consumption_adherent ON beneficiary_consumption(adherent_id);
CREATE INDEX IF NOT EXISTS idx_consumption_year ON beneficiary_consumption(year);
