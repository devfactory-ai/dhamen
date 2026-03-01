-- Migration: Create virtual cards table
-- Created: 2024-03-XX
-- Description: Digital adherent cards with QR codes for instant verification

-- Virtual cards table
CREATE TABLE IF NOT EXISTS virtual_cards (
    id TEXT PRIMARY KEY,
    adherent_id TEXT NOT NULL REFERENCES adherents(id),
    card_number TEXT NOT NULL UNIQUE,
    qr_code_token TEXT NOT NULL UNIQUE,
    qr_code_secret TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'revoked', 'expired')),
    issued_at TEXT DEFAULT (datetime('now')),
    expires_at TEXT NOT NULL,
    last_used_at TEXT,
    usage_count INTEGER DEFAULT 0,
    device_fingerprint TEXT,
    created_at TEXT DEFAULT (datetime('now')),
    updated_at TEXT DEFAULT (datetime('now'))
);

-- Card verification logs
CREATE TABLE IF NOT EXISTS card_verifications (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES virtual_cards(id),
    provider_id TEXT REFERENCES providers(id),
    verification_type TEXT NOT NULL CHECK (verification_type IN ('qr_scan', 'card_number', 'nfc', 'api')),
    status TEXT NOT NULL CHECK (status IN ('success', 'failed', 'expired', 'revoked')),
    ip_address TEXT,
    user_agent TEXT,
    location_lat REAL,
    location_lng REAL,
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
);

-- Card events (issued, renewed, suspended, etc.)
CREATE TABLE IF NOT EXISTS card_events (
    id TEXT PRIMARY KEY,
    card_id TEXT NOT NULL REFERENCES virtual_cards(id),
    event_type TEXT NOT NULL CHECK (event_type IN ('issued', 'renewed', 'suspended', 'reactivated', 'revoked', 'expired', 'used')),
    reason TEXT,
    performed_by TEXT REFERENCES users(id),
    metadata TEXT DEFAULT '{}',
    created_at TEXT DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_virtual_cards_adherent ON virtual_cards(adherent_id);
CREATE INDEX IF NOT EXISTS idx_virtual_cards_card_number ON virtual_cards(card_number);
CREATE INDEX IF NOT EXISTS idx_virtual_cards_qr_token ON virtual_cards(qr_code_token);
CREATE INDEX IF NOT EXISTS idx_virtual_cards_status ON virtual_cards(status);
CREATE INDEX IF NOT EXISTS idx_virtual_cards_expires ON virtual_cards(expires_at);

CREATE INDEX IF NOT EXISTS idx_card_verifications_card ON card_verifications(card_id);
CREATE INDEX IF NOT EXISTS idx_card_verifications_provider ON card_verifications(provider_id);
CREATE INDEX IF NOT EXISTS idx_card_verifications_created ON card_verifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_card_events_card ON card_events(card_id);
CREATE INDEX IF NOT EXISTS idx_card_events_type ON card_events(event_type);
