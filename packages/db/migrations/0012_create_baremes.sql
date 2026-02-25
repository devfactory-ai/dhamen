-- Migration: Create baremes table
-- Description: Tarification baremes for calculating coverage amounts
-- Used by the Tarification Agent to determine reimbursement rates

CREATE TABLE IF NOT EXISTS baremes (
  id TEXT PRIMARY KEY,
  insurer_id TEXT NOT NULL REFERENCES insurers(id),

  -- Type of care this bareme applies to
  care_type TEXT NOT NULL CHECK (care_type IN (
    'pharmacy', 'consultation', 'lab', 'hospitalization', 'dental', 'optical'
  )),

  -- Provider type (optional - for provider-specific rates)
  provider_type TEXT CHECK (provider_type IN (
    'PHARMACY', 'DOCTOR', 'LAB', 'CLINIC'
  )),

  -- Act code (for specific procedures, e.g., NGAP codes)
  act_code TEXT,

  -- Rate configuration
  base_rate INTEGER NOT NULL, -- Base reimbursement rate in millimes
  coverage_percentage INTEGER NOT NULL DEFAULT 80, -- % covered by insurer (0-100)
  max_amount INTEGER, -- Maximum reimbursement per act in millimes
  min_amount INTEGER DEFAULT 0, -- Minimum reimbursement in millimes

  -- Plan type specificity (NULL = applies to all plans)
  plan_type TEXT CHECK (plan_type IN ('individual', 'family', 'corporate')),

  -- Validity period
  effective_from TEXT NOT NULL,
  effective_to TEXT,

  -- Version tracking for audit
  version INTEGER NOT NULL DEFAULT 1,

  -- Status
  is_active INTEGER NOT NULL DEFAULT 1,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_baremes_insurer ON baremes(insurer_id);
CREATE INDEX IF NOT EXISTS idx_baremes_care_type ON baremes(care_type);
CREATE INDEX IF NOT EXISTS idx_baremes_provider_type ON baremes(provider_type);
CREATE INDEX IF NOT EXISTS idx_baremes_act_code ON baremes(act_code);
CREATE INDEX IF NOT EXISTS idx_baremes_effective ON baremes(effective_from, effective_to);
CREATE INDEX IF NOT EXISTS idx_baremes_active ON baremes(is_active);

-- Unique constraint to prevent duplicate baremes for same criteria
CREATE UNIQUE INDEX IF NOT EXISTS idx_baremes_unique ON baremes(
  insurer_id, care_type,
  COALESCE(provider_type, ''),
  COALESCE(act_code, ''),
  COALESCE(plan_type, ''),
  effective_from
);
