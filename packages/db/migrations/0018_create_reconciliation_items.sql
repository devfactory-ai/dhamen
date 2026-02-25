-- Migration: Create reconciliation items and discrepancies tables
-- Description: Detailed reconciliation tracking per bordereau

-- Reconciliation items (one per bordereau reconciliation)
CREATE TABLE IF NOT EXISTS reconciliation_items (
  id TEXT PRIMARY KEY,
  bordereau_id TEXT NOT NULL REFERENCES bordereaux(id),

  -- Counts and amounts
  claim_count INTEGER NOT NULL DEFAULT 0,
  declared_amount INTEGER NOT NULL DEFAULT 0, -- Amount declared by provider (millimes)
  verified_amount INTEGER NOT NULL DEFAULT 0, -- Amount verified by system (millimes)
  difference INTEGER NOT NULL DEFAULT 0, -- verified - declared (millimes)

  -- Status
  status TEXT NOT NULL DEFAULT 'UNMATCHED' CHECK (status IN (
    'MATCHED',
    'UNMATCHED',
    'DISPUTED',
    'RESOLVED'
  )),

  -- Notes
  notes TEXT,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_items_bordereau ON reconciliation_items(bordereau_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_status ON reconciliation_items(status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_items_created ON reconciliation_items(created_at);

-- Reconciliation discrepancies (detailed issues per reconciliation item)
CREATE TABLE IF NOT EXISTS reconciliation_discrepancies (
  id TEXT PRIMARY KEY,
  reconciliation_item_id TEXT NOT NULL REFERENCES reconciliation_items(id),

  -- Discrepancy details
  discrepancy_type TEXT NOT NULL CHECK (discrepancy_type IN (
    'AMOUNT_MISMATCH',
    'DUPLICATE_CLAIM',
    'MISSING_CLAIM',
    'STATUS_MISMATCH',
    'DATE_MISMATCH',
    'CARE_TYPE_MISMATCH',
    'OTHER'
  )),
  description TEXT NOT NULL,
  amount INTEGER NOT NULL DEFAULT 0, -- Discrepancy amount (millimes)

  -- Status and resolution
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN (
    'PENDING',
    'RESOLVED',
    'ESCALATED'
  )),
  resolution TEXT,
  adjusted_amount INTEGER,
  resolved_by TEXT REFERENCES users(id),
  resolved_at TEXT,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_reconciliation_discrepancies_item ON reconciliation_discrepancies(reconciliation_item_id);
CREATE INDEX IF NOT EXISTS idx_reconciliation_discrepancies_status ON reconciliation_discrepancies(status);
CREATE INDEX IF NOT EXISTS idx_reconciliation_discrepancies_type ON reconciliation_discrepancies(discrepancy_type);

-- Add missing columns to bordereaux table if needed
-- These should already exist but adding for safety

-- Ensure covered_amount exists for bordereaux
-- ALTER TABLE bordereaux ADD COLUMN covered_amount INTEGER DEFAULT 0;
-- ALTER TABLE bordereaux ADD COLUMN claim_count INTEGER DEFAULT 0;
-- ALTER TABLE bordereaux ADD COLUMN paid_amount INTEGER DEFAULT 0;
-- ALTER TABLE bordereaux ADD COLUMN submitted_at TEXT;
-- ALTER TABLE bordereaux ADD COLUMN validated_at TEXT;
-- ALTER TABLE bordereaux ADD COLUMN payment_reference TEXT;

-- Note: SQLite doesn't support ADD COLUMN IF NOT EXISTS
-- These columns should be added manually if they don't exist
