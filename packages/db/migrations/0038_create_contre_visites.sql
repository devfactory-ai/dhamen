-- Migration: Create contre_visites table
-- Description: Track follow-up examinations requested by insurers for reimbursement claims

-- ============================================
-- Table: sante_contre_visites
-- Description: Follow-up medical examinations requested by insurers
-- ============================================
CREATE TABLE IF NOT EXISTS sante_contre_visites (
  id TEXT PRIMARY KEY,

  -- Link to the reimbursement request
  demande_id TEXT NOT NULL REFERENCES sante_demandes(id) ON DELETE CASCADE,

  -- Reference number
  numero_contre_visite TEXT NOT NULL UNIQUE,

  -- Practitioner assigned for the follow-up examination
  praticien_id TEXT REFERENCES sante_praticiens(id),

  -- Status workflow
  statut TEXT NOT NULL DEFAULT 'demandee' CHECK (statut IN (
    'demandee',      -- Requested by insurer
    'planifiee',     -- Scheduled with practitioner and date
    'en_attente',    -- Waiting for adherent to attend
    'effectuee',     -- Examination completed
    'rapport_soumis', -- Report submitted by practitioner
    'validee',       -- Validated by insurer
    'annulee'        -- Cancelled
  )),

  -- Reason for requesting the follow-up
  motif TEXT NOT NULL,
  description TEXT,

  -- Scheduling
  date_demande TEXT NOT NULL DEFAULT (datetime('now')),
  date_planifiee TEXT,
  date_limite TEXT, -- Deadline for the examination
  date_effectuee TEXT,

  -- Location
  lieu TEXT,
  adresse TEXT,
  ville TEXT,

  -- Practitioner's report
  rapport TEXT,
  conclusion TEXT CHECK (conclusion IN (
    'confirme',           -- Confirms the original claim
    'partiellement_confirme', -- Partially confirms
    'non_confirme',       -- Does not confirm (potential fraud/error)
    'examen_complementaire'   -- Additional examination needed
  )),

  -- Impact on the original claim
  impact_montant INTEGER, -- Suggested adjustment to reimbursement amount (millimes)
  impact_decision TEXT CHECK (impact_decision IN (
    'maintenir',     -- Maintain original decision
    'reduire',       -- Reduce reimbursement
    'rejeter',       -- Reject the claim
    'approuver'      -- Approve (if was pending)
  )),

  -- Documents (R2 keys stored as JSON array)
  documents_json TEXT DEFAULT '[]',

  -- Audit
  demande_par TEXT REFERENCES users(id), -- Insurer agent who requested
  traite_par TEXT REFERENCES users(id),  -- Who processed the result
  notes_internes TEXT,

  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contre_visites_demande ON sante_contre_visites(demande_id);
CREATE INDEX IF NOT EXISTS idx_contre_visites_numero ON sante_contre_visites(numero_contre_visite);
CREATE INDEX IF NOT EXISTS idx_contre_visites_praticien ON sante_contre_visites(praticien_id);
CREATE INDEX IF NOT EXISTS idx_contre_visites_statut ON sante_contre_visites(statut);
CREATE INDEX IF NOT EXISTS idx_contre_visites_date_planifiee ON sante_contre_visites(date_planifiee);
CREATE INDEX IF NOT EXISTS idx_contre_visites_date_limite ON sante_contre_visites(date_limite);

-- Add contre_visite status to sante_demandes
ALTER TABLE sante_demandes ADD COLUMN contre_visite_requise INTEGER DEFAULT 0;
ALTER TABLE sante_demandes ADD COLUMN contre_visite_id TEXT REFERENCES sante_contre_visites(id);
