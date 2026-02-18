-- Migration: Create adherents table
-- Description: Insured persons covered by health insurance contracts

CREATE TABLE IF NOT EXISTS adherents (
  id TEXT PRIMARY KEY,
  national_id_encrypted TEXT NOT NULL,
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  date_of_birth TEXT NOT NULL,
  gender TEXT CHECK (gender IN ('M', 'F')),
  phone_encrypted TEXT,
  email TEXT,
  address TEXT,
  city TEXT,
  lat REAL,
  lng REAL,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  deleted_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_adherents_national_id ON adherents(national_id_encrypted);
CREATE INDEX IF NOT EXISTS idx_adherents_city ON adherents(city);
CREATE INDEX IF NOT EXISTS idx_adherents_name ON adherents(last_name, first_name);
