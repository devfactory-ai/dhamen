-- Migration: Add CNAM "Accord Préalable" (AP) field to medications
-- Source: Liste des médicaments classés V/E/I couverts par le régime de base

-- Column may already exist from a prior partial migration run
-- ALTER TABLE medications ADD COLUMN requires_prior_approval INTEGER DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_medications_prior_approval ON medications(requires_prior_approval);
