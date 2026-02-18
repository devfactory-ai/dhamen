-- Migration: Create conventions table
-- Description: Agreements between insurers and providers with tariff schedules

CREATE TABLE IF NOT EXISTS conventions (
  id TEXT PRIMARY KEY,
  insurer_id TEXT NOT NULL REFERENCES insurers(id),
  provider_id TEXT NOT NULL REFERENCES providers(id),
  bareme_json TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  UNIQUE(insurer_id, provider_id)
);

CREATE INDEX IF NOT EXISTS idx_conventions_insurer ON conventions(insurer_id);
CREATE INDEX IF NOT EXISTS idx_conventions_provider ON conventions(provider_id);
CREATE INDEX IF NOT EXISTS idx_conventions_active ON conventions(is_active);
