-- Migration: User-level permission overrides
-- Description: Individual permission overrides per user (surcharges individuelles)

CREATE TABLE IF NOT EXISTS user_permissions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  is_granted INTEGER NOT NULL DEFAULT 1,
  reason TEXT NOT NULL,
  expires_at TEXT,
  granted_by TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, resource, action)
);

CREATE INDEX IF NOT EXISTS idx_user_perms_user ON user_permissions(user_id);
CREATE INDEX IF NOT EXISTS idx_user_perms_expires ON user_permissions(expires_at);
