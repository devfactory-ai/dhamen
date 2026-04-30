-- Migration: Create baremes_tp module
-- A TP (Tableau de Prestations) is a reusable schedule of benefits (barème)
-- that can be applied to one or more group contracts.

CREATE TABLE IF NOT EXISTS baremes_tp (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,                       -- e.g., "Barème BH Assurance 2025"
  year INTEGER NOT NULL,                    -- Année d'application
  description TEXT,
  insurer_id TEXT REFERENCES insurers(id),  -- Scope to an insurer (optional)
  document_url TEXT,                        -- R2 URL of source PDF
  status TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','archived')),
  created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_baremes_tp_insurer ON baremes_tp(insurer_id);
CREATE INDEX IF NOT EXISTS idx_baremes_tp_year ON baremes_tp(year);
CREATE INDEX IF NOT EXISTS idx_baremes_tp_status ON baremes_tp(status);

-- bareme_tp_guarantees: the 18 guarantee rows of a TP
-- Same structure as contract_guarantees (minus group_contract_id)
CREATE TABLE IF NOT EXISTS bareme_tp_guarantees (
  id TEXT PRIMARY KEY,
  bareme_tp_id TEXT NOT NULL REFERENCES baremes_tp(id) ON DELETE CASCADE,
  guarantee_number INTEGER NOT NULL,
  care_type TEXT NOT NULL CHECK(care_type IN (
    'consultation', 'pharmacy', 'laboratory', 'optical', 'refractive_surgery',
    'medical_acts', 'transport', 'surgery', 'orthopedics', 'hospitalization',
    'maternity', 'ivg', 'dental', 'orthodontics', 'circumcision',
    'sanatorium', 'thermal_cure', 'funeral',
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

CREATE INDEX IF NOT EXISTS idx_bareme_tp_guarantees_tp ON bareme_tp_guarantees(bareme_tp_id);

-- Track provenance on contract_guarantees (informational only, no runtime effect)
-- Column bareme_tp_id already exists on environments where baremes_tp was partially deployed.
-- ALTER TABLE contract_guarantees ADD COLUMN bareme_tp_id TEXT REFERENCES baremes_tp(id);
-- Skipped: applied manually or via prior partial run.
