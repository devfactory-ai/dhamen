-- Familles d'actes médicaux (standard assurance santé Tunisie)
CREATE TABLE IF NOT EXISTS familles_actes (
  id TEXT PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  label TEXT NOT NULL,
  ordre INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_familles_actes_code ON familles_actes(code);
CREATE INDEX IF NOT EXISTS idx_familles_actes_active ON familles_actes(is_active);

-- Seed: 20 familles d'actes
INSERT INTO familles_actes (id, code, label, ordre) VALUES
  ('fa-001', 'FA0001', 'Consultations et Visites', 1),
  ('fa-002', 'FA0002', 'Actes médicaux courants', 2),
  ('fa-003', 'FA0003', 'Frais pharmaceutiques', 3),
  ('fa-004', 'FA0004', 'Analyses et travaux de laboratoire', 4),
  ('fa-005', 'FA0005', 'Orthopédie et prothèses non dentaires', 5),
  ('fa-006', 'FA0006', 'Optique', 6),
  ('fa-007', 'FA0007', 'Hospitalisation en clinique', 7),
  ('fa-008', 'FA0008', 'Hospitalisation hôpital', 8),
  ('fa-009', 'FA0009', 'Actes de spécialistes et pratique médicale courante', 9),
  ('fa-010', 'FA0010', 'Frais chirurgicaux y compris accessoires', 10),
  ('fa-011', 'FA0011', 'Soins dentaires', 11),
  ('fa-012', 'FA0012', 'Maternité', 12),
  ('fa-013', 'FA0013', 'Cures thermales', 13),
  ('fa-014', 'FA0014', 'Soins orthodontiques', 14),
  ('fa-015', 'FA0015', 'Circoncision', 15),
  ('fa-016', 'FA0016', 'Transport du malade', 16),
  ('fa-017', 'FA0017', 'Radiologie', 17),
  ('fa-018', 'FA0018', 'Frais de soins à l''étranger', 18),
  ('fa-019', 'FA0019', 'Frais funéraires', 19),
  ('fa-020', 'FA0020', 'Non remboursable', 20);
