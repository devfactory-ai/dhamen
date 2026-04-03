-- Migration: Custom roles and permission overrides
-- Description: Tables for custom roles and per-role permission overrides

-- ============================================
-- Custom roles (beyond the built-in ROLES enum)
-- ============================================
CREATE TABLE IF NOT EXISTS custom_roles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL DEFAULT '',
  duplicated_from TEXT, -- role id this was duplicated from
  is_active INTEGER NOT NULL DEFAULT 1,
  is_protected INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================
-- Permission overrides per role
-- Overrides the code-based PERMISSIONS matrix
-- ============================================
CREATE TABLE IF NOT EXISTS role_permission_overrides (
  id TEXT PRIMARY KEY,
  role_id TEXT NOT NULL, -- built-in role name or custom_roles.id
  resource TEXT NOT NULL,
  action TEXT NOT NULL,
  is_granted INTEGER NOT NULL DEFAULT 1,
  updated_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(role_id, resource, action)
);

CREATE INDEX IF NOT EXISTS idx_rpo_role ON role_permission_overrides(role_id);
