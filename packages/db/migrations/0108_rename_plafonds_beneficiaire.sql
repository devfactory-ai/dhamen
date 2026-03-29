-- Migration: 0108_rename_plafonds_beneficiaire
-- Description: Rename plafonds_prestataire → plafonds_beneficiaire
-- Reason: The table tracks reimbursement ceilings per bénéficiaire (adhérent/conjoint/enfant),
--         NOT per prestataire (praticien de santé). Fix the semantic confusion.
-- Strategy: Create new table, copy data, drop old, create backward-compat view.

-- 1. Create the correctly-named table
CREATE TABLE IF NOT EXISTS plafonds_beneficiaire (
  id TEXT PRIMARY KEY,
  adherent_id TEXT NOT NULL REFERENCES adherents(id),
  contract_id TEXT NOT NULL REFERENCES contracts(id),
  annee INTEGER NOT NULL,
  famille_acte_id TEXT REFERENCES familles_actes(id), -- NULL = plafond global
  type_maladie TEXT NOT NULL DEFAULT 'ordinaire' CHECK (type_maladie IN ('ordinaire', 'chronique')),
  montant_plafond REAL NOT NULL,
  montant_consomme REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(adherent_id, contract_id, annee, famille_acte_id, type_maladie)
);

-- 2. Copy all existing data
INSERT OR IGNORE INTO plafonds_beneficiaire (id, adherent_id, contract_id, annee, famille_acte_id, type_maladie, montant_plafond, montant_consomme, created_at, updated_at)
SELECT id, adherent_id, contract_id, annee, famille_acte_id, type_maladie, montant_plafond, montant_consomme, created_at, updated_at
FROM plafonds_prestataire;

-- 3. Create indexes on new table
CREATE INDEX IF NOT EXISTS idx_plafonds_benef_adherent ON plafonds_beneficiaire(adherent_id);
CREATE INDEX IF NOT EXISTS idx_plafonds_benef_contract ON plafonds_beneficiaire(contract_id);
CREATE INDEX IF NOT EXISTS idx_plafonds_benef_annee ON plafonds_beneficiaire(annee);
CREATE INDEX IF NOT EXISTS idx_plafonds_benef_famille ON plafonds_beneficiaire(famille_acte_id);

-- 4. Drop the old table (data is safely in the new one)
DROP TABLE IF EXISTS plafonds_prestataire;

-- 5. Create backward-compatibility view so old queries still work during transition
CREATE VIEW IF NOT EXISTS plafonds_prestataire AS SELECT * FROM plafonds_beneficiaire;
