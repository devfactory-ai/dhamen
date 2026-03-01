-- Migration: Create webhook tables
-- Created: 2024-03-XX

-- Webhook endpoints table
CREATE TABLE IF NOT EXISTS webhook_endpoints (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL,
    secret TEXT NOT NULL,
    events TEXT NOT NULL, -- JSON array
    insurer_id TEXT REFERENCES insurers(id),
    provider_id TEXT REFERENCES providers(id),
    is_active INTEGER DEFAULT 1,
    retry_policy TEXT NOT NULL, -- JSON
    headers TEXT, -- JSON
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Webhook deliveries table
CREATE TABLE IF NOT EXISTS webhook_deliveries (
    id TEXT PRIMARY KEY,
    endpoint_id TEXT NOT NULL REFERENCES webhook_endpoints(id),
    event TEXT NOT NULL,
    payload TEXT NOT NULL, -- JSON
    attempt INTEGER DEFAULT 0,
    status TEXT NOT NULL CHECK (status IN ('pending', 'success', 'failed', 'retrying')),
    status_code INTEGER,
    response_body TEXT,
    error TEXT,
    next_retry_at TEXT,
    sent_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_insurer ON webhook_endpoints(insurer_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_provider ON webhook_endpoints(provider_id);
CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_active ON webhook_endpoints(is_active);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_status ON webhook_deliveries(status);
CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_retry ON webhook_deliveries(next_retry_at) WHERE status = 'retrying';
