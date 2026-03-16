-- Table de suivi des plafonds de remboursement par prestataire
CREATE TABLE IF NOT EXISTS plafonds_prestataire (
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

CREATE INDEX IF NOT EXISTS idx_plafonds_adherent ON plafonds_prestataire(adherent_id);
CREATE INDEX IF NOT EXISTS idx_plafonds_contract ON plafonds_prestataire(contract_id);
CREATE INDEX IF NOT EXISTS idx_plafonds_annee ON plafonds_prestataire(annee);
CREATE INDEX IF NOT EXISTS idx_plafonds_famille ON plafonds_prestataire(famille_acte_id);
