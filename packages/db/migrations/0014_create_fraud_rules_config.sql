-- Migration: Create fraud_rules_config table
-- Description: Configurable fraud detection rules
-- Used by the Fraud Detection Agent to score claims

CREATE TABLE IF NOT EXISTS fraud_rules_config (
  id TEXT PRIMARY KEY,
  insurer_id TEXT REFERENCES insurers(id), -- NULL = global rule for all insurers

  -- Rule identification
  rule_code TEXT NOT NULL UNIQUE, -- e.g., 'DUPLICATE_CLAIM', 'HIGH_FREQUENCY'
  rule_name TEXT NOT NULL,
  rule_description TEXT,

  -- Rule type
  rule_type TEXT NOT NULL CHECK (rule_type IN (
    'duplicate', -- Same claim submitted twice
    'frequency', -- Too many claims in time period
    'amount', -- Unusual amounts
    'pattern', -- Suspicious patterns (hours, combinations)
    'incompatibility', -- Drug/procedure incompatibilities
    'provider', -- Provider-specific anomalies
    'adherent' -- Adherent-specific anomalies
  )),

  -- Scoring
  base_score INTEGER NOT NULL DEFAULT 10, -- Points added to fraud score (0-100)
  threshold_value TEXT, -- JSON: threshold parameters for the rule
  -- Example: {"max_claims_per_day": 5, "lookback_days": 30}

  -- Severity level
  severity TEXT NOT NULL DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),

  -- Action on trigger
  action TEXT NOT NULL DEFAULT 'flag' CHECK (action IN (
    'flag', -- Just flag for review
    'review', -- Auto-set to pending_review
    'block' -- Auto-block the claim
  )),

  -- Care type specificity (NULL = all types)
  care_type TEXT CHECK (care_type IN (
    'pharmacy', 'consultation', 'lab', 'hospitalization', 'dental', 'optical'
  )),

  -- Status
  is_active INTEGER NOT NULL DEFAULT 1,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_fraud_rules_insurer ON fraud_rules_config(insurer_id);
CREATE INDEX IF NOT EXISTS idx_fraud_rules_type ON fraud_rules_config(rule_type);
CREATE INDEX IF NOT EXISTS idx_fraud_rules_care ON fraud_rules_config(care_type);
CREATE INDEX IF NOT EXISTS idx_fraud_rules_active ON fraud_rules_config(is_active);
CREATE INDEX IF NOT EXISTS idx_fraud_rules_code ON fraud_rules_config(rule_code);

-- Insert default global fraud rules
INSERT OR IGNORE INTO fraud_rules_config (id, rule_code, rule_name, rule_description, rule_type, base_score, threshold_value, severity, action) VALUES
  ('rule_dup_claim', 'DUPLICATE_CLAIM', 'Reclamation en double', 'Meme adherent, meme prestataire, meme date', 'duplicate', 80, '{"time_window_hours": 24}', 'critical', 'block'),
  ('rule_high_freq', 'HIGH_FREQUENCY', 'Frequence elevee', 'Plus de 5 reclamations par jour', 'frequency', 40, '{"max_claims_per_day": 5}', 'high', 'review'),
  ('rule_high_amount', 'UNUSUAL_AMOUNT', 'Montant inhabituel', 'Montant superieur a 3 ecarts-types', 'amount', 30, '{"std_dev_threshold": 3}', 'medium', 'flag'),
  ('rule_odd_hours', 'ODD_HOURS', 'Horaires suspects', 'Reclamations en dehors des heures normales', 'pattern', 20, '{"valid_hours_start": 6, "valid_hours_end": 22}', 'low', 'flag'),
  ('rule_provider_vol', 'PROVIDER_HIGH_VOLUME', 'Volume prestataire eleve', 'Prestataire avec volume anormalement eleve', 'provider', 25, '{"daily_threshold": 100}', 'medium', 'flag');
