-- Migration: Create batch jobs table
-- Created: 2024-03-XX

-- Batch jobs table
CREATE TABLE IF NOT EXISTS batch_jobs (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
    params TEXT NOT NULL, -- JSON
    progress TEXT NOT NULL, -- JSON { total, processed, succeeded, failed }
    results TEXT, -- JSON array
    errors TEXT, -- JSON array
    created_by TEXT NOT NULL REFERENCES users(id),
    started_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_batch_jobs_type ON batch_jobs(type);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_status ON batch_jobs(status);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_created_by ON batch_jobs(created_by);
CREATE INDEX IF NOT EXISTS idx_batch_jobs_created_at ON batch_jobs(created_at DESC);
