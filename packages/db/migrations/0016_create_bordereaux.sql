-- Migration: Create bordereaux table
-- Description: Payment statements generated for providers
-- Used by the Reconciliation Agent to track payments

CREATE TABLE IF NOT EXISTS bordereaux (
  id TEXT PRIMARY KEY,
  bordereau_number TEXT NOT NULL UNIQUE,

  -- Relationships
  insurer_id TEXT NOT NULL REFERENCES insurers(id),
  provider_id TEXT REFERENCES providers(id), -- NULL = all providers

  -- Period
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,

  -- Amounts
  total_amount INTEGER NOT NULL, -- in millimes
  claims_count INTEGER NOT NULL,

  -- Status
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'sent', 'acknowledged', 'paid'
  )),

  -- Document
  pdf_url TEXT,

  -- Timestamps
  generated_at TEXT,
  sent_at TEXT,
  acknowledged_at TEXT,
  paid_at TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_bordereaux_insurer ON bordereaux(insurer_id);
CREATE INDEX IF NOT EXISTS idx_bordereaux_provider ON bordereaux(provider_id);
CREATE INDEX IF NOT EXISTS idx_bordereaux_status ON bordereaux(status);
CREATE INDEX IF NOT EXISTS idx_bordereaux_period ON bordereaux(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_bordereaux_number ON bordereaux(bordereau_number);

-- Create discrepancies table for tracking reconciliation issues
CREATE TABLE IF NOT EXISTS discrepancies (
  id TEXT PRIMARY KEY,

  -- Related claim
  claim_id TEXT NOT NULL REFERENCES claims(id),

  -- Discrepancy details
  type TEXT NOT NULL CHECK (type IN (
    'AMOUNT_MISMATCH',
    'DUPLICATE_CLAIM',
    'MISSING_CLAIM',
    'STATUS_MISMATCH',
    'DATE_MISMATCH',
    'CARE_TYPE_MISMATCH'
  )),
  severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
  description TEXT NOT NULL,

  -- Amounts
  provider_amount INTEGER NOT NULL DEFAULT 0,
  insurer_amount INTEGER NOT NULL DEFAULT 0,
  difference INTEGER NOT NULL DEFAULT 0,
  adjusted_amount INTEGER,

  -- Status and resolution
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'escalated')),
  resolution TEXT,
  resolved_by TEXT REFERENCES users(id),
  resolved_at TEXT,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_discrepancies_claim ON discrepancies(claim_id);
CREATE INDEX IF NOT EXISTS idx_discrepancies_status ON discrepancies(status);
CREATE INDEX IF NOT EXISTS idx_discrepancies_type ON discrepancies(type);
CREATE INDEX IF NOT EXISTS idx_discrepancies_severity ON discrepancies(severity);

-- Add bordereau_id to claims table (if not exists - handled by ALTER TABLE)
-- ALTER TABLE claims ADD COLUMN bordereau_id TEXT REFERENCES bordereaux(id);
-- This is commented out because SQLite doesn't support ADD COLUMN IF NOT EXISTS
-- Handle in application code or a separate migration check
