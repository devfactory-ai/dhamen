-- Migration: 0160_add_actes_specialistes_care_type
-- Add actes_specialistes as a distinct care_type for specialist acts (Z, E, ELR, K, R, TS, PHY)
-- SQLite doesn't support ALTER CHECK, so we recreate the tables (same pattern as 0151).

-- 1. contract_guarantees
CREATE TABLE IF NOT EXISTS contract_guarantees_new (
  id TEXT PRIMARY KEY,
  group_contract_id TEXT NOT NULL REFERENCES group_contracts(id) ON DELETE CASCADE,

  guarantee_number INTEGER NOT NULL,
  care_type TEXT NOT NULL CHECK(care_type IN (
    'consultation', 'pharmacy', 'laboratory', 'optical', 'refractive_surgery',
    'medical_acts', 'transport', 'surgery', 'orthopedics', 'hospitalization',
    'maternity', 'ivg', 'dental', 'orthodontics', 'circumcision',
    'sanatorium', 'thermal_cure', 'funeral',
    'consultation_visite', 'pharmacie', 'laboratoire', 'optique', 'chirurgie_refractive',
    'actes_courants', 'actes_specialistes', 'chirurgie', 'orthopedie',
    'hospitalisation', 'hospitalisation_hopital',
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
  bareme_tp_id TEXT REFERENCES baremes_tp(id),

  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO contract_guarantees_new
SELECT id, group_contract_id, guarantee_number, care_type, label,
       reimbursement_rate, is_fixed_amount, annual_limit, per_event_limit,
       daily_limit, max_days, letter_keys_json, sub_limits_json,
       conditions_text, requires_prescription, requires_cnam_complement,
       renewal_period_months, age_limit, waiting_period_days, exclusions_text,
       bareme_tp_id, is_active,
       COALESCE(created_at, datetime('now')),
       COALESCE(updated_at, datetime('now'))
FROM contract_guarantees;
DROP TABLE contract_guarantees;
ALTER TABLE contract_guarantees_new RENAME TO contract_guarantees;

CREATE INDEX IF NOT EXISTS idx_contract_guarantees_group ON contract_guarantees(group_contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_guarantees_type ON contract_guarantees(care_type);

-- 2. bareme_tp_guarantees
CREATE TABLE IF NOT EXISTS bareme_tp_guarantees_new (
  id TEXT PRIMARY KEY,
  bareme_tp_id TEXT NOT NULL REFERENCES baremes_tp(id) ON DELETE CASCADE,
  guarantee_number INTEGER NOT NULL,
  care_type TEXT NOT NULL CHECK(care_type IN (
    'consultation', 'pharmacy', 'laboratory', 'optical', 'refractive_surgery',
    'medical_acts', 'transport', 'surgery', 'orthopedics', 'hospitalization',
    'maternity', 'ivg', 'dental', 'orthodontics', 'circumcision',
    'sanatorium', 'thermal_cure', 'funeral',
    'consultation_visite', 'pharmacie', 'laboratoire', 'optique', 'chirurgie_refractive',
    'actes_courants', 'actes_specialistes', 'chirurgie', 'orthopedie',
    'hospitalisation', 'hospitalisation_hopital',
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

INSERT INTO bareme_tp_guarantees_new
SELECT id, bareme_tp_id, guarantee_number, care_type, label,
       reimbursement_rate, is_fixed_amount, annual_limit, per_event_limit,
       daily_limit, max_days, letter_keys_json, sub_limits_json,
       conditions_text, requires_prescription, requires_cnam_complement,
       renewal_period_months, age_limit, waiting_period_days, exclusions_text,
       is_active,
       COALESCE(created_at, datetime('now')),
       COALESCE(updated_at, datetime('now'))
FROM bareme_tp_guarantees;
DROP TABLE bareme_tp_guarantees;
ALTER TABLE bareme_tp_guarantees_new RENAME TO bareme_tp_guarantees;

CREATE INDEX IF NOT EXISTS idx_bareme_tp_guarantees_tp ON bareme_tp_guarantees(bareme_tp_id);
