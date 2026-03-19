-- Migration: 0092_create_group_contracts
-- Description: Create tables for group insurance contracts (contrat d'assurance groupe)
-- and their associated guarantee categories (rubriques de garantie)

-- Table: group_contracts (contrat groupe lié à une société)
CREATE TABLE IF NOT EXISTS group_contracts (
  id TEXT PRIMARY KEY,
  contract_number TEXT NOT NULL UNIQUE,  -- Ex: N°2026 701 000 08

  -- Parties
  company_id TEXT NOT NULL REFERENCES companies(id),
  insurer_id TEXT NOT NULL REFERENCES insurers(id),
  intermediary_name TEXT,           -- Courtier/Intermédiaire
  intermediary_code TEXT,           -- Code intermédiaire

  -- Dates
  effective_date TEXT NOT NULL,     -- Date effet du contrat
  annual_renewal_date TEXT,         -- Échéance annuelle
  end_date TEXT,                    -- Date fin (si pas renouvellement)

  -- Risques garantis
  risk_illness INTEGER NOT NULL DEFAULT 1,        -- Maladie et maternité
  risk_disability INTEGER NOT NULL DEFAULT 0,     -- Incapacité/Invalidité
  risk_death INTEGER NOT NULL DEFAULT 0,          -- Décès

  -- Plafonds globaux
  annual_global_limit REAL,         -- Maximum global par prestataire/an (ex: 6000 DT)
  carence_days INTEGER DEFAULT 0,   -- Délai de carence

  -- Bénéficiaires couverts
  covers_spouse INTEGER NOT NULL DEFAULT 1,
  covers_children INTEGER NOT NULL DEFAULT 1,
  children_max_age INTEGER DEFAULT 20,
  children_student_max_age INTEGER DEFAULT 28,
  covers_disabled_children INTEGER NOT NULL DEFAULT 1,
  covers_retirees INTEGER NOT NULL DEFAULT 0,

  -- Document source
  document_url TEXT,                -- URL R2 du PDF contrat
  document_id TEXT REFERENCES documents(id),

  -- Metadata
  plan_category TEXT DEFAULT 'standard' CHECK(plan_category IN ('basic', 'standard', 'premium', 'vip')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'suspended', 'expired', 'cancelled')),
  notes TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_group_contracts_company ON group_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_group_contracts_insurer ON group_contracts(insurer_id);
CREATE INDEX IF NOT EXISTS idx_group_contracts_status ON group_contracts(status);
CREATE INDEX IF NOT EXISTS idx_group_contracts_number ON group_contracts(contract_number);

-- Table: contract_guarantees (les 18 rubriques de garantie)
CREATE TABLE IF NOT EXISTS contract_guarantees (
  id TEXT PRIMARY KEY,
  group_contract_id TEXT NOT NULL REFERENCES group_contracts(id) ON DELETE CASCADE,

  -- Identification
  guarantee_number INTEGER NOT NULL,  -- 1-18 (ordre dans le tableau)
  care_type TEXT NOT NULL CHECK(care_type IN (
    'consultation', 'pharmacy', 'laboratory', 'optical', 'refractive_surgery',
    'medical_acts', 'transport', 'surgery', 'orthopedics', 'hospitalization',
    'maternity', 'ivg', 'dental', 'orthodontics', 'circumcision',
    'sanatorium', 'thermal_cure', 'funeral'
  )),
  label TEXT NOT NULL,                -- Libellé (ex: "Soins médicaux", "Frais pharmaceutiques")

  -- Taux et plafonds
  reimbursement_rate REAL,            -- Taux remboursement (0.80 = 80%)
  is_fixed_amount INTEGER NOT NULL DEFAULT 0,  -- Forfait vs pourcentage

  -- Plafonds
  annual_limit REAL,                  -- Plafond annuel par prestataire
  per_event_limit REAL,              -- Plafond par acte/événement
  daily_limit REAL,                  -- Plafond journalier (hospitalisation)
  max_days INTEGER,                  -- Nombre max de jours (sanatorium, etc.)

  -- Lettres-clés (barème tunisien)
  letter_keys_json TEXT,             -- JSON: {"C1": 45, "C2": 55, "C3": 55, "V1": 50}

  -- Sous-limites spécifiques (JSON pour flexibilité)
  sub_limits_json TEXT,              -- JSON: {"monture": 300, "verres_normaux": 200, "lentilles": 150}

  -- Conditions
  conditions_text TEXT,              -- Conditions en texte libre
  requires_prescription INTEGER NOT NULL DEFAULT 0,
  requires_cnam_complement INTEGER NOT NULL DEFAULT 0,  -- En complément CNAM
  renewal_period_months INTEGER,     -- Période de renouvellement (ex: 24 mois pour optique)
  age_limit INTEGER,                 -- Limite d'âge (ex: 20 ans pour orthodontie)
  waiting_period_days INTEGER DEFAULT 0,

  -- Exclusions spécifiques à cette garantie
  exclusions_text TEXT,

  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contract_guarantees_group ON contract_guarantees(group_contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_guarantees_type ON contract_guarantees(care_type);
