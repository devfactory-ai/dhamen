-- Migration: Create Pre-Authorization tables
-- Description: Support for prior authorization workflow (accord préalable)

-- Pre-Authorization requests table
CREATE TABLE IF NOT EXISTS pre_authorizations (
  id TEXT PRIMARY KEY,
  authorization_number TEXT UNIQUE, -- Generated upon approval (e.g., AP-2024-00001)

  -- Request details
  adherent_id TEXT NOT NULL REFERENCES adherents(id),
  provider_id TEXT NOT NULL REFERENCES providers(id),
  insurer_id TEXT NOT NULL REFERENCES insurers(id),
  contract_id TEXT REFERENCES contracts(id),

  -- Care details
  care_type TEXT NOT NULL CHECK(care_type IN (
    'hospitalization',     -- Hospitalisation
    'surgery',             -- Chirurgie
    'mri',                 -- IRM
    'scanner',             -- Scanner
    'specialized_exam',    -- Examen spécialisé
    'dental_prosthesis',   -- Prothèse dentaire
    'optical',             -- Optique (lunettes, lentilles)
    'physical_therapy',    -- Kinésithérapie
    'chronic_treatment',   -- Traitement chronique
    'expensive_medication',-- Médicament coûteux
    'other'                -- Autre
  )),
  procedure_code TEXT,           -- Code acte (NGAP, CCAM equivalent)
  procedure_description TEXT NOT NULL,

  -- Medical justification
  diagnosis_code TEXT,           -- Code CIM-10
  diagnosis_description TEXT,
  medical_justification TEXT NOT NULL,
  prescribing_doctor TEXT,       -- Médecin prescripteur
  prescription_date TEXT,

  -- Financial
  estimated_amount REAL NOT NULL,
  approved_amount REAL,
  coverage_rate REAL,            -- Taux de couverture appliqué

  -- Dates
  requested_care_date TEXT,      -- Date souhaitée pour le soin
  validity_start_date TEXT,      -- Début de validité (après approbation)
  validity_end_date TEXT,        -- Fin de validité

  -- Status workflow
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
    'draft',               -- Brouillon
    'pending',             -- En attente de traitement
    'under_review',        -- En cours d'examen
    'additional_info',     -- Informations complémentaires demandées
    'medical_review',      -- Revue médicale requise
    'approved',            -- Approuvé
    'partially_approved',  -- Approuvé partiellement
    'rejected',            -- Rejeté
    'expired',             -- Expiré
    'cancelled',           -- Annulé
    'used'                 -- Utilisé (claim créé)
  )),

  -- Rejection/approval details
  decision_reason TEXT,
  decision_notes TEXT,

  -- Reviewer
  reviewer_id TEXT REFERENCES users(id),
  medical_reviewer_id TEXT REFERENCES users(id),

  -- Linked claim (when authorization is used)
  claim_id TEXT REFERENCES claims(id),

  -- Documents
  documents_json TEXT, -- JSON array of document URLs

  -- Priority
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),
  is_emergency INTEGER NOT NULL DEFAULT 0,

  -- Tracking
  submitted_at TEXT,
  reviewed_at TEXT,
  decided_at TEXT,
  used_at TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Pre-Authorization history/comments
CREATE TABLE IF NOT EXISTS pre_authorization_history (
  id TEXT PRIMARY KEY,
  pre_auth_id TEXT NOT NULL REFERENCES pre_authorizations(id),
  user_id TEXT NOT NULL REFERENCES users(id),

  action TEXT NOT NULL CHECK(action IN (
    'created',
    'submitted',
    'status_changed',
    'info_requested',
    'info_provided',
    'assigned',
    'reviewed',
    'approved',
    'rejected',
    'modified',
    'cancelled',
    'expired',
    'used',
    'comment'
  )),

  old_status TEXT,
  new_status TEXT,
  comment TEXT,
  is_internal INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Pre-Authorization rules (auto-approval rules per insurer)
CREATE TABLE IF NOT EXISTS pre_authorization_rules (
  id TEXT PRIMARY KEY,
  insurer_id TEXT NOT NULL REFERENCES insurers(id),

  care_type TEXT NOT NULL,
  procedure_code TEXT,              -- Optional: specific procedure code

  -- Rule conditions
  max_auto_approve_amount REAL,     -- Auto-approve if under this amount
  requires_medical_review INTEGER NOT NULL DEFAULT 0,
  requires_documents INTEGER NOT NULL DEFAULT 1,
  min_days_advance INTEGER DEFAULT 3,  -- Minimum days before care date

  -- Validity settings
  default_validity_days INTEGER DEFAULT 30,

  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_pre_auth_adherent ON pre_authorizations(adherent_id);
CREATE INDEX IF NOT EXISTS idx_pre_auth_provider ON pre_authorizations(provider_id);
CREATE INDEX IF NOT EXISTS idx_pre_auth_insurer ON pre_authorizations(insurer_id);
CREATE INDEX IF NOT EXISTS idx_pre_auth_status ON pre_authorizations(status);
CREATE INDEX IF NOT EXISTS idx_pre_auth_number ON pre_authorizations(authorization_number);
CREATE INDEX IF NOT EXISTS idx_pre_auth_care_type ON pre_authorizations(care_type);
CREATE INDEX IF NOT EXISTS idx_pre_auth_validity ON pre_authorizations(validity_start_date, validity_end_date);
CREATE INDEX IF NOT EXISTS idx_pre_auth_history_pre_auth ON pre_authorization_history(pre_auth_id);
CREATE INDEX IF NOT EXISTS idx_pre_auth_rules_insurer ON pre_authorization_rules(insurer_id, care_type);
