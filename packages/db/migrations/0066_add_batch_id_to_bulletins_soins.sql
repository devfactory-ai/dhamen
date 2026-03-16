-- Add batch_id column to bulletins_soins to link bulletins to batches
-- NOTE: Column already exists in DB (applied outside migration tracking). Using safe no-op.
-- Original: ALTER TABLE bulletins_soins ADD COLUMN batch_id TEXT REFERENCES bulletin_batches(id);
SELECT 1;

-- Index for filtering bulletins by batch
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_batch_id ON bulletins_soins(batch_id);
