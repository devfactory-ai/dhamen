-- Migration: Create payment orders tables
-- Created: 2024-03-XX

-- Payment orders table
CREATE TABLE IF NOT EXISTS payment_orders (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('provider_payment', 'refund')),
    status TEXT NOT NULL CHECK (status IN ('pending', 'processing', 'completed', 'failed', 'cancelled', 'refunded')),
    amount INTEGER NOT NULL, -- Amount in millimes
    currency TEXT NOT NULL DEFAULT 'TND',
    provider_id TEXT NOT NULL,
    provider_type TEXT NOT NULL CHECK (provider_type IN ('bank_transfer', 'mobile_money', 'card')),
    beneficiary TEXT NOT NULL, -- JSON
    reference TEXT NOT NULL,
    description TEXT,
    bordereau_id TEXT REFERENCES bordereaux(id),
    insurer_id TEXT REFERENCES insurers(id),
    metadata TEXT, -- JSON
    external_id TEXT,
    external_status TEXT,
    error_code TEXT,
    error_message TEXT,
    initiated_at TEXT NOT NULL,
    processed_at TEXT,
    completed_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Payment activity logs
CREATE TABLE IF NOT EXISTS payment_activity_logs (
    id TEXT PRIMARY KEY,
    order_id TEXT NOT NULL REFERENCES payment_orders(id),
    action TEXT NOT NULL,
    details TEXT NOT NULL, -- JSON
    created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payment_orders_status ON payment_orders(status);
CREATE INDEX IF NOT EXISTS idx_payment_orders_insurer ON payment_orders(insurer_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_bordereau ON payment_orders(bordereau_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_reference ON payment_orders(reference);
CREATE INDEX IF NOT EXISTS idx_payment_orders_external ON payment_orders(external_id);
CREATE INDEX IF NOT EXISTS idx_payment_orders_created ON payment_orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payment_activity_order ON payment_activity_logs(order_id);
