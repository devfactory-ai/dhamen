-- Fix: allow 'archived' status in bulletin_batches
-- SQLite doesn't support ALTER CHECK, so we recreate the table

CREATE TABLE IF NOT EXISTS bulletin_batches_new (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open' CHECK(status IN ('open', 'closed', 'exported', 'archived')),
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    exported_at TEXT,
    company_id TEXT REFERENCES companies(id),
    FOREIGN KEY (created_by) REFERENCES users(id)
);

INSERT OR IGNORE INTO bulletin_batches_new SELECT * FROM bulletin_batches;

DROP TABLE bulletin_batches;

ALTER TABLE bulletin_batches_new RENAME TO bulletin_batches;

CREATE INDEX IF NOT EXISTS idx_bulletin_batches_created_by ON bulletin_batches(created_by);
CREATE INDEX IF NOT EXISTS idx_bulletin_batches_status ON bulletin_batches(status);
