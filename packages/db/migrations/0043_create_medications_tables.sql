-- Migration: Create medications and import history tables
-- Data source: Pharmacie Centrale de Tunisie (PCT)

-- Medication families/categories
CREATE TABLE IF NOT EXISTS medication_families (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_ar TEXT,
  description TEXT,
  parent_id TEXT REFERENCES medication_families(id),
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_medication_families_code ON medication_families(code);
CREATE INDEX idx_medication_families_parent ON medication_families(parent_id);

-- Medications master table
CREATE TABLE IF NOT EXISTS medications (
  id TEXT PRIMARY KEY,
  code_pct TEXT NOT NULL, -- Code Pharmacie Centrale Tunisie
  code_cnam TEXT, -- Code CNAM if applicable
  dci TEXT NOT NULL, -- Denomination Commune Internationale (generic name)
  brand_name TEXT NOT NULL,
  brand_name_ar TEXT,
  dosage TEXT,
  form TEXT, -- comprime, sirop, injectable, etc.
  packaging TEXT, -- boite de 20, flacon 100ml, etc.
  family_id TEXT REFERENCES medication_families(id),
  laboratory TEXT, -- Pharmaceutical lab
  country_origin TEXT,
  price_public REAL, -- Prix public
  price_hospital REAL, -- Prix hospitalier
  price_reference REAL, -- Prix de reference CNAM
  is_generic INTEGER DEFAULT 0,
  is_reimbursable INTEGER DEFAULT 1,
  reimbursement_rate REAL DEFAULT 0.7, -- Taux de remboursement (70% par defaut)
  requires_prescription INTEGER DEFAULT 1,
  is_controlled INTEGER DEFAULT 0, -- Tableau (stupefiants, psychotropes)
  is_active INTEGER DEFAULT 1,
  import_batch_id TEXT REFERENCES medication_import_batches(id),
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX idx_medications_code_pct ON medications(code_pct);
CREATE INDEX idx_medications_code_cnam ON medications(code_cnam);
CREATE INDEX idx_medications_dci ON medications(dci);
CREATE INDEX idx_medications_brand ON medications(brand_name);
CREATE INDEX idx_medications_family ON medications(family_id);
CREATE INDEX idx_medications_batch ON medications(import_batch_id);

-- Import batches history
CREATE TABLE IF NOT EXISTS medication_import_batches (
  id TEXT PRIMARY KEY,
  file_name TEXT NOT NULL,
  file_size INTEGER,
  file_hash TEXT, -- SHA256 hash for deduplication
  source TEXT NOT NULL DEFAULT 'PCT', -- PCT = Pharmacie Centrale Tunisie
  total_rows INTEGER DEFAULT 0,
  imported_count INTEGER DEFAULT 0,
  updated_count INTEGER DEFAULT 0,
  skipped_count INTEGER DEFAULT 0,
  error_count INTEGER DEFAULT 0,
  errors_json TEXT DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending', -- pending, processing, completed, failed
  imported_by TEXT REFERENCES users(id),
  started_at TEXT,
  completed_at TEXT,
  notes TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_medication_imports_status ON medication_import_batches(status);
CREATE INDEX idx_medication_imports_source ON medication_import_batches(source);
CREATE INDEX idx_medication_imports_date ON medication_import_batches(created_at);

-- Medication history (track changes)
CREATE TABLE IF NOT EXISTS medication_history (
  id TEXT PRIMARY KEY,
  medication_id TEXT NOT NULL REFERENCES medications(id),
  field_changed TEXT NOT NULL,
  old_value TEXT,
  new_value TEXT,
  change_type TEXT NOT NULL, -- create, update, delete, price_change
  import_batch_id TEXT REFERENCES medication_import_batches(id),
  changed_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX idx_medication_history_med ON medication_history(medication_id);
CREATE INDEX idx_medication_history_batch ON medication_history(import_batch_id);
CREATE INDEX idx_medication_history_type ON medication_history(change_type);
