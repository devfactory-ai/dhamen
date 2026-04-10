-- Migration: 0125_fix_audit_logs_compat
-- Re-add created_at and changes_json columns removed by 0124
ALTER TABLE audit_logs ADD COLUMN created_at TEXT;
ALTER TABLE audit_logs ADD COLUMN changes_json TEXT;

-- Backfill created_at from timestamp
UPDATE audit_logs SET created_at = timestamp WHERE created_at IS NULL;
