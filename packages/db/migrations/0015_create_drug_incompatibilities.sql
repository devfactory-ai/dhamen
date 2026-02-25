-- Migration: Create drug_incompatibilities table
-- Description: Drug interaction and incompatibility rules
-- Used by the Fraud Agent to detect potentially dangerous or fraudulent combinations

CREATE TABLE IF NOT EXISTS drug_incompatibilities (
  id TEXT PRIMARY KEY,

  -- Drug identification (using ATC codes or local drug codes)
  drug_code_1 TEXT NOT NULL,
  drug_name_1 TEXT NOT NULL,
  drug_code_2 TEXT NOT NULL,
  drug_name_2 TEXT NOT NULL,

  -- Incompatibility type
  interaction_type TEXT NOT NULL CHECK (interaction_type IN (
    'contraindicated', -- Must never be combined
    'severe', -- Serious interaction, needs review
    'moderate', -- Moderate interaction, flag
    'mild', -- Minor interaction, informational
    'duplicate' -- Same therapeutic class (potential fraud)
  )),

  -- Clinical description
  description TEXT,
  clinical_effect TEXT, -- What happens if combined
  recommendation TEXT, -- What to do about it

  -- Fraud scoring
  fraud_score_impact INTEGER DEFAULT 0, -- Points to add to fraud score

  -- Source and evidence
  source TEXT, -- e.g., 'Vidal', 'ANSM', 'Internal'
  evidence_level TEXT CHECK (evidence_level IN ('high', 'moderate', 'low')),

  -- Validity
  is_active INTEGER NOT NULL DEFAULT 1,

  -- Timestamps
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_drug_compat_drug1 ON drug_incompatibilities(drug_code_1);
CREATE INDEX IF NOT EXISTS idx_drug_compat_drug2 ON drug_incompatibilities(drug_code_2);
CREATE INDEX IF NOT EXISTS idx_drug_compat_type ON drug_incompatibilities(interaction_type);
CREATE INDEX IF NOT EXISTS idx_drug_compat_active ON drug_incompatibilities(is_active);

-- Unique constraint (bidirectional - A-B is same as B-A)
CREATE UNIQUE INDEX IF NOT EXISTS idx_drug_compat_unique ON drug_incompatibilities(
  MIN(drug_code_1, drug_code_2),
  MAX(drug_code_1, drug_code_2)
);

-- Sample data for common drug incompatibilities (Tunisian market examples)
INSERT OR IGNORE INTO drug_incompatibilities (id, drug_code_1, drug_name_1, drug_code_2, drug_name_2, interaction_type, description, fraud_score_impact) VALUES
  ('compat_001', 'C09AA02', 'Enalapril', 'C09CA01', 'Losartan', 'duplicate', 'Double blocage du systeme renine-angiotensine', 30),
  ('compat_002', 'N02BE01', 'Paracetamol', 'N02BE01', 'Paracetamol', 'contraindicated', 'Surdosage paracetamol (meme molecule)', 50),
  ('compat_003', 'B01AC06', 'Aspirine', 'M01AE01', 'Ibuprofene', 'moderate', 'Interaction AINS - risque hemorragique', 15),
  ('compat_004', 'A10BA02', 'Metformine', 'A10BA02', 'Metformine', 'contraindicated', 'Surdosage metformine (meme molecule)', 50),
  ('compat_005', 'C10AA01', 'Simvastatine', 'C10AA05', 'Atorvastatine', 'duplicate', 'Double prescription statines', 40);
