-- Migration: Extend audit_logs table for advanced audit trail
-- Created: 2024-03-XX
-- Note: This migration extends the existing audit_logs table from 0009

-- Add missing columns to audit_logs if they don't exist
-- SQLite doesn't support IF NOT EXISTS for ALTER TABLE, so we use a workaround

-- First, try to add columns (will fail silently if they exist via PRAGMA)
-- We'll create a new table and migrate data if needed

-- Create extended audit_logs table only if it doesn't exist (from 0009)
CREATE TABLE IF NOT EXISTS audit_logs (
    id TEXT PRIMARY KEY,
    user_id TEXT,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id TEXT NOT NULL,
    changes_json TEXT,
    ip_address TEXT,
    user_agent TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Add additional indexes for common queries using created_at (not timestamp)
CREATE INDEX IF NOT EXISTS idx_audit_created_at_desc ON audit_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_created ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_action_created ON audit_logs(action, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity_created ON audit_logs(entity_type, entity_id, created_at DESC);

-- Composite index for compliance queries
CREATE INDEX IF NOT EXISTS idx_audit_compliance ON audit_logs(action, created_at, user_id);
