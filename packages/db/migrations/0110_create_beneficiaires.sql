-- Migration: 0110_create_beneficiaires
-- Description: Create a beneficiaires table to unify adherent + ayants droit (conjoint, enfants)
-- This provides a single table to query "who received care" on a bulletin.
-- The adherent themselves is also a row with type_beneficiaire='adherent'.
-- Data is populated from existing adherents table using code_type and parent_adherent_id.

CREATE TABLE IF NOT EXISTS beneficiaires (
  id TEXT PRIMARY KEY,
  adherent_id TEXT NOT NULL REFERENCES adherents(id),
  type_beneficiaire TEXT NOT NULL CHECK (type_beneficiaire IN ('adherent', 'conjoint', 'enfant')),
  nom TEXT NOT NULL,
  prenom TEXT NOT NULL,
  date_naissance TEXT,
  cin TEXT,
  lien_parente TEXT, -- 'conjoint', 'fils', 'fille', or NULL for adherent principal
  est_actif INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_beneficiaires_adherent ON beneficiaires(adherent_id);
CREATE INDEX IF NOT EXISTS idx_beneficiaires_type ON beneficiaires(type_beneficiaire);
CREATE INDEX IF NOT EXISTS idx_beneficiaires_actif ON beneficiaires(est_actif);

-- Populate from existing adherents data:
-- 1. Principal adherents (code_type = 'A' or parent_adherent_id IS NULL)
INSERT OR IGNORE INTO beneficiaires (id, adherent_id, type_beneficiaire, nom, prenom, date_naissance, cin, lien_parente, est_actif, created_at, updated_at)
SELECT
  'BEN-' || id,
  id,
  'adherent',
  COALESCE(last_name, ''),
  COALESCE(first_name, ''),
  date_of_birth,
  national_id,
  NULL,
  CASE WHEN is_active = 1 THEN 1 ELSE 0 END,
  created_at,
  COALESCE(updated_at, created_at)
FROM adherents
WHERE (code_type = 'A' OR code_type IS NULL) AND parent_adherent_id IS NULL;

-- 2. Conjoints (code_type = 'C')
INSERT OR IGNORE INTO beneficiaires (id, adherent_id, type_beneficiaire, nom, prenom, date_naissance, cin, lien_parente, est_actif, created_at, updated_at)
SELECT
  'BEN-' || id,
  parent_adherent_id,
  'conjoint',
  COALESCE(last_name, ''),
  COALESCE(first_name, ''),
  date_of_birth,
  national_id,
  'conjoint',
  CASE WHEN is_active = 1 THEN 1 ELSE 0 END,
  created_at,
  COALESCE(updated_at, created_at)
FROM adherents
WHERE code_type = 'C' AND parent_adherent_id IS NOT NULL;

-- 3. Enfants (code_type = 'E')
INSERT OR IGNORE INTO beneficiaires (id, adherent_id, type_beneficiaire, nom, prenom, date_naissance, cin, lien_parente, est_actif, created_at, updated_at)
SELECT
  'BEN-' || id,
  parent_adherent_id,
  'enfant',
  COALESCE(last_name, ''),
  COALESCE(first_name, ''),
  date_of_birth,
  national_id,
  CASE WHEN gender = 'M' THEN 'fils' ELSE 'fille' END,
  CASE WHEN is_active = 1 THEN 1 ELSE 0 END,
  created_at,
  COALESCE(updated_at, created_at)
FROM adherents
WHERE code_type = 'E' AND parent_adherent_id IS NOT NULL;

-- Add beneficiaire_id FK to bulletins_soins for linking bulletins to beneficiaires
ALTER TABLE bulletins_soins ADD COLUMN beneficiaire_id TEXT REFERENCES beneficiaires(id);
