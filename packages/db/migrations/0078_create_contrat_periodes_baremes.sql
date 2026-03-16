-- Migration 0078: Create contrat_periodes and contrat_baremes tables (REQ-009)
-- Modélise les contrats d'assurance groupe avec périodes d'application et barèmes par famille d'actes

-- Périodes d'application des contrats
CREATE TABLE IF NOT EXISTS contrat_periodes (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id),
  numero INTEGER NOT NULL DEFAULT 1,
  date_debut TEXT NOT NULL,
  date_fin TEXT NOT NULL,
  ref_periode TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(contract_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_contrat_periodes_contract ON contrat_periodes(contract_id);
CREATE INDEX IF NOT EXISTS idx_contrat_periodes_dates ON contrat_periodes(date_debut, date_fin);

-- Barèmes par acte/famille pour chaque période
CREATE TABLE IF NOT EXISTS contrat_baremes (
  id TEXT PRIMARY KEY,
  periode_id TEXT NOT NULL REFERENCES contrat_periodes(id),
  acte_ref_id TEXT REFERENCES actes_referentiel(id),
  famille_id TEXT REFERENCES familles_actes(id),
  type_calcul TEXT NOT NULL DEFAULT 'taux' CHECK (type_calcul IN ('taux', 'forfait')),
  valeur REAL NOT NULL,
  plafond_acte REAL,
  plafond_famille_annuel REAL,
  limite INTEGER,
  contre_visite INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_contrat_baremes_periode ON contrat_baremes(periode_id);
CREATE INDEX IF NOT EXISTS idx_contrat_baremes_acte ON contrat_baremes(acte_ref_id);
CREATE INDEX IF NOT EXISTS idx_contrat_baremes_famille ON contrat_baremes(famille_id);
