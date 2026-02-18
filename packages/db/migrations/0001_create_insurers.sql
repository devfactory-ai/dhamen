-- Migration: Create insurers table
-- Description: Insurance companies managing health coverage

PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS insurers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  tax_id TEXT,
  address TEXT,
  phone TEXT,
  email TEXT,
  config_json TEXT DEFAULT '{}',
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_insurers_code ON insurers(code);
CREATE INDEX IF NOT EXISTS idx_insurers_is_active ON insurers(is_active);
