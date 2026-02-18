-- Migration: Create reconciliations table
-- Description: Payment reconciliation records (bordereaux)

CREATE TABLE IF NOT EXISTS reconciliations (
  id TEXT PRIMARY KEY,
  insurer_id TEXT NOT NULL REFERENCES insurers(id),
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  total_claims INTEGER NOT NULL,
  total_amount INTEGER NOT NULL,
  total_covered INTEGER NOT NULL,
  total_retentions INTEGER DEFAULT 0,
  total_net_payable INTEGER NOT NULL,
  pdf_path TEXT,
  status TEXT DEFAULT 'generated' CHECK (status IN ('generated', 'sent', 'paid')),
  created_at TEXT DEFAULT (datetime('now')),
  paid_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_reconciliations_insurer ON reconciliations(insurer_id);
CREATE INDEX IF NOT EXISTS idx_reconciliations_status ON reconciliations(status);
CREATE INDEX IF NOT EXISTS idx_reconciliations_period ON reconciliations(period_start, period_end);

-- Add foreign key constraint to claims table
-- Note: SQLite doesn't support ALTER TABLE ADD CONSTRAINT, so this is handled at insert time
