-- Create bulletin_files table for per-file hash tracking
-- + add combined_hash column to bulletins_soins for exact bulletin-level dedup

CREATE TABLE IF NOT EXISTS bulletin_files (
  id TEXT PRIMARY KEY,
  bulletin_id TEXT NOT NULL REFERENCES bulletins_soins(id) ON DELETE CASCADE,
  file_index INTEGER NOT NULL DEFAULT 0,
  file_name TEXT,
  file_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(bulletin_id, file_hash)
);

CREATE INDEX IF NOT EXISTS idx_bulletin_files_hash ON bulletin_files(file_hash);
CREATE INDEX IF NOT EXISTS idx_bulletin_files_bulletin ON bulletin_files(bulletin_id);

-- Add combined_hash to bulletins_soins (sorted hashes of all files, re-hashed)
ALTER TABLE bulletins_soins ADD COLUMN combined_hash TEXT;
CREATE INDEX IF NOT EXISTS idx_bulletins_soins_combined_hash ON bulletins_soins(combined_hash);
