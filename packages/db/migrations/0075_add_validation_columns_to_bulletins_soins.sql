-- Migration: Add validated_at column to bulletins_soins
-- Other columns (validated_by, agent_notes, missing_documents) already exist
ALTER TABLE bulletins_soins ADD COLUMN validated_at TEXT;

-- Index for querying validated bulletins
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_validated_at ON bulletins_soins(validated_at);
