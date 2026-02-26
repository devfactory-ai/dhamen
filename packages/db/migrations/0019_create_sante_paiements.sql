-- Migration: Create SoinFlow Paiements table
-- For tracking individual payments to adherents or praticiens

CREATE TABLE IF NOT EXISTS sante_paiements (
  id TEXT PRIMARY KEY,
  demande_id TEXT NOT NULL REFERENCES sante_demandes(id),
  type_beneficiaire TEXT NOT NULL CHECK (type_beneficiaire IN ('adherent', 'praticien')),
  beneficiaire_id TEXT NOT NULL,
  montant INTEGER NOT NULL CHECK (montant > 0),
  methode TEXT NOT NULL CHECK (methode IN ('virement', 'cheque', 'especes')),
  rib_encrypted TEXT,
  statut TEXT NOT NULL DEFAULT 'en_attente' CHECK (statut IN ('en_attente', 'initie', 'execute', 'echoue', 'annule')),
  date_initiation TEXT,
  date_execution TEXT,
  reference_paiement TEXT,
  motif_echec TEXT,
  idempotency_key TEXT UNIQUE,
  initie_par TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_sante_paiements_demande ON sante_paiements(demande_id);
CREATE INDEX IF NOT EXISTS idx_sante_paiements_beneficiaire ON sante_paiements(beneficiaire_id);
CREATE INDEX IF NOT EXISTS idx_sante_paiements_statut ON sante_paiements(statut);
CREATE INDEX IF NOT EXISTS idx_sante_paiements_created ON sante_paiements(created_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sante_paiements_idempotency ON sante_paiements(idempotency_key) WHERE idempotency_key IS NOT NULL;
