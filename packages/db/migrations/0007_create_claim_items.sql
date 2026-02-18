-- Migration: Create claim_items table
-- Description: Individual items within a claim (medications, services, etc.)

CREATE TABLE IF NOT EXISTS claim_items (
  id TEXT PRIMARY KEY,
  claim_id TEXT NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  code TEXT NOT NULL,
  label TEXT NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price INTEGER NOT NULL,
  line_total INTEGER NOT NULL,
  covered_amount INTEGER NOT NULL,
  copay_amount INTEGER NOT NULL,
  reimbursement_rate REAL,
  is_generic INTEGER DEFAULT 0,
  rule_applied TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_claim_items_claim ON claim_items(claim_id);
CREATE INDEX IF NOT EXISTS idx_claim_items_code ON claim_items(code);
