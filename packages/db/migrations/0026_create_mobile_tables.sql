-- Migration: Create mobile app support tables
-- Created: 2024-03-XX

-- Adherent devices table
CREATE TABLE IF NOT EXISTS adherent_devices (
    id TEXT PRIMARY KEY,
    adherent_id TEXT NOT NULL REFERENCES adherents(id),
    device_id TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('ios', 'android')),
    os_version TEXT,
    app_version TEXT,
    push_token TEXT,
    biometric_public_key TEXT,
    is_active INTEGER DEFAULT 1,
    last_login_at TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(adherent_id, device_id)
);

-- Add mobile auth columns to adherents
-- Note: Run these as separate statements if column already exists
-- ALTER TABLE adherents ADD COLUMN pin_hash TEXT;
-- ALTER TABLE adherents ADD COLUMN biometric_enabled INTEGER DEFAULT 0;
-- ALTER TABLE adherents ADD COLUMN profile_photo_url TEXT;

-- Beneficiaries table (for dependents)
CREATE TABLE IF NOT EXISTS beneficiaries (
    id TEXT PRIMARY KEY,
    adherent_id TEXT NOT NULL REFERENCES adherents(id),
    full_name TEXT NOT NULL,
    relationship TEXT NOT NULL CHECK (relationship IN ('spouse', 'child', 'parent', 'other')),
    birth_date TEXT,
    gender TEXT CHECK (gender IN ('male', 'female')),
    cin TEXT,
    is_primary INTEGER DEFAULT 0,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    deleted_at TEXT
);

-- Claim documents table
CREATE TABLE IF NOT EXISTS claim_documents (
    id TEXT PRIMARY KEY,
    claim_id TEXT NOT NULL REFERENCES claims(id),
    type TEXT NOT NULL CHECK (type IN ('prescription', 'invoice', 'report', 'other')),
    filename TEXT NOT NULL,
    url TEXT NOT NULL,
    size_bytes INTEGER,
    mime_type TEXT,
    uploaded_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
);

-- Provider conventions (network agreements)
CREATE TABLE IF NOT EXISTS provider_conventions (
    id TEXT PRIMARY KEY,
    provider_id TEXT NOT NULL REFERENCES providers(id),
    insurer_id TEXT NOT NULL REFERENCES insurers(id),
    is_network INTEGER DEFAULT 1,
    discount_percent REAL DEFAULT 0,
    effective_date TEXT NOT NULL,
    expiry_date TEXT,
    terms TEXT, -- JSON
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now')),
    UNIQUE(provider_id, insurer_id)
);

-- Alerts table (for dashboard)
CREATE TABLE IF NOT EXISTS alerts (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    data TEXT, -- JSON
    insurer_id TEXT REFERENCES insurers(id),
    acknowledged_at TEXT,
    acknowledged_by TEXT REFERENCES users(id),
    created_at TEXT DEFAULT (datetime('now'))
);

-- Anomaly acknowledgments
CREATE TABLE IF NOT EXISTS anomaly_acknowledgments (
    id TEXT PRIMARY KEY,
    anomaly_id TEXT NOT NULL,
    acknowledged_by TEXT NOT NULL REFERENCES users(id),
    resolution TEXT NOT NULL,
    action TEXT NOT NULL CHECK (action IN ('resolved', 'false_positive', 'deferred')),
    created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_adherent_devices_adherent ON adherent_devices(adherent_id);
CREATE INDEX IF NOT EXISTS idx_adherent_devices_device ON adherent_devices(device_id);
CREATE INDEX IF NOT EXISTS idx_adherent_devices_push ON adherent_devices(push_token) WHERE push_token IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_beneficiaries_adherent ON beneficiaries(adherent_id);
CREATE INDEX IF NOT EXISTS idx_claim_documents_claim ON claim_documents(claim_id);
CREATE INDEX IF NOT EXISTS idx_provider_conventions_provider ON provider_conventions(provider_id);
CREATE INDEX IF NOT EXISTS idx_provider_conventions_insurer ON provider_conventions(insurer_id);
CREATE INDEX IF NOT EXISTS idx_alerts_insurer ON alerts(insurer_id);
CREATE INDEX IF NOT EXISTS idx_alerts_severity ON alerts(severity);
CREATE INDEX IF NOT EXISTS idx_alerts_unacknowledged ON alerts(acknowledged_at) WHERE acknowledged_at IS NULL;
