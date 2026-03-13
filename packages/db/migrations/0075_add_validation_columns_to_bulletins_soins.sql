-- Migration: Add missing workflow columns to bulletins_soins
-- REQ-006: Validation bulletin et upload scan
-- Also adds columns referenced by bulletins-soins.ts PUT /manage/:id/status
-- that were never migrated (cause of 500 errors)

ALTER TABLE bulletins_soins ADD COLUMN validated_at TEXT;
ALTER TABLE bulletins_soins ADD COLUMN validated_by TEXT;
ALTER TABLE bulletins_soins ADD COLUMN approved_by TEXT;
ALTER TABLE bulletins_soins ADD COLUMN agent_notes TEXT;
ALTER TABLE bulletins_soins ADD COLUMN missing_documents TEXT;
ALTER TABLE bulletins_soins ADD COLUMN payment_method TEXT;
ALTER TABLE bulletins_soins ADD COLUMN payment_reference TEXT;
ALTER TABLE bulletins_soins ADD COLUMN payment_notes TEXT;
ALTER TABLE bulletins_soins ADD COLUMN payment_date TEXT;

-- Index for querying validated bulletins
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_validated_at ON bulletins_soins(validated_at);
