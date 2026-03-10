-- Migration: Add 'brouillon' status to sante_demandes
-- REQ-001: Scan feuille de soin — allows creating draft demandes before OCR/upload
--
-- D1/SQLite does not support ALTER CHECK CONSTRAINT.
-- We must recreate the table to update the CHECK constraint.
-- However, since this is a production table with foreign key references,
-- we use a safer approach: drop and recreate the CHECK via a new table pattern.
--
-- NOTE: SQLite CHECK constraints on TEXT columns are advisory in D1.
-- The Zod schema in the API layer is the primary validation.
-- This migration updates the constraint for documentation and defense-in-depth.

-- Step 1: Create new table with updated CHECK constraint
CREATE TABLE IF NOT EXISTS sante_demandes_new (
  id TEXT PRIMARY KEY,
  numero_demande TEXT NOT NULL UNIQUE,
  adherent_id TEXT NOT NULL REFERENCES adherents(id),
  praticien_id TEXT REFERENCES sante_praticiens(id),
  formule_id TEXT REFERENCES sante_garanties_formules(id),
  source TEXT NOT NULL DEFAULT 'adherent' CHECK (source IN ('adherent', 'praticien')),
  type_soin TEXT NOT NULL CHECK (type_soin IN (
    'pharmacie', 'consultation', 'hospitalisation', 'optique', 'dentaire', 'laboratoire', 'kinesitherapie', 'autre'
  )),
  statut TEXT NOT NULL DEFAULT 'soumise' CHECK (statut IN (
    'brouillon', 'soumise', 'en_examen', 'info_requise', 'approuvee', 'en_paiement', 'payee', 'rejetee'
  )),
  montant_demande INTEGER NOT NULL DEFAULT 0,
  montant_rembourse INTEGER,
  montant_reste_charge INTEGER,
  est_tiers_payant INTEGER NOT NULL DEFAULT 0,
  montant_praticien INTEGER,
  date_soin TEXT NOT NULL,
  traite_par TEXT,
  date_traitement TEXT,
  motif_rejet TEXT,
  notes_internes TEXT,
  score_fraude REAL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Step 2: Copy existing data
INSERT INTO sante_demandes_new SELECT * FROM sante_demandes;

-- Step 3: Drop old table
DROP TABLE sante_demandes;

-- Step 4: Rename new table
ALTER TABLE sante_demandes_new RENAME TO sante_demandes;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_sante_demandes_numero ON sante_demandes(numero_demande);
CREATE INDEX IF NOT EXISTS idx_sante_demandes_adherent ON sante_demandes(adherent_id);
CREATE INDEX IF NOT EXISTS idx_sante_demandes_praticien ON sante_demandes(praticien_id);
CREATE INDEX IF NOT EXISTS idx_sante_demandes_statut ON sante_demandes(statut);
CREATE INDEX IF NOT EXISTS idx_sante_demandes_type ON sante_demandes(type_soin);
CREATE INDEX IF NOT EXISTS idx_sante_demandes_source ON sante_demandes(source);
CREATE INDEX IF NOT EXISTS idx_sante_demandes_date ON sante_demandes(date_soin);
CREATE INDEX IF NOT EXISTS idx_sante_demandes_created ON sante_demandes(created_at);
