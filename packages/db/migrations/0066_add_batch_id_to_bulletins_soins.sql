-- Add batch_id column to bulletins_soins to link bulletins to batches
ALTER TABLE bulletins_soins ADD COLUMN batch_id TEXT REFERENCES bulletin_batches(id);

-- Index for filtering bulletins by batch
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_batch_id ON bulletins_soins(batch_id);
