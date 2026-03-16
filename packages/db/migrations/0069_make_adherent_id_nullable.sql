-- SQLite doesn't support ALTER COLUMN, so we recreate the table
-- Make adherent_id nullable for agent bulletin entry (adherent may not exist yet)
-- NOTE: Table was already recreated outside migration tracking. Using safe no-op
-- to avoid data loss from re-running the DROP + RENAME sequence.
-- Original migration recreated bulletins_soins with adherent_id as nullable.
SELECT 1;

-- Recreate indexes (IF NOT EXISTS makes these safe to re-run)
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_batch_id ON bulletins_soins(batch_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_created_by ON bulletins_soins(created_by);
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_adherent_id ON bulletins_soins(adherent_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_status ON bulletins_soins(status);
