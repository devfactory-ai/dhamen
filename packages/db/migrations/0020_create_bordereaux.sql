-- Migration: Create Bordereaux tables
-- Bordereaux are periodic summaries of approved claims for bulk payment

CREATE TABLE IF NOT EXISTS bordereaux (
  id TEXT PRIMARY KEY,
  numero_bordereau TEXT NOT NULL UNIQUE,
  periode_debut TEXT NOT NULL,
  periode_fin TEXT NOT NULL,
  nombre_demandes INTEGER NOT NULL DEFAULT 0,
  montant_total INTEGER NOT NULL DEFAULT 0,
  statut TEXT NOT NULL DEFAULT 'genere' CHECK (statut IN ('genere', 'valide', 'envoye', 'paye', 'annule')),
  date_generation TEXT NOT NULL,
  date_validation TEXT,
  date_envoi TEXT,
  date_paiement TEXT,
  genere_par TEXT NOT NULL REFERENCES users(id),
  valide_par TEXT REFERENCES users(id),
  notes TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Bordereau lines - links to individual demandes
CREATE TABLE IF NOT EXISTS bordereau_lignes (
  id TEXT PRIMARY KEY,
  bordereau_id TEXT NOT NULL REFERENCES bordereaux(id) ON DELETE CASCADE,
  demande_id TEXT NOT NULL REFERENCES sante_demandes(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bordereaux_statut ON bordereaux(statut);
CREATE INDEX IF NOT EXISTS idx_bordereaux_periode ON bordereaux(periode_debut, periode_fin);
CREATE INDEX IF NOT EXISTS idx_bordereaux_date_generation ON bordereaux(date_generation);
CREATE INDEX IF NOT EXISTS idx_bordereau_lignes_bordereau ON bordereau_lignes(bordereau_id);
CREATE INDEX IF NOT EXISTS idx_bordereau_lignes_demande ON bordereau_lignes(demande_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_bordereau_lignes_unique ON bordereau_lignes(demande_id);
