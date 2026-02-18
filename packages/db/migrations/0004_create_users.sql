-- Migration: Create users table
-- Description: System users with role-based access

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN (
    'ADMIN', 'INSURER_ADMIN', 'INSURER_AGENT',
    'PHARMACIST', 'DOCTOR', 'LAB_MANAGER', 'CLINIC_ADMIN'
  )),
  provider_id TEXT REFERENCES providers(id),
  insurer_id TEXT REFERENCES insurers(id),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  phone TEXT,
  mfa_enabled INTEGER DEFAULT 0,
  mfa_secret TEXT,
  last_login_at TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_provider ON users(provider_id);
CREATE INDEX IF NOT EXISTS idx_users_insurer ON users(insurer_id);
CREATE INDEX IF NOT EXISTS idx_users_is_active ON users(is_active);
