-- Migration: Create care_coverage_rules table
-- Description: Coverage rules per care type and plan
-- Used by the Eligibility Agent to determine if a claim is covered

CREATE TABLE IF NOT EXISTS care_coverage_rules (
  id TEXT PRIMARY KEY,
  insurer_id TEXT NOT NULL REFERENCES insurers(id),

  -- What this rule applies to
  care_type TEXT NOT NULL CHECK (care_type IN (
    'pharmacy', 'consultation', 'lab', 'hospitalization', 'dental', 'optical'
  )),
  plan_type TEXT CHECK (plan_type IN ('individual', 'family', 'corporate')),

  -- Coverage configuration
  is_covered INTEGER NOT NULL DEFAULT 1, -- Whether this care type is covered
  requires_prior_auth INTEGER NOT NULL DEFAULT 0, -- Requires pre-authorization

  -- Limits
  annual_limit INTEGER, -- Annual limit in millimes (NULL = unlimited)
  per_act_limit INTEGER, -- Per-act limit in millimes
  per_day_limit INTEGER, -- Daily limit on number of acts
  per_month_limit INTEGER, -- Monthly limit on number of acts

  -- Waiting periods
  waiting_days INTEGER DEFAULT 0, -- Days to wait after contract start

  -- Co-pay configuration
  copay_type TEXT CHECK (copay_type IN ('fixed', 'percentage')),
  copay_value INTEGER DEFAULT 0, -- Fixed amount in millimes or percentage (0-100)

  -- Network restrictions
  network_only INTEGER NOT NULL DEFAULT 0, -- Must use network providers

  -- Age restrictions
  min_age INTEGER,
  max_age INTEGER,

  -- Validity
  effective_from TEXT NOT NULL,
  effective_to TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_care_rules_insurer ON care_coverage_rules(insurer_id);
CREATE INDEX IF NOT EXISTS idx_care_rules_care_type ON care_coverage_rules(care_type);
CREATE INDEX IF NOT EXISTS idx_care_rules_plan ON care_coverage_rules(plan_type);
CREATE INDEX IF NOT EXISTS idx_care_rules_active ON care_coverage_rules(is_active);
CREATE INDEX IF NOT EXISTS idx_care_rules_effective ON care_coverage_rules(effective_from, effective_to);

-- Unique constraint
CREATE UNIQUE INDEX IF NOT EXISTS idx_care_rules_unique ON care_coverage_rules(
  insurer_id, care_type, COALESCE(plan_type, ''), effective_from
);
