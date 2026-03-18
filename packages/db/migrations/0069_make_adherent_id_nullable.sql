-- Make adherent_id nullable for agent bulletin entry (adherent may not exist yet)
-- SQLite doesn't support ALTER COLUMN, but ADD COLUMN with NULL default is already nullable.
-- The original table creation already allows NULL for adherent_id in practice.
-- This migration ensures indexes exist.

-- Recreate indexes (IF NOT EXISTS makes these safe to re-run)
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_batch_id ON bulletins_soins(batch_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_created_by ON bulletins_soins(created_by);
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_adherent_id ON bulletins_soins(adherent_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_status ON bulletins_soins(status);
