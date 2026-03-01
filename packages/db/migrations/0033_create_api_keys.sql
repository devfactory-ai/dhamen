-- Migration: Create API keys table for public API
-- Created: 2024-03-XX

-- API keys table
CREATE TABLE IF NOT EXISTS api_keys (
    id TEXT PRIMARY KEY,
    key TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK (type IN ('read', 'write', 'full')),
    insurer_id TEXT REFERENCES insurers(id),
    provider_id TEXT REFERENCES providers(id),
    rate_limit TEXT NOT NULL, -- JSON { requests: number, window: number }
    scopes TEXT NOT NULL, -- JSON array
    is_active INTEGER DEFAULT 1,
    expires_at TEXT,
    last_used_at TEXT,
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_api_keys_key ON api_keys(key);
CREATE INDEX IF NOT EXISTS idx_api_keys_insurer ON api_keys(insurer_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_provider ON api_keys(provider_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_active ON api_keys(is_active);
