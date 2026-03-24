-- Migration 0095: Barèmes de remboursement par famille de médicaments
-- Permet de définir des taux de remboursement par famille thérapeutique,
-- avec historisation des changements et dates d'effet temporelles.

-- Barèmes par famille de médicaments (taux temporels)
CREATE TABLE IF NOT EXISTS medication_family_baremes (
  id TEXT PRIMARY KEY,
  contract_id TEXT NOT NULL REFERENCES contracts(id),
  medication_family_id TEXT NOT NULL REFERENCES medication_families(id),
  taux_remboursement REAL NOT NULL CHECK (taux_remboursement >= 0 AND taux_remboursement <= 1),
  plafond_acte REAL,
  plafond_famille_annuel REAL,
  date_effet TEXT NOT NULL,        -- Date à partir de laquelle ce taux s'applique
  date_fin_effet TEXT,             -- NULL = toujours en vigueur
  is_active INTEGER NOT NULL DEFAULT 1,
  motif TEXT,                      -- Raison du changement
  created_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mfb_contract ON medication_family_baremes(contract_id);
CREATE INDEX IF NOT EXISTS idx_mfb_family ON medication_family_baremes(medication_family_id);
CREATE INDEX IF NOT EXISTS idx_mfb_dates ON medication_family_baremes(date_effet, date_fin_effet);
CREATE INDEX IF NOT EXISTS idx_mfb_contract_family ON medication_family_baremes(contract_id, medication_family_id);

-- Historique des modifications de barèmes (audit trail)
CREATE TABLE IF NOT EXISTS medication_family_bareme_history (
  id TEXT PRIMARY KEY,
  bareme_id TEXT NOT NULL REFERENCES medication_family_baremes(id),
  action TEXT NOT NULL CHECK (action IN ('create', 'update', 'deactivate')),
  old_taux REAL,
  new_taux REAL,
  old_plafond_acte REAL,
  new_plafond_acte REAL,
  old_plafond_famille REAL,
  new_plafond_famille REAL,
  old_date_effet TEXT,
  new_date_effet TEXT,
  motif TEXT,
  changed_by TEXT REFERENCES users(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_mfbh_bareme ON medication_family_bareme_history(bareme_id);
CREATE INDEX IF NOT EXISTS idx_mfbh_date ON medication_family_bareme_history(created_at);
