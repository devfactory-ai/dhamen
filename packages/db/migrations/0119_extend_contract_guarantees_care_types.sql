-- Migration: 0119_extend_contract_guarantees_care_types
-- Description: Extend care_type CHECK constraint on contract_guarantees to accept
-- both English and French care type values (frontend sends French).

-- SQLite doesn't support ALTER CHECK, so we recreate the table.

CREATE TABLE IF NOT EXISTS contract_guarantees_new (
  id TEXT PRIMARY KEY,
  group_contract_id TEXT NOT NULL REFERENCES group_contracts(id) ON DELETE CASCADE,

  guarantee_number INTEGER NOT NULL,
  care_type TEXT NOT NULL CHECK(care_type IN (
    -- English (legacy)
    'consultation', 'pharmacy', 'laboratory', 'optical', 'refractive_surgery',
    'medical_acts', 'transport', 'surgery', 'orthopedics', 'hospitalization',
    'maternity', 'ivg', 'dental', 'orthodontics', 'circumcision',
    'sanatorium', 'thermal_cure', 'funeral',
    -- French (frontend)
    'consultation_visite', 'pharmacie', 'laboratoire', 'optique', 'chirurgie_refractive',
    'actes_courants', 'chirurgie', 'orthopedie', 'hospitalisation',
    'accouchement', 'interruption_grossesse', 'dentaire', 'orthodontie',
    'circoncision', 'cures_thermales', 'frais_funeraires'
  )),
  label TEXT NOT NULL,

  reimbursement_rate REAL,
  is_fixed_amount INTEGER NOT NULL DEFAULT 0,

  annual_limit REAL,
  per_event_limit REAL,
  daily_limit REAL,
  max_days INTEGER,

  letter_keys_json TEXT,
  sub_limits_json TEXT,

  conditions_text TEXT,
  requires_prescription INTEGER NOT NULL DEFAULT 0,
  requires_cnam_complement INTEGER NOT NULL DEFAULT 0,
  renewal_period_months INTEGER,
  age_limit INTEGER,
  waiting_period_days INTEGER DEFAULT 0,

  exclusions_text TEXT,

  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Copy all existing data
INSERT INTO contract_guarantees_new
SELECT * FROM contract_guarantees;

-- Swap tables
DROP TABLE contract_guarantees;
ALTER TABLE contract_guarantees_new RENAME TO contract_guarantees;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_contract_guarantees_group ON contract_guarantees(group_contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_guarantees_type ON contract_guarantees(care_type);
