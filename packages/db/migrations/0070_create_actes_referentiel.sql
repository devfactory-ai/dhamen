-- Référentiel des actes médicaux avec taux de remboursement
CREATE TABLE IF NOT EXISTS actes_referentiel (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  taux_remboursement REAL NOT NULL CHECK(taux_remboursement >= 0 AND taux_remboursement <= 1),
  plafond_acte REAL,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_actes_referentiel_code ON actes_referentiel(code);
CREATE INDEX IF NOT EXISTS idx_actes_referentiel_active ON actes_referentiel(is_active);

-- Seed: actes médicaux courants en Tunisie (INSERT OR IGNORE to be idempotent)
INSERT OR IGNORE INTO actes_referentiel (id, code, label, taux_remboursement, plafond_acte) VALUES
  ('acte-001', 'CONS-GEN', 'Consultation médecin généraliste', 0.70, NULL),
  ('acte-002', 'CONS-SPE', 'Consultation médecin spécialiste', 0.70, NULL),
  ('acte-003', 'RADIO', 'Radiologie', 0.80, NULL),
  ('acte-004', 'ECHO', 'Échographie', 0.80, NULL),
  ('acte-005', 'ANALYSE', 'Analyses biologiques', 0.80, NULL),
  ('acte-006', 'DENT-CONS', 'Consultation dentaire', 0.60, NULL),
  ('acte-007', 'DENT-SOIN', 'Soins dentaires', 0.60, 500000),
  ('acte-008', 'PHARMA', 'Pharmacie', 0.80, NULL),
  ('acte-009', 'KINE', 'Kinésithérapie', 0.70, 300000),
  ('acte-010', 'HOSP', 'Hospitalisation', 0.90, 5000000),
  ('acte-011', 'CHIR', 'Acte chirurgical', 0.90, 5000000),
  ('acte-012', 'OPTIQUE', 'Optique / lunettes', 0.60, 200000),
  ('acte-013', 'MATERNITE', 'Maternité / accouchement', 0.90, 3000000),
  ('acte-014', 'LABO-SPE', 'Analyses spécialisées (scanner, IRM)', 0.80, 1000000);
