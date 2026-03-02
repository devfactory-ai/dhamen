-- Create bulletin_batches table for agent batch management
CREATE TABLE IF NOT EXISTS bulletin_batches (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed', 'exported')),
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    exported_at TEXT,
    FOREIGN KEY (created_by) REFERENCES users(id)
);

-- Add batch_id to bulletins_soins if not exists
-- Note: This column may already exist; this is for safety
-- ALTER TABLE bulletins_soins ADD COLUMN batch_id TEXT REFERENCES bulletin_batches(id);

-- Add created_by to bulletins_soins if not exists
-- ALTER TABLE bulletins_soins ADD COLUMN created_by TEXT REFERENCES users(id);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_bulletin_batches_created_by ON bulletin_batches(created_by);
CREATE INDEX IF NOT EXISTS idx_bulletin_batches_status ON bulletin_batches(status);
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_batch_id ON bulletins_soins(batch_id);
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_created_by ON bulletins_soins(created_by);
