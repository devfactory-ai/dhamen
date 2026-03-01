-- Migration: Create bulletins_soins table for paper care forms
-- Bulletins de soins papier scannés et historique

CREATE TABLE IF NOT EXISTS bulletins_soins (
  id TEXT PRIMARY KEY,
  adherent_id TEXT NOT NULL REFERENCES adherents(id),
  beneficiary_id TEXT, -- NULL if for the main adherent, otherwise ayant droit

  -- Bulletin info
  bulletin_number TEXT NOT NULL, -- Numéro du bulletin
  bulletin_date TEXT NOT NULL, -- Date du bulletin
  provider_name TEXT, -- Nom du praticien (from paper)
  provider_specialty TEXT, -- Spécialité

  -- Care details
  care_type TEXT NOT NULL DEFAULT 'consultation', -- consultation, pharmacy, lab, hospital
  care_description TEXT,
  total_amount REAL,
  reimbursed_amount REAL,

  -- Status
  status TEXT NOT NULL DEFAULT 'submitted', -- submitted, processing, reimbursed, rejected
  submission_date TEXT NOT NULL,
  processing_date TEXT,
  reimbursement_date TEXT,
  rejection_reason TEXT,

  -- Scanned documents
  scan_url TEXT, -- R2 URL for scanned bulletin
  scan_filename TEXT,
  additional_documents TEXT, -- JSON array of additional scanned docs

  -- Metadata
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_adherent ON bulletins_soins(adherent_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_status ON bulletins_soins(status);
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_date ON bulletins_soins(bulletin_date);
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_number ON bulletins_soins(bulletin_number);

-- Seed some demo bulletins for existing adherents
INSERT INTO bulletins_soins (id, adherent_id, bulletin_number, bulletin_date, provider_name, provider_specialty, care_type, care_description, total_amount, reimbursed_amount, status, submission_date, processing_date, reimbursement_date, scan_url)
SELECT
  'BS' || substr(hex(randomblob(8)), 1, 16),
  a.id,
  'BS-2025-' || printf('%04d', abs(random() % 9999)),
  date('now', '-' || (abs(random() % 60)) || ' days'),
  CASE abs(random() % 5)
    WHEN 0 THEN 'Dr. Ahmed Bouazizi'
    WHEN 1 THEN 'Dr. Fatma Trabelsi'
    WHEN 2 THEN 'Dr. Mohamed Jebali'
    WHEN 3 THEN 'Pharmacie Centrale Tunis'
    ELSE 'Laboratoire El Manar'
  END,
  CASE abs(random() % 5)
    WHEN 0 THEN 'Médecine générale'
    WHEN 1 THEN 'Cardiologie'
    WHEN 2 THEN 'Pédiatrie'
    WHEN 3 THEN 'Pharmacie'
    ELSE 'Analyses médicales'
  END,
  CASE abs(random() % 4)
    WHEN 0 THEN 'consultation'
    WHEN 1 THEN 'pharmacy'
    WHEN 2 THEN 'lab'
    ELSE 'consultation'
  END,
  CASE abs(random() % 4)
    WHEN 0 THEN 'Consultation de routine'
    WHEN 1 THEN 'Achat médicaments'
    WHEN 2 THEN 'Bilan sanguin complet'
    ELSE 'Consultation spécialisée'
  END,
  ROUND(50 + (random() % 200), 2),
  ROUND(30 + (random() % 120), 2),
  CASE abs(random() % 4)
    WHEN 0 THEN 'submitted'
    WHEN 1 THEN 'processing'
    WHEN 2 THEN 'reimbursed'
    ELSE 'reimbursed'
  END,
  date('now', '-' || (abs(random() % 55)) || ' days'),
  CASE WHEN abs(random() % 2) = 0 THEN date('now', '-' || (abs(random() % 30)) || ' days') ELSE NULL END,
  CASE WHEN abs(random() % 3) = 0 THEN date('now', '-' || (abs(random() % 15)) || ' days') ELSE NULL END,
  'https://dhamen-files.r2.cloudflarestorage.com/bulletins/scan-' || lower(hex(randomblob(4))) || '.pdf'
FROM adherents a
LIMIT 30;
