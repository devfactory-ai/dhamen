-- Migration: Create contract templates and versioning tables
-- Created: 2024-03-XX

-- Contract templates table
CREATE TABLE IF NOT EXISTS contract_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    insurer_id TEXT NOT NULL REFERENCES insurers(id),
    type TEXT NOT NULL CHECK (type IN ('individual', 'group', 'corporate')),
    category TEXT NOT NULL CHECK (category IN ('basic', 'standard', 'premium', 'vip')),
    coverage_rules TEXT NOT NULL, -- JSON array
    exclusions TEXT NOT NULL, -- JSON array
    waiting_periods TEXT NOT NULL, -- JSON array
    limits TEXT NOT NULL, -- JSON { annual, perEvent, perCareType, lifetime }
    pricing TEXT NOT NULL, -- JSON { basePremium, currency, frequency, ageFactors, discounts }
    documents TEXT NOT NULL DEFAULT '[]', -- JSON array
    is_active INTEGER DEFAULT 0,
    version INTEGER DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Contract versions table (for history)
CREATE TABLE IF NOT EXISTS contract_versions (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    changes TEXT NOT NULL, -- JSON array of changes
    effective_date TEXT NOT NULL,
    created_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now')),
    data TEXT NOT NULL -- JSON snapshot of full template
);

-- Contract renewals configuration
CREATE TABLE IF NOT EXISTS contract_renewals (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL UNIQUE REFERENCES contracts(id),
    auto_renew INTEGER DEFAULT 0,
    renewal_period_days INTEGER DEFAULT 365,
    notification_days TEXT NOT NULL DEFAULT '[30, 15, 7]', -- JSON array
    price_adjustment TEXT DEFAULT 'fixed' CHECK (price_adjustment IN ('fixed', 'indexed', 'manual')),
    index_rate REAL,
    max_increase_percent REAL,
    requires_approval INTEGER DEFAULT 0,
    last_notification_sent TEXT,
    next_renewal_date TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Renewal notifications log
CREATE TABLE IF NOT EXISTS renewal_notifications (
    id TEXT PRIMARY KEY,
    contract_id TEXT NOT NULL REFERENCES contracts(id),
    type TEXT NOT NULL CHECK (type IN ('upcoming', 'reminder', 'final', 'expired')),
    sent_at TEXT NOT NULL,
    channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'push')),
    recipient_id TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contract_templates_insurer ON contract_templates(insurer_id);
CREATE INDEX IF NOT EXISTS idx_contract_templates_type ON contract_templates(type);
CREATE INDEX IF NOT EXISTS idx_contract_templates_category ON contract_templates(category);
CREATE INDEX IF NOT EXISTS idx_contract_templates_active ON contract_templates(is_active);
CREATE INDEX IF NOT EXISTS idx_contract_versions_contract ON contract_versions(contract_id);
CREATE INDEX IF NOT EXISTS idx_contract_versions_version ON contract_versions(contract_id, version);
CREATE INDEX IF NOT EXISTS idx_contract_renewals_date ON contract_renewals(next_renewal_date);
CREATE INDEX IF NOT EXISTS idx_renewal_notifications_contract ON renewal_notifications(contract_id);
