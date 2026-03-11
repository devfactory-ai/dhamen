-- SQLite doesn't support ALTER COLUMN, so we recreate the table
-- Make adherent_id nullable for agent bulletin entry (adherent may not exist yet)

-- Step 1: Create new table without NOT NULL on adherent_id
CREATE TABLE bulletins_soins_new (
  id TEXT PRIMARY KEY,
  adherent_id TEXT REFERENCES adherents(id),
  beneficiary_id TEXT,
  bulletin_number TEXT UNIQUE NOT NULL,
  bulletin_date TEXT NOT NULL,
  provider_name TEXT,
  provider_specialty TEXT,
  care_type TEXT NOT NULL DEFAULT 'consultation',
  care_description TEXT,
  total_amount REAL,
  reimbursed_amount REAL,
  status TEXT NOT NULL DEFAULT 'submitted',
  submission_date TEXT,
  processing_date TEXT,
  reimbursement_date TEXT,
  rejection_reason TEXT,
  scan_url TEXT,
  scan_filename TEXT,
  additional_documents TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  approved_date TEXT,
  approved_amount INTEGER,
  batch_id TEXT REFERENCES bulletin_batches(id),
  adherent_matricule TEXT,
  adherent_first_name TEXT,
  adherent_last_name TEXT,
  adherent_national_id TEXT,
  beneficiary_name TEXT,
  beneficiary_relationship TEXT,
  created_by TEXT
);

-- Step 2: Copy data
INSERT INTO bulletins_soins_new SELECT * FROM bulletins_soins;

-- Step 3: Drop old table
DROP TABLE bulletins_soins;

-- Step 4: Rename new table
ALTER TABLE bulletins_soins_new RENAME TO bulletins_soins;

-- Step 5: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_batch_id ON bulletins_soins(batch_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_created_by ON bulletins_soins(created_by);
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_adherent_id ON bulletins_soins(adherent_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_status ON bulletins_soins(status);
