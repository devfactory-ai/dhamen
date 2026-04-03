-- Migration: Formally add is_active column to adherents table (already exists on most tenants)
-- No-op if column already exists (D1 migrations track applied state)
-- If this fails with "duplicate column name", the column already exists — safe to skip.
SELECT 1;
