-- Migration: 0124_extend_audit_logs_columns
-- Description: Add missing columns to audit_logs for AuditService compatibility

-- Recreate the audit_logs table with all required columns
CREATE TABLE IF NOT EXISTS audit_logs_new (
  id TEXT PRIMARY KEY,
  timestamp TEXT DEFAULT (datetime('now')),
  user_id TEXT,
  user_name TEXT,
  user_role TEXT,
  action TEXT NOT NULL,
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  entity_name TEXT,
  details TEXT,
  ip_address TEXT,
  user_agent TEXT,
  request_id TEXT,
  session_id TEXT,
  insurer_id TEXT,
  provider_id TEXT,
  result TEXT DEFAULT 'success',
  error_message TEXT,
  duration INTEGER,
  changes TEXT
);

-- Migrate existing data
INSERT INTO audit_logs_new (id, timestamp, user_id, action, entity_type, entity_id, details, ip_address, user_agent, result)
SELECT id, created_at, user_id, action, entity_type, entity_id, changes_json, ip_address, user_agent, 'success'
FROM audit_logs;

-- Drop old table and rename
DROP TABLE audit_logs;
ALTER TABLE audit_logs_new RENAME TO audit_logs;

-- Recreate indexes
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_timestamp ON audit_logs(user_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action_timestamp ON audit_logs(action, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity_timestamp ON audit_logs(entity_type, entity_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_insurer ON audit_logs(insurer_id);
CREATE INDEX IF NOT EXISTS idx_audit_result ON audit_logs(result);
CREATE INDEX IF NOT EXISTS idx_audit_compliance ON audit_logs(action, timestamp, user_id);
