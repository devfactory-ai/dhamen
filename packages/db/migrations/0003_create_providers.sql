-- Migration: Create providers table
-- Description: Healthcare providers (pharmacies, doctors, labs, clinics)

CREATE TABLE IF NOT EXISTS providers (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('pharmacist', 'doctor', 'lab', 'clinic')),
  name TEXT NOT NULL,
  license_no TEXT NOT NULL UNIQUE,
  speciality TEXT,
  address TEXT NOT NULL,
  city TEXT NOT NULL,
  lat REAL,
  lng REAL,
  phone TEXT,
  email TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_providers_type ON providers(type);
CREATE INDEX IF NOT EXISTS idx_providers_city ON providers(city);
CREATE INDEX IF NOT EXISTS idx_providers_is_active ON providers(is_active);
CREATE INDEX IF NOT EXISTS idx_providers_license ON providers(license_no);
