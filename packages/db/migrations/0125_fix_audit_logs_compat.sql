-- Migration: 0125_fix_audit_logs_compat
-- Description: Re-add created_at and changes_json columns for backward compatibility with createAuditLog

-- The previous migration (0124) removed created_at and changes_json but
-- the createAuditLog function in packages/db still uses them.
-- Add them back for compatibility.

ALTER TABLE audit_logs ADD COLUMN created_at TEXT;
ALTER TABLE audit_logs ADD COLUMN changes_json TEXT;

-- Backfill created_at from timestamp
UPDATE audit_logs SET created_at = timestamp WHERE created_at IS NULL;
