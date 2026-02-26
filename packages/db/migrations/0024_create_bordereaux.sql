-- Migration: Create Sante Bordereaux tables
-- Bordereaux are periodic summaries of approved claims for bulk payment (Sante module)

CREATE TABLE IF NOT EXISTS sante_bordereaux (
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
CREATE TABLE IF NOT EXISTS sante_bordereau_lignes (
  id TEXT PRIMARY KEY,
  bordereau_id TEXT NOT NULL REFERENCES sante_bordereaux(id) ON DELETE CASCADE,
  demande_id TEXT NOT NULL REFERENCES sante_demandes(id),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_sante_bordereaux_statut ON sante_bordereaux(statut);
CREATE INDEX IF NOT EXISTS idx_sante_bordereaux_periode ON sante_bordereaux(periode_debut, periode_fin);
CREATE INDEX IF NOT EXISTS idx_sante_bordereaux_date_generation ON sante_bordereaux(date_generation);
CREATE INDEX IF NOT EXISTS idx_sante_bordereau_lignes_bordereau ON sante_bordereau_lignes(bordereau_id);
CREATE INDEX IF NOT EXISTS idx_sante_bordereau_lignes_demande ON sante_bordereau_lignes(demande_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_sante_bordereau_lignes_unique ON sante_bordereau_lignes(demande_id);
