-- Migration: Create Claim Appeals table
-- Description: Support for claims appeal workflow (recours/contestation)

-- Claim Appeals table
CREATE TABLE IF NOT EXISTS claim_appeals (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(id),
  adherent_id TEXT NOT NULL REFERENCES adherents(id),

  -- Appeal details
  reason TEXT NOT NULL CHECK(reason IN (
    'coverage_dispute',      -- Contestation de la couverture
    'amount_dispute',        -- Contestation du montant
    'rejection_dispute',     -- Contestation du rejet
    'document_missing',      -- Documents manquants à fournir
    'calculation_error',     -- Erreur de calcul
    'medical_necessity',     -- Nécessité médicale
    'other'                  -- Autre
  )),
  description TEXT NOT NULL,

  -- Supporting documents
  documents_json TEXT, -- JSON array of document URLs

  -- Status workflow
  status TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN (
    'submitted',            -- Soumis
    'under_review',         -- En cours d'examen
    'additional_info_requested', -- Informations complémentaires demandées
    'escalated',            -- Escaladé
    'approved',             -- Approuvé (claim reversed)
    'partially_approved',   -- Partiellement approuvé
    'rejected',             -- Rejeté
    'withdrawn'             -- Retiré par l'adhérent
  )),

  -- Resolution
  resolution_type TEXT CHECK(resolution_type IN (
    'full_reversal',        -- Annulation complète du rejet
    'partial_reversal',     -- Annulation partielle
    'amount_adjustment',    -- Ajustement du montant
    'coverage_clarification', -- Clarification de couverture
    'no_change',            -- Pas de changement
    'other'
  )),
  resolution_notes TEXT,
  resolution_amount REAL, -- New approved amount if applicable

  -- Timeline
  submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at TEXT,
  resolved_at TEXT,

  -- Assigned reviewer
  reviewer_id TEXT REFERENCES users(id),
  escalated_to TEXT REFERENCES users(id),

  -- Communication
  internal_notes TEXT,
  adherent_response TEXT,

  -- Priority
  priority TEXT NOT NULL DEFAULT 'normal' CHECK(priority IN ('low', 'normal', 'high', 'urgent')),

  -- Tracking
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Appeal Comments/History
CREATE TABLE IF NOT EXISTS claim_appeal_comments (
  id TEXT PRIMARY KEY,
  appeal_id TEXT NOT NULL REFERENCES claim_appeals(id),
  user_id TEXT NOT NULL REFERENCES users(id),

  comment_type TEXT NOT NULL CHECK(comment_type IN (
    'status_change',        -- Changement de statut
    'internal_note',        -- Note interne
    'adherent_message',     -- Message de l'adhérent
    'agent_message',        -- Message de l'agent
    'document_added',       -- Document ajouté
    'escalation',           -- Escalade
    'resolution'            -- Résolution
  )),

  content TEXT NOT NULL,
  is_visible_to_adherent INTEGER NOT NULL DEFAULT 0,

  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_claim_appeals_claim_id ON claim_appeals(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_appeals_adherent_id ON claim_appeals(adherent_id);
CREATE INDEX IF NOT EXISTS idx_claim_appeals_status ON claim_appeals(status);
CREATE INDEX IF NOT EXISTS idx_claim_appeals_reviewer_id ON claim_appeals(reviewer_id);
CREATE INDEX IF NOT EXISTS idx_claim_appeals_submitted_at ON claim_appeals(submitted_at);
CREATE INDEX IF NOT EXISTS idx_claim_appeal_comments_appeal_id ON claim_appeal_comments(appeal_id);
