-- Migration: 0118_fix_contract_number_unique_soft_delete
-- Description: Replace hard UNIQUE on contract_number with a partial unique index
-- that excludes soft-deleted rows, allowing re-use of contract numbers after deletion.

-- Step 1: Recreate the table without the UNIQUE constraint on contract_number
CREATE TABLE IF NOT EXISTS group_contracts_new (
  id TEXT PRIMARY KEY,
  contract_number TEXT NOT NULL,

  -- Parties
  company_id TEXT NOT NULL REFERENCES companies(id),
  insurer_id TEXT NOT NULL REFERENCES insurers(id),
  intermediary_name TEXT,
  intermediary_code TEXT,

  -- Dates
  effective_date TEXT NOT NULL,
  annual_renewal_date TEXT,
  end_date TEXT,

  -- Risques garantis
  risk_illness INTEGER NOT NULL DEFAULT 1,
  risk_disability INTEGER NOT NULL DEFAULT 0,
  risk_death INTEGER NOT NULL DEFAULT 0,

  -- Plafonds globaux
  annual_global_limit REAL,
  carence_days INTEGER DEFAULT 0,

  -- Bénéficiaires couverts
  covers_spouse INTEGER NOT NULL DEFAULT 1,
  covers_children INTEGER NOT NULL DEFAULT 1,
  children_max_age INTEGER DEFAULT 20,
  children_student_max_age INTEGER DEFAULT 28,
  covers_disabled_children INTEGER NOT NULL DEFAULT 1,
  covers_retirees INTEGER NOT NULL DEFAULT 0,

  -- Document source
  document_url TEXT,
  document_id TEXT REFERENCES documents(id),

  -- Metadata
  plan_category TEXT DEFAULT 'standard' CHECK(plan_category IN ('basic', 'standard', 'premium', 'vip')),
  status TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('draft', 'active', 'suspended', 'expired', 'cancelled')),
  notes TEXT,

  -- Added by later migrations
  contract_type TEXT NOT NULL DEFAULT 'group' CHECK(contract_type IN ('group', 'individual')),
  adherent_id TEXT,
  company_address TEXT,
  matricule_fiscale TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at TEXT
);

-- Step 2: Copy all data (explicit column mapping)
INSERT INTO group_contracts_new (
  id, contract_number,
  company_id, insurer_id, intermediary_name, intermediary_code,
  effective_date, annual_renewal_date, end_date,
  risk_illness, risk_disability, risk_death,
  annual_global_limit, carence_days,
  covers_spouse, covers_children, children_max_age, children_student_max_age,
  covers_disabled_children, covers_retirees,
  document_url, document_id,
  plan_category, status, notes,
  contract_type, adherent_id, company_address, matricule_fiscale,
  created_at, updated_at, deleted_at
)
SELECT
  id, contract_number,
  company_id, insurer_id, intermediary_name, intermediary_code,
  effective_date, annual_renewal_date, end_date,
  risk_illness, risk_disability, risk_death,
  annual_global_limit, carence_days,
  covers_spouse, covers_children, children_max_age, children_student_max_age,
  covers_disabled_children, covers_retirees,
  document_url, document_id,
  plan_category, status, notes,
  COALESCE(contract_type, 'group'), adherent_id, company_address, matricule_fiscale,
  created_at, updated_at, deleted_at
FROM group_contracts;

-- Step 3: Drop old table and rename
DROP TABLE group_contracts;
ALTER TABLE group_contracts_new RENAME TO group_contracts;

-- Step 4: Recreate indexes
CREATE INDEX IF NOT EXISTS idx_group_contracts_company ON group_contracts(company_id);
CREATE INDEX IF NOT EXISTS idx_group_contracts_insurer ON group_contracts(insurer_id);
CREATE INDEX IF NOT EXISTS idx_group_contracts_status ON group_contracts(status);
CREATE INDEX IF NOT EXISTS idx_group_contracts_number ON group_contracts(contract_number);

-- Step 5: Partial unique index — only active (non-deleted) contracts must have unique numbers
CREATE UNIQUE INDEX IF NOT EXISTS idx_group_contracts_number_unique
  ON group_contracts(contract_number) WHERE deleted_at IS NULL;
